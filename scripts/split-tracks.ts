/**
 * split-tracks.ts
 *
 * 掃描 public/tracks/airports/{ICAO}.jsonl，產出：
 *   0. public/tracks/airports/{ICAO}/{YYYY-MM-DD}.jsonl — 每日全解析度分檔（保留 flat fallback）
 *   1. public/tracks/regions/{REGION}.jsonl — 每個 region 的 LOD（DP 2km + 40 點上限）版
 *   2. public/tracks/regions/all.jsonl       — 全球 union LOD（world/all scope 用）
 *   3. public/tracks/manifest.json          — 索引檔（airports + regions，regions 含 "all"）
 *
 * LOD 分層：regions/*.jsonl 是給 world/all/region scope 用的抽稀版（每航班 ≤40 點，
 *   世界視角肉眼不可辨）；單機場 scope 仍走 airports/{ICAO}.jsonl 全解析度。前端依 scope
 *   在 flightLoader.ts 選層（loadRegionFullFlights → LOD 檔；loadAirportFlights → 全解析度）。
 *
 * 注意：airports/{ICAO}.jsonl 是 fetch-tracks.ts 持續寫入的相容性 fallback。
 *       預設模式會以它為 canonical source，dedupe 後產生每日分檔、region 與 manifest；
 *       若 flat 檔不存在，則可從既有 daily shards 重建 manifest / region。
 *
 * manifest.airports 額外欄位（資料目錄，給前端日期選單 / 機場清單分層用）：
 *   - isCore:    是否為主動查詢機場（來源 scripts/core-airports.json，由 build-core-airports.ts 產生）
 *   - dates:     該機場每日（台灣時間 UTC+8）軌跡筆數 { "2026-02-18": 614, ... }
 *   - dailyFiles: 實際存在且與 canonical 資料一致的每日檔 metadata（可選，供新 loader 漸進採用）
 *   - fullDates: 抓「滿」的日期（core-airports.json 的 fullDates ∩ 實際有軌跡的日期）
 *
 * manifest.regionDates / manifest.regionFullDates：上述 dates/fullDates 依機場 getRegion()
 * 歸屬做聯集，給 region/組合模式的行事曆用（src/data/flightLoader.ts getRegionDates/getRegionFullDates）。
 *
 * Usage:
 *   npx tsx scripts/split-tracks.ts
 *   npx tsx scripts/split-tracks.ts --dedupe-only     # 只去重 airports/*.jsonl，不動 region
 *   npx tsx scripts/split-tracks.ts --manifest-only   # 只重建 manifest，不重寫 daily / region 檔
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
  renameSync,
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
  dailyFiles?: Record<string, DailyFileMetadata>;
}

interface DailyFileMetadata {
  /** 相對於 public/tracks/ 的路徑，供 /data/tracks 與 public/tracks 共用。 */
  path: string;
  flights: number;
  bytes: number;
  gzipBytes?: number;
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

function getFlightTwDate(flight: Flight): string | null {
  // 與前端 App.tsx availableDates 同邏輯，並擋掉 epoch 附近的壞時間戳。
  const timestamp = flight.dep_time || flight.path[0]?.[3];
  return timestamp && timestamp >= 1e9 ? toTwDate(timestamp) : null;
}

