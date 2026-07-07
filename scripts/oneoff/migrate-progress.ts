/**
 * migrate-progress.ts
 *
 * 將 322MB 的 scripts/track-progress.json 瘦身為兩個 NDJSON：
 *   - scripts/track-done.ndjson    (每行一個 fr24_id)
 *   - scripts/track-failed.ndjson  (每行一個 fr24_id)
 *
 * 同時驗證舊 progress.completed 的每個 output 都已出現在對應的
 * public/tracks/airports/{ICAO}.jsonl 中，缺漏則 append 補上（不丟資料）。
 *
 * Usage:
 *   NODE_OPTIONS='--max-old-space-size=8192' npx tsx scripts/oneoff/migrate-progress.ts
 */

import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  existsSync,
  copyFileSync,
  statSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PROGRESS_FILE = resolve(ROOT, "scripts/track-progress.json");
const BACKUP_FILE = resolve(ROOT, "scripts/track-progress.json.bak");
const AIRPORTS_DIR = resolve(ROOT, "public/tracks/airports");
const DONE_NDJSON = resolve(ROOT, "scripts/track-done.ndjson");
const FAILED_NDJSON = resolve(ROOT, "scripts/track-failed.ndjson");

interface FlightOutput {
  fr24_id: string;
  callsign: string;
  registration: string;
  aircraft_type: string;
  origin_icao: string;
  origin_iata: string;
  dest_icao: string;
  dest_iata: string;
  dep_time: number;
  arr_time: number;
  status: string;
  trail_points: number;
  path: number[][];
}

function reducePrecision(path: number[][]): [number, number, number, number][] {
  return path.map((p) => [
    +p[0]!.toFixed(4),
    +p[1]!.toFixed(4),
    Math.round(p[2]!),
    p[3]!,
  ] as [number, number, number, number]);
}

