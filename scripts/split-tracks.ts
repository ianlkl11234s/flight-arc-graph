/**
 * split-tracks.ts
 *
 * 掃描 public/tracks/airports/{ICAO}.jsonl，產出：
 *   1. public/tracks/regions/{REGION}.jsonl — 每個 region 的 LOD（DP 2km + 40 點上限）版
 *   2. public/tracks/regions/all.jsonl       — 全球 union LOD（world/all scope 用）
 *   3. public/tracks/manifest.json          — 索引檔（airports + regions，regions 含 "all"）
 *
 * LOD 分層：regions/*.jsonl 是給 world/all/region scope 用的抽稀版（每航班 ≤40 點，
 *   世界視角肉眼不可辨）；單機場 scope 仍走 airports/{ICAO}.jsonl 全解析度。前端依 scope
 *   在 flightLoader.ts 選層（loadRegionFullFlights → LOD 檔；loadAirportFlights → 全解析度）。
 *
 * 注意：airports/{ICAO}.jsonl 是 fetch-tracks.ts 直接寫入的最終輸出，
 *       本腳本只做 dedupe（排序 + 去重）+ 產生 region + manifest。
 *
 * manifest.airports 額外欄位（資料目錄，給前端日期選單 / 機場清單分層用）：
 *   - isCore:    是否為主動查詢機場（來源 scripts/core-airports.json，由 build-core-airports.ts 產生）
 *   - dates:     該機場每日（台灣時間 UTC+8）軌跡筆數 { "2026-02-18": 614, ... }
 *   - fullDates: 抓「滿」的日期（core-airports.json 的 fullDates ∩ 實際有軌跡的日期）
 *
 * manifest.regionDates / manifest.regionFullDates：上述 dates/fullDates 依機場 getRegion()
 * 歸屬做聯集，給 region/組合模式的行事曆用（src/data/flightLoader.ts getRegionDates/getRegionFullDates）。
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

// ── LOD 抽稀（region / world / all scope 用）──
// 單機場 scope 走全解析度 per-airport JSONL，這裡只影響 region LOD 檔。
const LOD_EPSILON_KM = 2; // DP 垂距門檻；region scope ~2-3km/px，2km < 1px，世界視角肉眼不可辨
const LOD_MAX_POINTS = 40; // 每航班點數硬上限；長程大圓線用 epsilon 也降不到，需要安全網
const LOD_ESCALATE = 1.5; // 超過上限時的 epsilon 放大倍率

/**
 * DP 抽稀 + 硬點數上限。先用 epsilon 抽稀；長程大圓線常仍超過 maxPoints，
 * 逐次放大 epsilon 重跑直到 ≤ maxPoints。DP 永遠保留起訖點（起降點不掉）。
 */
function dpSimplifyCapped(
  path: number[][],
  epsilon: number,
  maxPoints: number,
): number[][] {
  let eps = epsilon;
  let simplified = dpSimplify(path, eps);
  let guard = 0;
  while (simplified.length > maxPoints && guard < 24) {
    eps *= LOD_ESCALATE;
    simplified = dpSimplify(path, eps);
    guard++;
  }
  return simplified;
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
    regionDates: Record<string, string[]>;
    regionFullDates: Record<string, string[]>;
    totalFlights: number;
    generatedAt: string;
  } = {
    airports: {},
    regions: {},
    regionDates: {},
    regionFullDates: {},
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

  // regionDates / regionFullDates：機場依 getRegion() 歸屬，dates/fullDates 做聯集
  // （同一航班會同時記在 dep + arr 兩座機場的 dates 裡，但這裡只取「有無資料」的日期集合，
  //   聯集本身天然去重，不需要另外處理 flights 層級的重複計數）
  const regionDatesSet = new Map<string, Set<string>>();
  const regionFullDatesSet = new Map<string, Set<string>>();
  for (const [icao, entry] of Object.entries(manifest.airports)) {
    const r = getRegion(icao);
    if (!regionDatesSet.has(r)) regionDatesSet.set(r, new Set());
    if (!regionFullDatesSet.has(r)) regionFullDatesSet.set(r, new Set());
    for (const d of Object.keys(entry.dates)) regionDatesSet.get(r)!.add(d);
    for (const d of entry.fullDates) regionFullDatesSet.get(r)!.add(d);
  }
  for (const [r, s] of regionDatesSet) manifest.regionDates[r] = [...s].sort();
  for (const [r, s] of regionFullDatesSet) manifest.regionFullDates[r] = [...s].sort();

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

  // 2. 產 LOD（DP 2km + 40 點上限）：region 檔 + 全球 all 檔
  mkdirSync(REGIONS_DIR, { recursive: true });

  const uniqueFlights = new Map<string, Flight>();
  for (const flights of byAirport.values()) {
    for (const f of flights) uniqueFlights.set(f.fr24_id, f);
  }
  manifest.totalFlights = uniqueFlights.size;
  console.log(`🛫 不重複航班: ${uniqueFlights.size}\n`);

  // 每筆 unique flight 只抽稀一次，region + all 檔共用（省掉重複 DP）
  const lodPathById = new Map<string, number[][]>();
  let origPtsSum = 0;
  let lodPtsSum = 0;
  let lodMaxPts = 0;
  for (const f of uniqueFlights.values()) {
    const lod = dpSimplifyCapped(f.path, LOD_EPSILON_KM, LOD_MAX_POINTS);
    lodPathById.set(f.fr24_id, lod);
    origPtsSum += f.path.length;
    lodPtsSum += lod.length;
    if (lod.length > lodMaxPts) lodMaxPts = lod.length;
  }
  const n = uniqueFlights.size || 1;
  console.log(
    `📉 LOD 抽稀 (DP ${LOD_EPSILON_KM}km, cap ${LOD_MAX_POINTS}): 原始平均 ${(origPtsSum / n).toFixed(1)} 點 → LOD 平均 ${(lodPtsSum / n).toFixed(1)} 點 (最多 ${lodMaxPts})\n`,
  );

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

  const writeLodFile = (name: string, flights: Flight[]) => {
    const arr = [...flights].sort((a, b) => a.dep_time - b.dep_time);
    const jsonl =
      arr
        .map((f) => JSON.stringify({ ...f, path: lodPathById.get(f.fr24_id)! }))
        .join("\n") + "\n";
    const outPath = join(REGIONS_DIR, `${name}.jsonl`);
    writeFileSync(outPath, jsonl);
    const gzSize = gzipSync(jsonl).length;
    manifest.regions[name] = { flights: arr.length, gzipBytes: gzSize };
    console.log(
      `✅ ${name}: ${arr.length} flights (LOD) → gzip ${(gzSize / 1024 / 1024).toFixed(2)} MB`,
    );
  };

  for (const [region, regionFlights] of byRegion) {
    const unique = new Map<string, Flight>();
    for (const f of regionFlights) unique.set(f.fr24_id, f);
    writeLodFile(region, [...unique.values()]);
  }

  // 全球 union LOD（world/all scope 用；前端 loadRegionFullFlights 對 all/world 讀此檔）
  writeLodFile("all", [...uniqueFlights.values()]);

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
  console.log(`Region:   ${Object.keys(manifest.regions).length} 個含 all (gzip ${(totalRegionGz / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`不重複航班: ${uniqueFlights.size}`);
}

main();