function countDates(flights: Flight[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of flights) {
    const d = getFlightTwDate(f);
    if (!d) continue;
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
  dailyFiles?: Record<string, DailyFileMetadata>,
): AirportManifestEntry {
  const dates = countDates(flights);
  const candidates = coreAirports.get(icao);
  // fullDates 取 candidates ∩ 實際有足量軌跡的日期（防「時刻表抓了、軌跡沒抓」誤標）
  const fullDates = (candidates ?? []).filter((d) => (dates[d] ?? 0) >= 50);
  const entry: AirportManifestEntry = {
    flights: flights.length,
    gzipBytes,
    isCore: coreAirports.has(icao),
    dates,
    fullDates,
  };
  if (dailyFiles && Object.keys(dailyFiles).length > 0) entry.dailyFiles = dailyFiles;
  return entry;
}

// ── 高度單位 sanity（path[i][2] 一律公尺）──
// 公尺下不可能 >16,000（≈52,500 ft，遠高於民航升限）；出現代表又有生英呎漏進資料流。
const ALT_SANITY_MAX_M = 16000;
let altOutliers = 0;
const altOutlierSamples: { fr24_id: string; alt: number }[] = [];

function checkAltSanity(f: Flight) {
  for (const p of f.path) {
    const alt = p[2];
    if (alt !== undefined && alt > ALT_SANITY_MAX_M) {
      altOutliers++;
      if (altOutlierSamples.length < 3) {
        altOutlierSamples.push({ fr24_id: f.fr24_id, alt });
      }
    }
  }
}

// ── Airport source / daily shards ──

const ICAO_FILE_RE = /^[A-Z0-9]{4}$/;
const DATE_FILE_RE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

function parseJsonl(content: string): { lines: string[]; flights: Flight[] } {
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
  return { lines, flights: [...byId.values()].sort((a, b) => a.dep_time - b.dep_time) };
}

/** 列出 flat 與 daily 兩種格式中可讀的機場；不把日期目錄誤當機場。 */
function listAirportIcaos(): string[] {
  const icaos = new Set<string>();
  for (const entry of readdirSync(AIRPORTS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      const icao = entry.name.slice(0, -".jsonl".length);
      if (ICAO_FILE_RE.test(icao)) icaos.add(icao);
    }
    if (entry.isDirectory() && ICAO_FILE_RE.test(entry.name)) icaos.add(entry.name);
  }
  return [...icaos].sort();
}

/**
 * flat 檔存在時一律以它為 canonical source；每日檔只是其可切換的投影。
 * 未來若已移除 flat，才把 daily shards 作為 fallback source。這避免雙寫期間
 * 同一航班被兩種格式重複掃描，也避免部分 migration 產物覆蓋完整 flat 資料。
 */
function readAndDedupe(icao: string, rewriteFlat = true): Flight[] {
  const flatPath = join(AIRPORTS_DIR, `${icao}.jsonl`);
  let lines: string[];
  let arr: Flight[];
  if (existsSync(flatPath)) {
    const parsed = parseJsonl(readFileSync(flatPath, "utf-8"));
    lines = parsed.lines;
    arr = parsed.flights;

    // 若原檔有重複（dedupe 有效果）才回寫；不因排序改寫既有 flat 資料。
    if (rewriteFlat && arr.length !== lines.length) {
      const jsonl = arr.map((f) => JSON.stringify(f)).join("\n") + "\n";
      writeFileSync(flatPath, jsonl);
    }
  } else {
    const dailyDir = join(AIRPORTS_DIR, icao);
    const byId = new Map<string, Flight>();
    for (const file of readdirSync(dailyDir).filter((name) => DATE_FILE_RE.test(name)).sort()) {
      const parsed = parseJsonl(readFileSync(join(dailyDir, file), "utf-8"));
      for (const flight of parsed.flights) byId.set(flight.fr24_id, flight);
    }
    lines = [];
    arr = [...byId.values()].sort((a, b) => a.dep_time - b.dep_time);
  }

  for (const f of arr) checkAltSanity(f);
  return arr;
}

function groupFlightsByDate(flights: Flight[]): Map<string, Flight[]> {
  const groups = new Map<string, Flight[]>();
  for (const flight of flights) {
    const date = getFlightTwDate(flight);
    if (!date) continue;
    const group = groups.get(date) ?? [];
    group.push(flight);
    groups.set(date, group);
  }
  return groups;
}

function dailyMetadata(date: string, icao: string, jsonl: string, flights: number): DailyFileMetadata {
  return {
    path: `airports/${icao}/${date}.jsonl`,
    flights,
    bytes: Buffer.byteLength(jsonl),
    gzipBytes: gzipSync(jsonl).length,
  };
}

/** 從 canonical flights 重建每日檔；永不刪除 flat 或舊日期檔。 */
function writeDailyShards(icao: string, flights: Flight[]): Record<string, DailyFileMetadata> {
  const dailyDir = join(AIRPORTS_DIR, icao);
  mkdirSync(dailyDir, { recursive: true });
  const metadata: Record<string, DailyFileMetadata> = {};
  for (const [date, group] of [...groupFlightsByDate(flights)].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...group].sort((a, b) => a.dep_time - b.dep_time);
    const jsonl = sorted.map((flight) => JSON.stringify(flight)).join("\n") + "\n";
    writeFileSync(join(dailyDir, `${date}.jsonl`), jsonl);
    metadata[date] = dailyMetadata(date, icao, jsonl, sorted.length);
  }
  return metadata;
}

