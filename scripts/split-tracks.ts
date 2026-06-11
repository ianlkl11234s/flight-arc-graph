/**
 * split-tracks.ts
 *
 * 掃描 public/tracks/airports/{ICAO}.jsonl，產出：
 *   1. public/tracks/regions/{REGION}.jsonl — 每個 region 的 DP 降採樣版
 *   2. public/tracks/manifest.json          — 索引檔（airports + regions）
 *
 * 注意：airports/{ICAO}.jsonl 是 fetch-tracks.ts 直接寫入的最終輸出，
 *       本腳本只做 dedupe（排序 + 去重）+ 產生 region + manifest。
 *
 * manifest.airports 額外欄位（資料目錄，給前端日期選單 / 機場清單分層用）：
 *   - isCore:    是否為主動查詢機場（來源 scripts/core-airports.json，由 build-core-airports.ts 產生）
 *   - dates:     該機場每日（台灣時間 UTC+8）軌跡筆數 { "2026-02-18": 614, ... }
 *   - fullDates: 抓「滿」的日期（core-airports.json 的 fullDates ∩ 實際有軌跡的日期）
 *
 * Usage:
 *   npx tsx scripts/split-tracks.ts
 *   npx tsx scripts/split-tracks.ts --dedupe-only     # 只去重 airports/*.jsonl，不動 region
 *   npx tsx scripts/split-tracks.ts --manifest-only   # 只重建 manifest（串流統計、不重寫 region 檔、低記憶體）
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { gzipSync } from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TRACKS_DIR = resolve(ROOT, "public/tracks");
const AIRPORTS_DIR = join(TRACKS_DIR, "airports");
const REGIONS_DIR = join(TRACKS_DIR, "regions");
const MANIFEST_FILE = join(TRACKS_DIR, "manifest.json");

interface Flight {
  fr24_id: string;
  origin_icao: string;
  dest_icao: string;
  dep_time: number;
  path: number[][];
  [key: string]: unknown;
}

// ── Douglas-Peucker ──

function perpDistKm(p: number[], a: number[], b: number[]): number {
  const cosLat = Math.cos((a[0]! * Math.PI) / 180);
  const dlat = (b[0]! - a[0]!) * 111.32;
  const dlng = (b[1]! - a[1]!) * 111.32 * cosLat;
  const len2 = dlat * dlat + dlng * dlng;
  if (len2 === 0) {
    const dx = (p[0]! - a[0]!) * 111.32;
    const dy = (p[1]! - a[1]!) * 111.32 * cosLat;
    return Math.sqrt(dx * dx + dy * dy);
  }
  const plat = (p[0]! - a[0]!) * 111.32;
  const plng = (p[1]! - a[1]!) * 111.32 * cosLat;
  const t = Math.max(0, Math.min(1, (plat * dlat + plng * dlng) / len2));
  const dx = plat - t * dlat;
  const dy = plng - t * dlng;
  return Math.sqrt(dx * dx + dy * dy);
}

function dpSimplify(path: number[][], epsilon: number): number[][] {
  if (path.length <= 2) return path;
  let maxDist = 0;
  let maxIdx = 0;
  const a = path[0]!;
  const b = path[path.length - 1]!;
  for (let i = 1; i < path.length - 1; i++) {
    const d = perpDistKm(path[i]!, a, b);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = dpSimplify(path.slice(0, maxIdx + 1), epsilon);
    const right = dpSimplify(path.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

// ── Region matching ──

function getRegion(icao: string): string {
  if (icao.startsWith("RC")) return "TW";
  if (icao.startsWith("RJ") || icao.startsWith("RO")) return "JP";
  if (icao.startsWith("VH")) return "HK";
  if (icao.startsWith("RK")) return "KR";
  if (icao.startsWith("VT")) return "TH";
  if (icao.startsWith("K")) return "US";
  if (icao.startsWith("EG")) return "UK";
  // 中國大陸：ICAO 開頭 Z，排除北韓 ZK、蒙古 ZM（香港 VH / 澳門 VM 不算）
  if (icao.startsWith("Z") && !icao.startsWith("ZK") && !icao.startsWith("ZM")) return "CN";
  return "other";
}

// ── 資料目錄（isCore / dates / fullDates）──

const CORE_AIRPORTS_FILE = join(__dirname, "core-airports.json");

interface AirportManifestEntry {
  flights: number;
  gzipBytes: number;
  isCore: boolean;
  dates: Record<string, number>;
  fullDates: string[];
}

function loadCoreAirports(): Map<string, string[]> {
  if (!existsSync(CORE_AIRPORTS_FILE)) {
    console.warn("⚠️  找不到 scripts/core-airports.json（跑 build-core-airports.ts 產生），isCore/fullDates 將全部為空");
    return new Map();
  }
  const raw = JSON.parse(readFileSync(CORE_AIRPORTS_FILE, "utf-8")) as {
    airports: Record<string, { fullDates: string[] }>;
  };
  return new Map(Object.entries(raw.airports).map(([icao, a]) => [icao, a.fullDates]));
}

/** dep_time (unix 秒) → 台灣時間日期字串，與前端 App.tsx 切日邏輯一致 */
function toTwDate(depTime: number): string {
  return new Date(depTime * 1000 + 8 * 3600_000).toISOString().slice(0, 10);
}

