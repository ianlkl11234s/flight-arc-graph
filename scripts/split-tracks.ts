/**
 * split-tracks.ts
 * 將 aviation_data.json 拆成：
 *   1. public/tracks/airports/{ICAO}.jsonl — 每個機場的完整軌跡（NDJSON）
 *   2. public/tracks/regions/{REGION}.jsonl — 每個 region 的 DP 降採樣版（NDJSON）
 *   3. public/tracks/manifest.json — 索引檔
 *
 * Usage:
 *   npx tsx scripts/split-tracks.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { gzipSync } from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT = resolve(__dirname, "../public/tracks/aviation_data.json");
const OUT_DIR = resolve(__dirname, "../public/tracks");

interface Flight {
  fr24_id: string;
  origin_icao: string;
  dest_icao: string;
  dep_time: number;
  path: number[][];
  [key: string]: unknown;
}

// ── Douglas-Peucker ──

function perpDistKm(
  p: number[],
  a: number[],
  b: number[],
): number {
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

// ── Coordinate precision reduction ──

function reducePrecision(path: number[][]): number[][] {
  return path.map((p) => [
    +p[0]!.toFixed(4),
    +p[1]!.toFixed(4),
    Math.round(p[2]!),
    p[3]!,
  ]);
}

// ── Region matching ──

const KNOWN = ["RC", "RJ", "RO", "VH", "K"];
function getRegion(icao: string): string {
  if (icao.startsWith("RC")) return "TW";
  if (icao.startsWith("RJ") || icao.startsWith("RO")) return "JP";
  if (icao.startsWith("VH")) return "HK";
  if (icao.startsWith("K")) return "US";
  return "other";
}

// ── Main ──

function main() {
  console.log("=== split-tracks ===\n");

  if (!existsSync(INPUT)) {
    console.error("❌ 找不到", INPUT);
    process.exit(1);
  }

  const raw: Flight[] = JSON.parse(readFileSync(INPUT, "utf-8"));
  console.log(`載入 ${raw.length} 筆航班\n`);

  // 4 位小數（不降採樣）
  const flights = raw.map((f) => ({
    ...f,
    path: reducePrecision(f.path),
  }));

  // ── 1. 按機場分 ──
  const airportsDir = resolve(OUT_DIR, "airports");
  mkdirSync(airportsDir, { recursive: true });

  const byAirport = new Map<string, Map<string, Flight>>();
  for (const f of flights) {
    for (const icao of [f.origin_icao, f.dest_icao]) {
      if (!icao) continue;
      if (!byAirport.has(icao)) byAirport.set(icao, new Map());
      byAirport.get(icao)!.set(f.fr24_id, f);
    }
  }

  const manifest: {
    airports: Record<string, { flights: number; gzipBytes: number }>;
    regions: Record<string, { flights: number; gzipBytes: number }>;
    totalFlights: number;
    generatedAt: string;
  } = {
    airports: {},
    regions: {},
    totalFlights: flights.length,
    generatedAt: new Date().toISOString(),
  };

  let airportCount = 0;
  for (const [icao, flightsMap] of byAirport) {
    const arr = [...flightsMap.values()].sort(
      (a, b) => a.dep_time - b.dep_time,
    );
    const jsonl = arr.map((f) => JSON.stringify(f)).join("\n") + "\n";
    const outPath = resolve(airportsDir, `${icao}.jsonl`);
    writeFileSync(outPath, jsonl);
    const gzSize = gzipSync(jsonl).length;
    manifest.airports[icao] = { flights: arr.length, gzipBytes: gzSize };
    airportCount++;
  }
  console.log(`✅ ${airportCount} 機場檔案 → airports/`);

  // ── 2. 按 Region 分（DP 0.5km 降採樣版）──
  const regionsDir = resolve(OUT_DIR, "regions");
  mkdirSync(regionsDir, { recursive: true });

  const byRegion = new Map<string, Flight[]>();
  for (const f of flights) {
    const r1 = getRegion(f.origin_icao);
    const r2 = getRegion(f.dest_icao);
    // 歸屬到 origin 的 region
    if (!byRegion.has(r1)) byRegion.set(r1, []);
    byRegion.get(r1)!.push(f);
    // 如果 dest 不同 region，也加到 dest region（All Region 需要）
    if (r2 !== r1) {
      if (!byRegion.has(r2)) byRegion.set(r2, []);
      byRegion.get(r2)!.push(f);
    }
  }

  for (const [region, regionFlights] of byRegion) {
    // 去重
    const unique = new Map<string, Flight>();
    for (const f of regionFlights) unique.set(f.fr24_id, f);
    const arr = [...unique.values()].sort((a, b) => a.dep_time - b.dep_time);

    // DP 降採樣
    const dpFlights = arr.map((f) => ({
      ...f,
      path: dpSimplify(f.path, 0.5), // 0.5km epsilon
    }));

    const jsonl = dpFlights.map((f) => JSON.stringify(f)).join("\n") + "\n";
    const outPath = resolve(regionsDir, `${region}.jsonl`);
    writeFileSync(outPath, jsonl);
    const gzSize = gzipSync(jsonl).length;
    manifest.regions[region] = { flights: arr.length, gzipBytes: gzSize };
    console.log(
      `✅ ${region}: ${arr.length} flights (DP 0.5km) → gzip ${(gzSize / 1024 / 1024).toFixed(2)} MB`,
    );
  }

  // ── 3. manifest ──
  writeFileSync(
    resolve(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
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
  console.log(`機場檔案: ${airportCount} 個`);
  console.log(`Region 檔案: ${byRegion.size} 個`);
  console.log(
    `Region 合計 gzip: ${(totalRegionGz / 1024 / 1024).toFixed(1)} MB`,
  );
}

main();