/**
 * --manifest-only 不應悄悄重寫分檔。只在所有 expected 日期檔都存在且 ID 集合一致時
 * 才公布 dailyFiles，避免 loader 讀到中斷 migration 或過時補抓留下的半套檔案。
 */
function readVerifiedDailyMetadata(icao: string, flights: Flight[]): Record<string, DailyFileMetadata> | undefined {
  const expected = groupFlightsByDate(flights);
  if (expected.size === 0) return undefined;
  const dailyDir = join(AIRPORTS_DIR, icao);
  if (!existsSync(dailyDir)) return undefined;
  const metadata: Record<string, DailyFileMetadata> = {};
  for (const [date, expectedFlights] of expected) {
    const path = join(dailyDir, `${date}.jsonl`);
    if (!existsSync(path)) return undefined;
    const content = readFileSync(path, "utf-8");
    const parsed = parseJsonl(content);
    if (parsed.lines.length !== parsed.flights.length || parsed.flights.length !== expectedFlights.length) {
      return undefined;
    }
    const expectedPayloads = new Map(expectedFlights.map((flight) => [flight.fr24_id, JSON.stringify(flight)]));
    const actualPayloads = new Map(parsed.flights.map((flight) => [flight.fr24_id, JSON.stringify(flight)]));
    if (
      expectedPayloads.size !== actualPayloads.size
      || [...expectedPayloads].some(([id, payload]) => actualPayloads.get(id) !== payload)
    ) {
      return undefined;
    }
    metadata[date] = dailyMetadata(date, icao, content, parsed.flights.length);
  }
  return metadata;
}

function writeManifestAtomically(manifest: unknown): void {
  const temporary = `${MANIFEST_FILE}.tmp-${process.pid}`;
  writeFileSync(temporary, JSON.stringify(manifest, null, 2));
  renameSync(temporary, MANIFEST_FILE);
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

  // 1. 掃 airports flat/daily sources，dedupe + 建 manifest。
  //    flat 存在時它是 canonical source；daily-only 機場仍可被保留在 catalog。
  console.log("📖 載入 airports（flat + daily fallback）...");
  const icaos = listAirportIcaos();
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

  for (const icao of icaos) {
    const flights = readAndDedupe(icao, !manifestOnly);
    totalFlightsIndexed += flights.length;

    const jsonl = flights.map((f) => JSON.stringify(f)).join("\n") + "\n";
    const gzSize = gzipSync(jsonl).length;
    const dailyFiles = dedupeOnly
      ? undefined
      : manifestOnly
        ? readVerifiedDailyMetadata(icao, flights)
        : writeDailyShards(icao, flights);
    manifest.airports[icao] = buildAirportEntry(icao, flights, gzSize, coreAirports, dailyFiles);

    if (manifestOnly) {
      for (const f of flights) uniqueIds.add(f.fr24_id);
    } else {
      byAirport.set(icao, flights);
    }
  }
  console.log(`   ${icaos.length} 機場，${totalFlightsIndexed} 筆（含重複歸屬）\n`);

  if (altOutliers > 0) {
    console.warn(
      `⚠️  高度單位可疑：${altOutliers} 個點 alt > ${ALT_SANITY_MAX_M} m（公尺下不可能，疑似生英呎漏入）`,
    );
    for (const s of altOutlierSamples) {
      console.warn(`     ${s.fr24_id}: ${s.alt}`);
    }
    console.warn("");
  }

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
    writeManifestAtomically(manifest);
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
  writeManifestAtomically(manifest);
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
  console.log(`機場檔案: ${icaos.length} 個 (gzip ${(totalAirportGz / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Region:   ${Object.keys(manifest.regions).length} 個含 all (gzip ${(totalRegionGz / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`不重複航班: ${uniqueFlights.size}`);
}

main();
