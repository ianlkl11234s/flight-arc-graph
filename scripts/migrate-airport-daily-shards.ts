/**
 * 將既有 flat 機場軌跡安全地投影為每日 JSONL 分檔。
 *
 * 此腳本不刪除、不改寫 {ICAO}.jsonl；flat 檔仍是目前前端與 split-tracks 的
 * fallback / canonical source。它適合先用 RCTP 做小範圍驗證，再用 --all 補齊全域。
 *
 * Usage:
 *   npx tsx scripts/migrate-airport-daily-shards.ts --airports RCTP --dry-run
 *   npx tsx scripts/migrate-airport-daily-shards.ts --airports RCTP
 *   npx tsx scripts/migrate-airport-daily-shards.ts --all
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statfsSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const AIRPORTS_DIR = resolve(ROOT, "public/tracks/airports");
const ICAO_RE = /^[A-Z0-9]{4}$/;

interface Flight {
  fr24_id: string;
  dep_time: number;
  path: number[][];
}

function toTwDate(flight: Flight): string | null {
  const timestamp = flight.dep_time || flight.path[0]?.[3];
  if (!timestamp || timestamp < 1e9) return null;
  return new Date(timestamp * 1000 + 8 * 3600_000).toISOString().slice(0, 10);
}

function parseAndDedupe(path: string): Flight[] {
  const byId = new Map<string, Flight>();
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    if (!line) continue;
    try {
      const flight = JSON.parse(line) as Flight;
      if (flight.fr24_id) byId.set(flight.fr24_id, flight);
    } catch {
      // 壞行與 split-tracks 的既有慣例相同：跳過，但不修改 flat source。
    }
  }
  return [...byId.values()].sort((a, b) => a.dep_time - b.dep_time);
}

function groupByDate(flights: Flight[]): { groups: Map<string, Flight[]>; invalid: number } {
  const groups = new Map<string, Flight[]>();
  let invalid = 0;
  for (const flight of flights) {
    const date = toTwDate(flight);
    if (!date) {
      invalid++;
      continue;
    }
    const group = groups.get(date) ?? [];
    group.push(flight);
    groups.set(date, group);
  }
  return { groups, invalid };
}

function verifyShard(path: string, expected: Flight[]): boolean {
  const actual = parseAndDedupe(path);
  if (actual.length !== expected.length) return false;
  const ids = new Set(actual.map((flight) => flight.fr24_id));
  return expected.every((flight) => ids.has(flight.fr24_id));
}

function allFlatAirports(): string[] {
  if (!existsSync(AIRPORTS_DIR)) return [];
  return readdirSync(AIRPORTS_DIR)
    .filter((name) => name.endsWith(".jsonl") && ICAO_RE.test(name.slice(0, -".jsonl".length)))
    .map((name) => name.slice(0, -".jsonl".length))
    .sort();
}

function flatBytes(airports: readonly string[]): number {
  return airports.reduce((sum, icao) => {
    const path = join(AIRPORTS_DIR, `${icao}.jsonl`);
    return sum + (existsSync(path) ? statSync(path).size : 0);
  }, 0);
}

function assertEnoughDiskForAll(airports: readonly string[]): void {
  const sourceBytes = flatBytes(airports);
  const largestFlat = airports.reduce((max, icao) => {
    const path = join(AIRPORTS_DIR, `${icao}.jsonl`);
    return existsSync(path) ? Math.max(max, statSync(path).size) : max;
  }, 0);
  const fs = statfsSync(AIRPORTS_DIR);
  const availableBytes = fs.bavail * fs.bsize;
  const requiredBytes = sourceBytes + largestFlat * 2;
  const gib = (bytes: number) => (bytes / 1024 / 1024 / 1024).toFixed(1);
  console.log(`💽 磁碟預檢：flat ${gib(sourceBytes)} GiB，可用 ${gib(availableBytes)} GiB，安全需求 ${gib(requiredBytes)} GiB`);
  if (availableBytes < requiredBytes) {
    throw new Error(`可用空間不足：全域 daily shards 估算至少需要 ${gib(requiredBytes)} GiB`);
  }
}

function writeShardAtomically(path: string, content: string): void {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const all = process.argv.includes("--all");
  const airportsIndex = process.argv.indexOf("--airports");
  const selected = airportsIndex === -1
    ? []
    : process.argv[airportsIndex + 1]!.split(",").map((icao) => icao.trim().toUpperCase()).filter(Boolean);

  if ((all && selected.length > 0) || (!all && selected.length === 0)) {
    console.error("❌ 請擇一使用 --airports RCTP,RJTT 或 --all");
    process.exit(1);
  }
  if (selected.some((icao) => !ICAO_RE.test(icao))) {
    console.error("❌ --airports 僅接受四碼 ICAO（英數）");
    process.exit(1);
  }

  const airports = all ? allFlatAirports() : [...new Set(selected)].sort();
  if (airports.length === 0) {
    console.error(`❌ 找不到 ${AIRPORTS_DIR} 下的 flat 機場檔`);
    process.exit(1);
  }

  if (all) assertEnoughDiskForAll(airports);

  console.log(`=== migrate-airport-daily-shards (${dryRun ? "dry-run" : "write"}) ===`);
  let plannedFiles = 0;
  let plannedFlights = 0;
  let writtenFiles = 0;
  let writtenFlights = 0;
  let invalidFlights = 0;
  for (const icao of airports) {
    const flatPath = join(AIRPORTS_DIR, `${icao}.jsonl`);
    if (!existsSync(flatPath)) {
      console.warn(`⚠️  ${icao}: flat fallback 不存在，跳過`);
      continue;
    }
    const flights = parseAndDedupe(flatPath);
    const { groups, invalid } = groupByDate(flights);
    invalidFlights += invalid;
    plannedFiles += groups.size;
    plannedFlights += [...groups.values()].reduce((sum, group) => sum + group.length, 0);
    console.log(`  ${icao}: ${flights.length} unique flights → ${groups.size} daily files${invalid ? `（${invalid} 無效時間未分檔）` : ""}`);
    if (dryRun) continue;

    const dailyDir = join(AIRPORTS_DIR, icao);
    mkdirSync(dailyDir, { recursive: true });
    for (const [date, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      const sorted = [...group].sort((a, b) => a.dep_time - b.dep_time);
      const path = join(dailyDir, `${date}.jsonl`);
      writeShardAtomically(path, sorted.map((flight) => JSON.stringify(flight)).join("\n") + "\n");
      if (!verifyShard(path, sorted)) {
        throw new Error(`${icao}/${date}: 寫入後驗證失敗，flat fallback 未受影響`);
      }
      writtenFiles++;
      writtenFlights += sorted.length;
    }
  }
  if (dryRun) {
    console.log(`✅ 預計產生 ${plannedFiles} daily files、涵蓋 ${plannedFlights} flights；flat source 未修改`);
  } else {
    console.log(`✅ 已驗證 ${writtenFiles} daily files、${writtenFlights} flights`);
  }
  if (invalidFlights > 0) console.warn(`⚠️  ${invalidFlights} 筆無有效起飛時間，只保留在 flat fallback`);
}

main();
