/**
 * upload-split-to-s3.ts
 * 上傳分拆後的 tracks/airports/ 底下所有 JSONL（flat fallback + daily shards）、
 * tracks/regions/*.jsonl + manifest 到 S3
 *
 * **增量上傳**：對照 scripts/upload-state.json 的 mtime，只上傳本地檔案
 * 修改時間晚於上次上傳的檔案。manifest / regions / airspace manifest 永遠重傳。
 *
 * Usage:
 *   npx tsx scripts/upload-split-to-s3.ts          # 增量
 *   npx tsx scripts/upload-split-to-s3.ts --force  # 全部重傳
 */

import {
  readFileSync,
  readdirSync,
  existsSync,
  statSync,
  writeFileSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BUCKET = process.env.S3_BUCKET ?? "migu-gis-data-collector";
const REGION = process.env.S3_REGION ?? "ap-southeast-2";
const S3_PREFIX = "flight-arc";
const STATE_FILE = resolve(__dirname, "upload-state.json");
const FORCE = process.argv.includes("--force");

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

// ── State ──────────────────────────────────────────────

type UploadState = Record<string, number>; // s3Key → local mtime (ms)

function loadState(): UploadState {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveState(state: UploadState) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const state = loadState();

// ── Counters ───────────────────────────────────────────

let uploaded = 0;
let skipped = 0;
let totalBytes = 0;

async function rawUpload(localPath: string, s3Key: string) {
  const body = readFileSync(localPath);
  const contentType = s3Key.endsWith(".json")
    ? "application/json"
    : "application/x-ndjson";
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
    }),
  );
  totalBytes += body.length;
  state[s3Key] = statSync(localPath).mtimeMs;
  uploaded++;
  // 斷點續傳：每 50 檔落盤一次 state，中斷後重跑只補殘餘（多 GB 上傳必備）
  if (uploaded % 50 === 0) saveState(state);
}

/** 上傳前比對 mtime，未變動就跳過 */
async function uploadIfChanged(localPath: string, s3Key: string) {
  const mtime = statSync(localPath).mtimeMs;
  if (!FORCE && state[s3Key] && mtime <= state[s3Key]) {
    skipped++;
    return;
  }
  await rawUpload(localPath, s3Key);
}

/** 永遠重傳（小檔，每次都要新版） */
async function uploadAlways(localPath: string, s3Key: string) {
  await rawUpload(localPath, s3Key);
}

/** airports 目錄含 {ICAO}.jsonl 與 {ICAO}/{YYYY-MM-DD}.jsonl，需遞迴保留相對路徑。 */
function listJsonlFiles(dir: string, prefix = ""): { localPath: string; relativePath: string }[] {
  const files: { localPath: string; relativePath: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const localPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonlFiles(localPath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push({ localPath, relativePath });
    }
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

// ── Main ───────────────────────────────────────────────

async function main() {
  const tracksDir = resolve(__dirname, "../public/tracks");
  const airspaceDir = resolve(__dirname, "../public/airspace");
  const startedAt = Date.now();

  if (FORCE) {
    console.log("⚠️  --force: 全部重傳，忽略 upload-state.json\n");
  }

  // 1. tracks/airports/**/*.jsonl（flat fallback + daily shards）— 增量
  const airportsDir = resolve(tracksDir, "airports");
  if (existsSync(airportsDir)) {
    const files = listJsonlFiles(airportsDir);
    console.log(`\n=== Tracks Airports (${files.length} files, incremental) ===`);
    const startUploaded = uploaded;
    const startSkipped = skipped;
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      await uploadIfChanged(
        file.localPath,
        `${S3_PREFIX}/tracks/airports/${file.relativePath}`,
      );
      // 每處理 200 個檔印一次進度
      if ((i + 1) % 200 === 0) {
        const u = uploaded - startUploaded;
        const s = skipped - startSkipped;
        console.log(`  ... ${i + 1}/${files.length} (uploaded=${u} skipped=${s})`);
      }
    }
    const u = uploaded - startUploaded;
    const s = skipped - startSkipped;
    console.log(`  ✓ done: uploaded=${u} skipped=${s}`);
  }

  // 2. tracks/regions/*.jsonl — 一定重傳（split-tracks 每次重產）
  const regionsDir = resolve(tracksDir, "regions");
  if (existsSync(regionsDir)) {
    const files = readdirSync(regionsDir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort();
    console.log(`\n=== Tracks Regions (${files.length} files) ===`);
    for (const file of files) {
      await uploadAlways(
        resolve(regionsDir, file),
        `${S3_PREFIX}/tracks/regions/${file}`,
      );
      console.log(`  ✓ ${file}`);
    }
  }

  // 3. manifest 最後發布：先確保所有新 daily / region object 已存在，
  // 避免線上 client 在上傳窗口讀到新 metadata 卻命中舊 shard。
  console.log("\n=== Tracks Manifest (publish last) ===");
  await uploadAlways(
    resolve(tracksDir, "manifest.json"),
    `${S3_PREFIX}/tracks/manifest.json`,
  );

  // 4. airspace — 日檔先上傳，manifest 同樣最後發布
  if (existsSync(resolve(airspaceDir, "manifest.json"))) {
    console.log("\n=== Airspace ===");
    const daysDir = resolve(airspaceDir, "days");
    if (existsSync(daysDir)) {
      const files = readdirSync(daysDir)
        .filter((f) => f.endsWith(".jsonl"))
        .sort();
      const startUploaded = uploaded;
      const startSkipped = skipped;
      for (const file of files) {
        await uploadIfChanged(
          resolve(daysDir, file),
          `${S3_PREFIX}/airspace/days/${file}`,
        );
      }
      console.log(
        `  airspace days: uploaded=${uploaded - startUploaded} skipped=${skipped - startSkipped}`,
      );
    }
    await uploadAlways(
      resolve(airspaceDir, "manifest.json"),
      `${S3_PREFIX}/airspace/manifest.json`,
    );
  }

  // Save state
  saveState(state);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const mb = (totalBytes / 1024 / 1024).toFixed(1);
  console.log("\n✅ Done!");
  console.log(
    `   uploaded=${uploaded} skipped=${skipped} | ${mb} MB | ${elapsed}s`,
  );
  console.log(`   state: ${STATE_FILE}`);
}

main().catch(console.error);
