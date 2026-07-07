/**
 * backfill-metadata.ts
 *
 * 把 flight-list.json 裡的 metadata（operating_as / painted_as / hex /
 * dest_icao_actual / flight / first_seen / last_seen）JOIN 回 public/tracks/airports/*.jsonl。
 *
 * 純本地 JOIN，不打 FR24 API，不花 credits。
 *
 * Usage:
 *   npx tsx scripts/oneoff/backfill-metadata.ts --dry-run   # 只統計，不寫檔
 *   npx tsx scripts/oneoff/backfill-metadata.ts             # 實際寫回
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  existsSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const FLIGHT_LIST = resolve(ROOT, "scripts/flight-list.json");
const AIRPORTS_DIR = resolve(ROOT, "public/tracks/airports");

interface FR24Summary {
  fr24_id: string;
  flight?: string;
  operating_as?: string;
  painted_as?: string;
  hex?: string;
  dest_icao_actual?: string;
  first_seen?: string;
  last_seen?: string;
  [key: string]: unknown;
}

interface Metadata {
  flight_number: string;
  operating_as: string;
  painted_as: string;
  hex: string;
  dest_icao_actual: string;
  first_seen: number;
  last_seen: number;
}

function isoToUnix(iso: string | undefined): number {
  if (!iso) return 0;
  return Math.floor(new Date(iso).getTime() / 1000);
}

function buildLookup(): Map<string, Metadata> {
  console.log("📖 讀取 flight-list.json ...");
  const raw = JSON.parse(readFileSync(FLIGHT_LIST, "utf-8"));
  const flights: FR24Summary[] = raw.flights ?? raw;
  const map = new Map<string, Metadata>();
  for (const f of flights) {
    if (!f.fr24_id) continue;
    map.set(f.fr24_id, {
      flight_number: f.flight ?? "",
      operating_as: f.operating_as ?? "",
      painted_as: f.painted_as ?? "",
      hex: f.hex ?? "",
      dest_icao_actual: f.dest_icao_actual ?? "",
      first_seen: isoToUnix(f.first_seen),
      last_seen: isoToUnix(f.last_seen),
    });
  }
  console.log(`   lookup: ${map.size.toLocaleString()} 筆\n`);
  return map;
}

function processFile(
  path: string,
  lookup: Map<string, Metadata>,
  dryRun: boolean,
): { total: number; enriched: number; alreadyHad: number; missed: number } {
  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n").filter(Boolean);

  let enriched = 0;
  let alreadyHad = 0;
  let missed = 0;
  const outLines: string[] = [];

  for (const line of lines) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      outLines.push(line);
      continue;
    }
    const fid = o.fr24_id as string | undefined;
    if (!fid) {
      outLines.push(line);
      continue;
    }
    // 已有新欄位就跳過（idempotent，可重複跑）
    if (typeof o.operating_as === "string" && o.operating_as.length > 0) {
      alreadyHad++;
      outLines.push(line);
      continue;
    }
    const meta = lookup.get(fid);
    if (!meta) {
      missed++;
      outLines.push(line);
      continue;
    }
    // 合併（新欄位覆蓋，其他欄位保留）
    const merged = { ...o, ...meta };
    outLines.push(JSON.stringify(merged));
    enriched++;
  }

  if (!dryRun && enriched > 0) {
    const tmp = path + ".tmp";
    writeFileSync(tmp, outLines.join("\n") + "\n");
    renameSync(tmp, path); // 原子操作
  }

  return { total: lines.length, enriched, alreadyHad, missed };
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log("=== backfill-metadata" + (dryRun ? " [DRY-RUN]" : "") + " ===\n");

  if (!existsSync(FLIGHT_LIST)) {
    console.error(`❌ 找不到 ${FLIGHT_LIST}`);
    process.exit(1);
  }
  if (!existsSync(AIRPORTS_DIR)) {
    console.error(`❌ 找不到 ${AIRPORTS_DIR}`);
    process.exit(1);
  }

  const lookup = buildLookup();

  const files = readdirSync(AIRPORTS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();
  console.log(`🛫 掃描 ${files.length} 個 JSONL ...\n`);

  let grandTotal = 0;
  let grandEnriched = 0;
  let grandAlready = 0;
  let grandMissed = 0;
  const missedByFile: Array<{ icao: string; missed: number }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const icao = file.replace(".jsonl", "");
    const path = join(AIRPORTS_DIR, file);
    const { total, enriched, alreadyHad, missed } = processFile(
      path,
      lookup,
      dryRun,
    );
    grandTotal += total;
    grandEnriched += enriched;
    grandAlready += alreadyHad;
    grandMissed += missed;
    if (missed > 0) missedByFile.push({ icao, missed });

    if ((i + 1) % 100 === 0 || i === files.length - 1) {
      process.stdout.write(
        `   [${i + 1}/${files.length}] ${icao} ... +${enriched}\n`,
      );
    }
  }

  console.log("\n=== 統計 ===");
  console.log(`JSONL 檔案:       ${files.length}`);
  console.log(`總行數:           ${grandTotal.toLocaleString()}`);
  console.log(`✅ 補齊 metadata: ${grandEnriched.toLocaleString()}`);
  console.log(`⏭️  已有（跳過）: ${grandAlready.toLocaleString()}`);
  console.log(`⚠️  找不到對應:   ${grandMissed.toLocaleString()}`);

  if (missedByFile.length > 0) {
    console.log(`\n⚠️  有 missed 的檔案（前 10）：`);
    missedByFile
      .sort((a, b) => b.missed - a.missed)
      .slice(0, 10)
      .forEach((x) => console.log(`   ${x.icao}: ${x.missed}`));
  }

  if (dryRun) {
    console.log("\n🧪 --dry-run：未寫入任何檔案。");
  } else {
    console.log("\n✅ 完成！");
  }
}

main();
