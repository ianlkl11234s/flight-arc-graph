/**
 * 上傳航班資料到 S3 flight-arc/ 資料夾
 *
 * 用法：
 *   npm run s3:upload                    # 上傳兩種資料（若存在）
 *   npm run s3:upload -- --tracks        # 只上傳 FR24 完整軌跡
 *   npm run s3:upload -- --airspace      # 只上傳 AirSpace Scan
 *
 * S3 結構：
 *   flight-arc/tracks/manifest.json
 *   flight-arc/tracks/latest.json
 *   flight-arc/tracks/YYYY/MM/DD/data.json
 *   flight-arc/airspace/manifest.json
 *   flight-arc/airspace/latest.json
 *   flight-arc/airspace/YYYY/MM/DD/data.json
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BUCKET = process.env.S3_BUCKET ?? "migu-gis-data-collector";
const REGION = process.env.S3_REGION ?? "ap-southeast-2";
const BASE_PREFIX = "flight-arc";

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

interface Flight {
  fr24_id: string;
  origin_icao: string;
  dest_icao: string;
  dep_time: number;
  arr_time: number;
  path: number[][];
  [key: string]: unknown;
}

interface DayGroup {
  date: string;
  flights: Flight[];
  airports: Set<string>;
}

function getFlightDate(f: Flight): string {
  const ts = f.dep_time > 0 ? f.dep_time : (f.path[0]?.[3] ?? 0);
  if (ts === 0) return "unknown";
  const d = new Date(ts * 1000);
  return d.toISOString().slice(0, 10);
}

function groupByDate(flights: Flight[]): Map<string, DayGroup> {
  const groups = new Map<string, DayGroup>();
  for (const f of flights) {
    const date = getFlightDate(f);
    if (date === "unknown") continue;
    if (!groups.has(date)) {
      groups.set(date, { date, flights: [], airports: new Set() });
    }
    const g = groups.get(date)!;
    g.flights.push(f);
    if (f.origin_icao?.startsWith("RC")) g.airports.add(f.origin_icao);
    if (f.dest_icao?.startsWith("RC")) g.airports.add(f.dest_icao);
  }
  return groups;
}

async function upload(key: string, body: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/json",
    }),
  );
  console.log(`  ✓ s3://${BUCKET}/${key} (${(body.length / 1024).toFixed(0)} KB)`);
}

async function uploadSource(
  label: string,
  prefix: string,
  localPath: string,
): Promise<void> {
  if (!existsSync(localPath)) {
    console.log(`\n⚠️  ${label}: ${localPath} 不存在，跳過`);
    return;
  }

  console.log(`\n=== ${label} ===`);
  console.log(`Reading ${localPath}...`);
  const raw = readFileSync(localPath, "utf-8");
  const flights: Flight[] = JSON.parse(raw);
  console.log(`Total flights: ${flights.length}`);

  const groups = groupByDate(flights);
  const dates = [...groups.keys()].sort();
  console.log(`Dates: ${dates.join(", ")}\n`);

  // 上傳按天拆分的資料
  for (const date of dates) {
    const g = groups.get(date)!;
    const [y, m, d] = date.split("-");
    const key = `${prefix}/${y}/${m}/${d}/data.json`;
    const body = JSON.stringify(g.flights);
    console.log(`[${date}] ${g.flights.length} flights, airports: ${[...g.airports].sort().join(", ")}`);
    await upload(key, body);
  }

  // 上傳完整合併檔（容器部署用）
  console.log(`\nUploading latest.json (full merged file)...`);
  await upload(`${prefix}/latest.json`, raw);

  // 產生 manifest
  const manifest = {
    lastUpdated: new Date().toISOString(),
    totalFlights: flights.length,
    dates: dates.map((date) => {
      const g = groups.get(date)!;
      return {
        date,
        flightCount: g.flights.length,
        airports: [...g.airports].sort(),
      };
    }),
  };
  await upload(`${prefix}/manifest.json`, JSON.stringify(manifest, null, 2));
}

/**
 * 列出 S3 prefix 下所有物件的 key → size 映射
 */
async function listS3Objects(prefix: string): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  let continuationToken: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const obj of res.Contents ?? []) {
      if (obj.Key && obj.Size != null) result.set(obj.Key, obj.Size);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return result;
}

/**
 * 上傳 split tracks 目錄結構（airports/*.jsonl + regions/*.jsonl + manifest.json）
 * --force 全量上傳，否則增量（比對檔案大小）
 */
async function uploadSplitTracks(prefix: string, tracksDir: string, force: boolean): Promise<void> {
  console.log(`\n=== Split Tracks Upload (${force ? "full" : "incremental"}) ===`);
  console.log(`Source: ${tracksDir}`);

  // 增量模式：先取 S3 現有檔案大小
  let s3Objects = new Map<string, number>();
  if (!force) {
    console.log("Listing S3 objects for diff...");
    s3Objects = await listS3Objects(prefix);
    console.log(`S3 existing: ${s3Objects.size} files\n`);
  }

  let uploaded = 0;
  let skipped = 0;

  const uploadIfChanged = async (key: string, localPath: string) => {
    const localSize = statSync(localPath).size;
    if (!force && s3Objects.has(key) && s3Objects.get(key) === localSize) {
      skipped++;
      return;
    }
    const body = readFileSync(localPath, "utf-8");
    await upload(key, body);
    uploaded++;
  };

  // manifest.json（總是上傳）
  const manifestPath = resolve(tracksDir, "manifest.json");
  if (existsSync(manifestPath)) {
    const body = readFileSync(manifestPath, "utf-8");
    await upload(`${prefix}/manifest.json`, body);
    uploaded++;
  }

  // airports/*.jsonl
  const airportsDir = resolve(tracksDir, "airports");
  if (existsSync(airportsDir)) {
    const files = readdirSync(airportsDir).filter((f) => f.endsWith(".jsonl"));
    console.log(`\nAirports: ${files.length} files`);
    for (const file of files) {
      await uploadIfChanged(`${prefix}/airports/${file}`, resolve(airportsDir, file));
    }
  }

  // regions/*.jsonl
  const regionsDir = resolve(tracksDir, "regions");
  if (existsSync(regionsDir)) {
    const files = readdirSync(regionsDir).filter((f) => f.endsWith(".jsonl"));
    console.log(`\nRegions: ${files.length} files`);
    for (const file of files) {
      await uploadIfChanged(`${prefix}/regions/${file}`, resolve(regionsDir, file));
    }
  }

  console.log(`\n📊 Uploaded: ${uploaded}, Skipped (unchanged): ${skipped}`);
}

async function main() {
  const args = process.argv.slice(2);
  const tracksOnly = args.includes("--tracks");
  const airspaceOnly = args.includes("--airspace");
  const uploadBoth = !tracksOnly && !airspaceOnly;

  const force = args.includes("--force");

  if (uploadBoth || tracksOnly) {
    const tracksDir = resolve(__dirname, "../public/tracks");
    const splitExists = existsSync(resolve(tracksDir, "airports"));

    if (splitExists) {
      // 優先用 split 目錄（不讀巨大的 aviation_data.json）
      await uploadSplitTracks(`${BASE_PREFIX}/tracks`, tracksDir, force);
    } else {
      await uploadSource(
        "FR24 Tracks",
        `${BASE_PREFIX}/tracks`,
        resolve(tracksDir, "aviation_data.json"),
      );
    }
  }

  if (uploadBoth || airspaceOnly) {
    await uploadSource(
      "AirSpace Scan",
      `${BASE_PREFIX}/airspace`,
      resolve(__dirname, "../public/airspace/aviation_data.json"),
    );
  }

  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
