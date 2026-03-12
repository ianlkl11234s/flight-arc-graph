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

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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

async function main() {
  const args = process.argv.slice(2);
  const tracksOnly = args.includes("--tracks");
  const airspaceOnly = args.includes("--airspace");
  const uploadBoth = !tracksOnly && !airspaceOnly;

  if (uploadBoth || tracksOnly) {
    await uploadSource(
      "FR24 Tracks",
      `${BASE_PREFIX}/tracks`,
      resolve(__dirname, "../public/tracks/aviation_data.json"),
    );
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