async function main() {
  console.log("=== migrate-progress ===\n");

  if (!existsSync(PROGRESS_FILE)) {
    console.error(`❌ 找不到 ${PROGRESS_FILE}`);
    process.exit(1);
  }

  // 1. 備份 ──────────────────────────────────────
  if (!existsSync(BACKUP_FILE)) {
    console.log("📦 備份 track-progress.json → .bak ...");
    copyFileSync(PROGRESS_FILE, BACKUP_FILE);
    const size = statSync(BACKUP_FILE).size;
    console.log(`   備份完成: ${(size / 1024 / 1024).toFixed(1)} MB\n`);
  } else {
    console.log("📦 .bak 已存在，跳過備份\n");
  }

  // 2. 讀舊 progress ─────────────────────────────
  console.log("📖 載入 track-progress.json...");
  const t0 = Date.now();
  const raw = readFileSync(PROGRESS_FILE, "utf-8");
  console.log(`   readFileSync: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const t1 = Date.now();
  const progress = JSON.parse(raw) as {
    completed: Record<string, FlightOutput>;
    failed: string[];
  };
  console.log(`   JSON.parse:   ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  const completedIds = Object.keys(progress.completed);
  const completedCount = completedIds.length;
  const failedCount = (progress.failed ?? []).length;
  console.log(`   completed: ${completedCount} 筆`);
  console.log(`   failed:    ${failedCount} 筆\n`);

  // 3. 掃 JSONL，建立 fr24_id -> Set<icao> ───────
  console.log("🔍 掃描現有 JSONL...");
  const jsonlIndex = new Map<string, Set<string>>();
  let jsonlFiles = 0;
  let jsonlLines = 0;
  for (const file of readdirSync(AIRPORTS_DIR)) {
    if (!file.endsWith(".jsonl")) continue;
    const icao = file.replace(".jsonl", "");
    const content = readFileSync(join(AIRPORTS_DIR, file), "utf-8");
    const lines = content.split("\n").filter(Boolean);
    jsonlFiles++;
    jsonlLines += lines.length;
    for (const line of lines) {
      try {
        const f = JSON.parse(line);
        if (!f.fr24_id) continue;
        let set = jsonlIndex.get(f.fr24_id);
        if (!set) {
          set = new Set();
          jsonlIndex.set(f.fr24_id, set);
        }
        set.add(icao);
      } catch {
        /* skip bad line */
      }
    }
  }
  console.log(
    `   掃完: ${jsonlFiles} 檔案, ${jsonlLines} 行, ${jsonlIndex.size} 個唯一 fr24_id\n`,
  );

  // 4. 比對 completed 與 JSONL ────────────────────
  console.log("🔗 比對 completed vs JSONL...");
  const toAppend = new Map<string, FlightOutput[]>();
  let fullyMatched = 0;
  let noIcao = 0;
  let missingCount = 0;
  for (const fr24_id of completedIds) {
    const output = progress.completed[fr24_id]!;
    const icaos = new Set<string>();
    if (output.origin_icao) icaos.add(output.origin_icao);
    if (output.dest_icao) icaos.add(output.dest_icao);

    if (icaos.size === 0) {
      noIcao++;
      continue;
    }

    const existing = jsonlIndex.get(fr24_id);
    let anyMissing = false;
    for (const icao of icaos) {
      if (!existing || !existing.has(icao)) {
        let bucket = toAppend.get(icao);
        if (!bucket) {
          bucket = [];
          toAppend.set(icao, bucket);
        }
        bucket.push({
          ...output,
          path: reducePrecision(output.path),
        });
        missingCount++;
        anyMissing = true;
      }
    }
    if (!anyMissing) fullyMatched++;
  }
  console.log(`   JSONL 已覆蓋:    ${fullyMatched} 筆`);
  console.log(`   無 origin/dest: ${noIcao} 筆 (跳過)`);
  console.log(
    `   需補寫到 JSONL: ${missingCount} 筆 (涉及 ${toAppend.size} 個機場)\n`,
  );

  // 5. Append 缺漏 ───────────────────────────────
  if (toAppend.size > 0) {
    console.log("✍️  Append 缺漏到 JSONL...");
    const sortedIcaos = [...toAppend.keys()].sort();
    for (const icao of sortedIcaos) {
      const outputs = toAppend.get(icao)!;
      const path = join(AIRPORTS_DIR, `${icao}.jsonl`);
      outputs.sort((a, b) => a.dep_time - b.dep_time);
      const lines = outputs.map((o) => JSON.stringify(o)).join("\n") + "\n";
      appendFileSync(path, lines);
      console.log(`   ${icao}: +${outputs.length}`);
    }
    console.log();
  } else {
    console.log("✅ JSONL 已完整，無需補寫\n");
  }

  // 6. 寫 NDJSON ─────────────────────────────────
  console.log("📝 寫入 NDJSON...");
  writeFileSync(DONE_NDJSON, completedIds.join("\n") + "\n");
  writeFileSync(
    FAILED_NDJSON,
    (progress.failed ?? []).join("\n") + "\n",
  );
  console.log(
    `   track-done.ndjson:   ${completedCount} 行 (${(statSync(DONE_NDJSON).size / 1024).toFixed(0)} KB)`,
  );
  console.log(
    `   track-failed.ndjson: ${failedCount} 行 (${(statSync(FAILED_NDJSON).size / 1024).toFixed(0)} KB)\n`,
  );

  // 7. 驗證 NDJSON 回讀行數一致 ──────────────────
  const doneLines = readFileSync(DONE_NDJSON, "utf-8")
    .split("\n")
    .filter(Boolean);
  const failedLines = readFileSync(FAILED_NDJSON, "utf-8")
    .split("\n")
    .filter(Boolean);
  const doneOk = doneLines.length === completedCount;
  const failedOk = failedLines.length === failedCount;
  console.log(
    `🔎 驗證: done ${doneLines.length}/${completedCount} ${doneOk ? "✅" : "❌"}, failed ${failedLines.length}/${failedCount} ${failedOk ? "✅" : "❌"}\n`,
  );

  if (!doneOk || !failedOk) {
    console.error("❌ 驗證失敗，請檢查！");
    process.exit(1);
  }

  console.log("✅ Migration 完成！");
  console.log("\n下一步：");
  console.log("  1. 檢查 scripts/track-done.ndjson 與 track-failed.ndjson");
  console.log("  2. 確認 fetch-tracks.ts / split-tracks.ts 改好後，");
  console.log("     手動刪除 scripts/track-progress.json（.bak 保留）");
}

main().catch((err) => {
  console.error("\n致命錯誤:", err);
  process.exit(1);
});