function countDates(flights: Flight[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of flights) {
    // 與前端 App.tsx availableDates 同邏輯：dep_time 無效時 fallback 到 path 首點時間戳
    // sanity floor 1e9（2001 年）：擋掉接近 epoch 的壞時間戳（如 path[0][3]=98）
    const t = f.dep_time || f.path[0]?.[3];
    if (!t || t < 1e9) continue;
    const d = toTwDate(t);
    counts[d] = (counts[d] ?? 0) + 1;
  }
  // 按日期排序輸出，manifest diff 才穩定
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function buildAirportEntry(
  icao: string,
  flights: Flight[],
  gzipBytes: number,
  coreAirports: Map<string, string[]>,
): AirportManifestEntry {
  const dates = countDates(flights);
  const candidates = coreAirports.get(icao);
  // fullDates 取 candidates ∩ 實際有足量軌跡的日期（防「時刻表抓了、軌跡沒抓」誤標）
  const fullDates = (candidates ?? []).filter((d) => (dates[d] ?? 0) >= 50);
  return {
    flights: flights.length,
    gzipBytes,
    isCore: coreAirports.has(icao),
    dates,
    fullDates,
  };
}

// ── 讀取一個 JSONL 檔，dedupe 並回寫 ──

function readAndDedupe(icao: string): Flight[] {
  const path = join(AIRPORTS_DIR, `${icao}.jsonl`);
  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const byId = new Map<string, Flight>();
  for (const line of lines) {
    try {
      const f = JSON.parse(line) as Flight;
      if (f.fr24_id) byId.set(f.fr24_id, f); // 後寫的覆蓋前寫的
    } catch {
      /* skip bad line */
    }
  }
  const arr = [...byId.values()].sort((a, b) => a.dep_time - b.dep_time);

  // 若原檔有重複（dedupe 有效果）才回寫
  if (arr.length !== lines.length) {
    const jsonl = arr.map((f) => JSON.stringify(f)).join("\n") + "\n";
    writeFileSync(path, jsonl);
  }
  return arr;
}

// ── Main ──

function main() {
  console.log("=== split-tracks ===\n");

  if (!existsSync(AIRPORTS_DIR)) {
    console.error(`❌ 找不到 ${AIRPORTS_DIR}`);
    process.exit(1);
  }

  const dedupeOnly = process.argv.includes("--dedupe-only");
  const manifestOnly = process.argv.includes("--manifest-only");

  const coreAirports = loadCoreAirports();
  console.log(`📖 core-airports: ${coreAirports.size} 座主動查詢機場\n`);

  // 1. 掃 airports/*.jsonl，dedupe + 建 manifest
  //    --manifest-only 模式：串流統計，不在記憶體保留 flights（避免 OOM）
  console.log("📖 載入 airports/*.jsonl...");
  const files = readdirSync(AIRPORTS_DIR).filter((f) => f.endsWith(".jsonl"));
  const byAirport = new Map<string, Flight[]>();
  const uniqueIds = new Set<string>();
  let totalFlightsIndexed = 0;

  const manifest: {
    airports: Record<string, AirportManifestEntry>;
    regions: Record<string, { flights: number; gzipBytes: number }>;
    totalFlights: number;
    generatedAt: string;
  } = {
    airports: {},
    regions: {},
    totalFlights: 0,
    generatedAt: new Date().toISOString(),
  };

  for (const file of files) {
    const icao = file.replace(".jsonl", "");
    const flights = readAndDedupe(icao);
    totalFlightsIndexed += flights.length;

    const jsonl = flights.map((f) => JSON.stringify(f)).join("\n") + "\n";
    const gzSize = gzipSync(jsonl).length;
    manifest.airports[icao] = buildAirportEntry(icao, flights, gzSize, coreAirports);

    if (manifestOnly) {
      for (const f of flights) uniqueIds.add(f.fr24_id);
    } else {
      byAirport.set(icao, flights);
    }
  }
  console.log(`   ${files.length} 機場，${totalFlightsIndexed} 筆（含重複歸屬）\n`);

  if (dedupeOnly) {
    console.log("(--dedupe-only, 跳過 region + manifest)");
    return;
  }

  if (manifestOnly) {
    // 沿用既有 manifest 的 regions 區塊（不重寫 region 檔）
    manifest.totalFlights = uniqueIds.size;
    if (existsSync(MANIFEST_FILE)) {
      const old = JSON.parse(readFileSync(MANIFEST_FILE, "utf-8")) as {
        regions?: Record<string, { flights: number; gzipBytes: number }>;
      };
      manifest.regions = old.regions ?? {};
    }
    writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    console.log(`🛫 不重複航班: ${uniqueIds.size}`);
    console.log(`✅ manifest.json（--manifest-only，regions 沿用既有值）`);
    return;
  }

  // 2. 按 Region 分（DP 0.5km 降採樣）
  mkdirSync(REGIONS_DIR, { recursive: true });

  const uniqueFlights = new Map<string, Flight>();
  for (const flights of byAirport.values()) {
    for (const f of flights) uniqueFlights.set(f.fr24_id, f);
  }
  manifest.totalFlights = uniqueFlights.size;
  console.log(`🛫 不重複航班: ${uniqueFlights.size}\n`);

  const byRegion = new Map<string, Flight[]>();
  for (const f of uniqueFlights.values()) {
    const r1 = getRegion(f.origin_icao);
    const r2 = getRegion(f.dest_icao);
    if (!byRegion.has(r1)) byRegion.set(r1, []);
    byRegion.get(r1)!.push(f);
    if (r2 !== r1) {
      if (!byRegion.has(r2)) byRegion.set(r2, []);
      byRegion.get(r2)!.push(f);
    }
  }

  for (const [region, regionFlights] of byRegion) {
    const unique = new Map<string, Flight>();
    for (const f of regionFlights) unique.set(f.fr24_id, f);
    const arr = [...unique.values()].sort((a, b) => a.dep_time - b.dep_time);

    const dpFlights = arr.map((f) => ({
      ...f,
      path: dpSimplify(f.path, 0.5),
    }));

    const jsonl = dpFlights.map((f) => JSON.stringify(f)).join("\n") + "\n";
    const outPath = join(REGIONS_DIR, `${region}.jsonl`);
    writeFileSync(outPath, jsonl);
    const gzSize = gzipSync(jsonl).length;
    manifest.regions[region] = { flights: arr.length, gzipBytes: gzSize };
    console.log(
      `✅ ${region}: ${arr.length} flights (DP 0.5km) → gzip ${(gzSize / 1024 / 1024).toFixed(2)} MB`,
    );
  }

  // 3. manifest
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  console.log(`\n✅ manifest.json`);

  // 統計
  const totalAirportGz = Object.values(manifest.airports).reduce(
    (s, a) => s + a.gzipBytes,
    0,
  );
  const totalRegionGz = Object.values(manifest.regions).reduce(
    (s, r) => s + r.gzipBytes,
    0,
  );
  console.log(`\n=== 統計 ===`);
  console.log(`機場檔案: ${files.length} 個 (gzip ${(totalAirportGz / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Region:   ${byRegion.size} 個 (gzip ${(totalRegionGz / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`不重複航班: ${uniqueFlights.size}`);
}

main();
