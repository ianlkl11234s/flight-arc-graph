/**
 * fetch-airport-boundaries.ts
 * 從 OSM Overpass API 抓取機場邊界多邊形，合併到 airports.geojson
 *
 * Usage:
 *   npx tsx scripts/fetch-airport-boundaries.ts --icao RJBE,RJOA,RJCH
 *   npx tsx scripts/fetch-airport-boundaries.ts --missing   # 自動找出 flight-list 中缺少的
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEOJSON_PATH = path.resolve(__dirname, "../public/airports.geojson");
const FLIGHT_LIST_PATH = path.resolve(__dirname, "flight-list.json");
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DELAY_MS = 1500; // 避免 Overpass rate limit

interface AirportFeature {
  type: "Feature";
  properties: {
    name: string;
    name_en: string;
    icao: string;
    iata: string;
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

interface GeoJSON {
  type: "FeatureCollection";
  features: AirportFeature[];
}

function loadGeoJSON(): GeoJSON {
  return JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
}

function saveGeoJSON(data: GeoJSON) {
  fs.writeFileSync(GEOJSON_PATH, JSON.stringify(data), "utf8");
}

// Node 內建 fetch 對 Overpass 會 ETIMEDOUT（IPv6 / TLS 路由問題）
// → 改用 curl 繞過，與 shell 行為一致
function runOverpass(query: string): any[] | null {
  let raw: string;
  try {
    raw = execFileSync(
      "curl",
      [
        "-sS",
        "-X", "POST",
        "--max-time", "60",
        "-H", "Content-Type: application/x-www-form-urlencoded",
        "--data-urlencode", `data=${query.trim()}`,
        OVERPASS_URL,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
  } catch (err: any) {
    console.error(`  ❌ curl failed: ${err.message}`);
    return null;
  }
  try {
    const data = JSON.parse(raw);
    return data.elements || [];
  } catch {
    console.error(`  ❌ JSON parse failed (got ${raw.length} bytes)`);
    return null;
  }
}

async function fetchAirportBoundary(
  icao: string
): Promise<AirportFeature | null> {
  // Query: aeroway=aerodrome (way/relation for polygons, node for fallback anchor)
  const query = `
[out:json][timeout:30];
(
  way["aeroway"="aerodrome"]["icao"="${icao}"];
  relation["aeroway"="aerodrome"]["icao"="${icao}"];
  node["aeroway"="aerodrome"]["icao"="${icao}"];
);
out body;
>;
out skel qt;
  `;

  const elements = runOverpass(query);
  if (!elements) return null;

  // Build node lookup
  const nodes: Record<number, [number, number]> = {};
  for (const el of elements) {
    if (el.type === "node") {
      nodes[el.id] = [el.lon, el.lat];
    }
  }

  // Find way or relation with aerodrome
  const aerodromes = elements.filter(
    (el: any) =>
      (el.type === "way" || el.type === "relation") &&
      el.tags?.aeroway === "aerodrome"
  );

  if (aerodromes.length === 0) {
    // Fallback: try to build polygon from nearby runway(s) using aerodrome node as anchor
    const aeroNode = elements.find(
      (el: any) => el.type === "node" && el.tags?.aeroway === "aerodrome"
    );
    if (!aeroNode) return null;
    return buildRunwayBufferFeature(icao, aeroNode);
  }

  const aerodrome = aerodromes[0];
  let coordinates: number[][] = [];

  if (aerodrome.type === "way" && aerodrome.nodes) {
    coordinates = aerodrome.nodes
      .map((nid: number) => nodes[nid])
      .filter(Boolean);
  } else if (aerodrome.type === "relation" && aerodrome.members) {
    // For relations, find outer way members
    const outerWays = aerodrome.members.filter(
      (m: any) => m.type === "way" && (m.role === "outer" || m.role === "")
    );

    // Collect all way segments
    const waySegments: number[][][] = [];
    for (const member of outerWays) {
      const way = elements.find(
        (el: any) => el.type === "way" && el.id === member.ref
      );
      if (way?.nodes) {
        const segment = way.nodes
          .map((nid: number) => nodes[nid])
          .filter(Boolean);
        waySegments.push(segment);
      }
    }

    // Try to join segments into a ring
    if (waySegments.length === 1) {
      coordinates = waySegments[0];
    } else if (waySegments.length > 1) {
      coordinates = joinSegments(waySegments);
    }
  }

  if (coordinates.length < 3) {
    return null;
  }

  // Ensure ring is closed
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coordinates.push([...first]);
  }

  const tags = aerodrome.tags || {};

  return {
    type: "Feature",
    properties: {
      name: tags.name || tags["name:ja"] || icao,
      name_en: tags["name:en"] || tags.name || icao,
      icao: icao,
      iata: tags.iata || "",
    },
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
  };
}

// ── Runway buffer fallback（小機場 OSM 無 aerodrome polygon）──────────────

const METERS_PER_DEG_LAT = 111320;
const RUNWAY_END_BUFFER_M = 200;  // 跑道兩端延伸（apron + safety）
const RUNWAY_WIDTH_HALF_M = 150;  // 跑道中心向兩側的緩衝（含航廈 + taxiway）
const RUNWAY_SEARCH_BBOX_DEG = 0.02;  // ~2km 搜尋半徑

function bufferRunway(runway: number[][]): number[][] {
  if (runway.length < 2) return [];
  const [sx, sy] = runway[0];
  const [ex, ey] = runway[runway.length - 1];
  const midLat = (sy + ey) / 2;
  const mLat = 1 / METERS_PER_DEG_LAT;
  const mLon = 1 / (METERS_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180));

  // 方向向量（轉為公尺）
  const dxM = (ex - sx) / mLon;
  const dyM = (ey - sy) / mLat;
  const lenM = Math.hypot(dxM, dyM);
  if (lenM < 1) return [];
  const ux = dxM / lenM;
  const uy = dyM / lenM;
  // 垂直向量
  const px = -uy;
  const py = ux;

  // 兩端延伸
  const extSx = sx - ux * RUNWAY_END_BUFFER_M * mLon;
  const extSy = sy - uy * RUNWAY_END_BUFFER_M * mLat;
  const extEx = ex + ux * RUNWAY_END_BUFFER_M * mLon;
  const extEy = ey + uy * RUNWAY_END_BUFFER_M * mLat;

  // 4 個角
  const c1 = [extSx + px * RUNWAY_WIDTH_HALF_M * mLon, extSy + py * RUNWAY_WIDTH_HALF_M * mLat];
  const c2 = [extEx + px * RUNWAY_WIDTH_HALF_M * mLon, extEy + py * RUNWAY_WIDTH_HALF_M * mLat];
  const c3 = [extEx - px * RUNWAY_WIDTH_HALF_M * mLon, extEy - py * RUNWAY_WIDTH_HALF_M * mLat];
  const c4 = [extSx - px * RUNWAY_WIDTH_HALF_M * mLon, extSy - py * RUNWAY_WIDTH_HALF_M * mLat];
  return [c1, c2, c3, c4, c1];
}

function buildRunwayBufferFeature(
  icao: string,
  aeroNode: any
): AirportFeature | null {
  const lat = aeroNode.lat;
  const lon = aeroNode.lon;
  const dLat = RUNWAY_SEARCH_BBOX_DEG;
  const dLon = RUNWAY_SEARCH_BBOX_DEG / Math.cos((lat * Math.PI) / 180);
  const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon}`;

  const query = `
[out:json][timeout:30];
way["aeroway"="runway"](${bbox});
out body;
>;
out skel qt;
  `;
  const elements = runOverpass(query);
  if (!elements) return null;

  const nodes: Record<number, [number, number]> = {};
  for (const el of elements as any[]) {
    if (el.type === "node") nodes[el.id] = [el.lon, el.lat];
  }

  // 選最長的 runway 作為 buffer 來源
  let bestCoords: number[][] = [];
  let bestLen = 0;
  for (const el of elements as any[]) {
    if (el.type !== "way" || el.tags?.aeroway !== "runway") continue;
    const coords = (el.nodes || [])
      .map((nid: number) => nodes[nid])
      .filter(Boolean) as number[][];
    if (coords.length < 2) continue;
    const [a, b] = [coords[0], coords[coords.length - 1]];
    const len = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (len > bestLen) {
      bestLen = len;
      bestCoords = coords;
    }
  }
  if (bestCoords.length < 2) return null;

  const polygon = bufferRunway(bestCoords);
  if (polygon.length < 4) return null;

  const tags = aeroNode.tags || {};
  console.log(`  ⚠ fallback runway-buffer (${polygon.length - 1} pts)`);
  return {
    type: "Feature",
    properties: {
      name: tags.name || icao,
      name_en: tags["name:en"] || tags.name || icao,
      icao,
      iata: tags.iata || "",
    },
    geometry: {
      type: "Polygon",
      coordinates: [polygon],
    },
  };
}

function joinSegments(segments: number[][][]): number[][] {
  if (segments.length === 0) return [];

  const result = [...segments[0]];
  const remaining = segments.slice(1);

  while (remaining.length > 0) {
    const lastPt = result[result.length - 1];
    let bestIdx = -1;
    let bestReverse = false;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const startDist = distance(lastPt, seg[0]);
      const endDist = distance(lastPt, seg[seg.length - 1]);

      if (startDist < bestDist) {
        bestDist = startDist;
        bestIdx = i;
        bestReverse = false;
      }
      if (endDist < bestDist) {
        bestDist = endDist;
        bestIdx = i;
        bestReverse = true;
      }
    }

    if (bestIdx === -1) break;

    const seg = remaining.splice(bestIdx, 1)[0];
    const pts = bestReverse ? [...seg].reverse() : seg;
    // Skip first point if it matches last (avoid duplicate)
    const start = distance(lastPt, pts[0]) < 0.0001 ? 1 : 0;
    result.push(...pts.slice(start));
  }

  return result;
}

function distance(a: number[], b: number[]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  let targetIcaos: string[] = [];

  if (args.includes("--missing")) {
    // 自動找出 flight-list 中有但 airports.geojson 沒有的日本機場
    const geo = loadGeoJSON();
    const existing = new Set(geo.features.map((f) => f.properties.icao));
    const fl = JSON.parse(fs.readFileSync(FLIGHT_LIST_PATH, "utf8"));
    const jpSet = new Set<string>();
    for (const f of fl.flights) {
      if (f.orig_icao?.match(/^(RJ|RO)/)) jpSet.add(f.orig_icao);
      if (f.dest_icao?.match(/^(RJ|RO)/)) jpSet.add(f.dest_icao);
    }
    targetIcaos = [...jpSet].filter((a) => !existing.has(a)).sort();
  } else if (args.includes("--icao")) {
    const idx = args.indexOf("--icao");
    targetIcaos = args[idx + 1]?.split(",").filter(Boolean) || [];
  } else {
    console.log(
      "Usage:\n  --missing          自動補齊 flight-list 中缺少的日本機場\n  --icao RJBE,RJOA   指定 ICAO 代碼"
    );
    process.exit(1);
  }

  if (targetIcaos.length === 0) {
    console.log("✅ 沒有需要補齊的機場");
    return;
  }

  console.log(`=== 抓取 ${targetIcaos.length} 座機場邊界 ===\n`);

  const geo = loadGeoJSON();
  const existingIcaos = new Set(geo.features.map((f) => f.properties.icao));

  let added = 0;
  let failed: string[] = [];

  for (let i = 0; i < targetIcaos.length; i++) {
    const icao = targetIcaos[i];
    if (existingIcaos.has(icao)) {
      console.log(`[${i + 1}/${targetIcaos.length}] ${icao} ... ⏭ 已存在`);
      continue;
    }

    process.stdout.write(
      `[${i + 1}/${targetIcaos.length}] ${icao} ... `
    );

    try {
      const feature = await fetchAirportBoundary(icao);
      if (feature) {
        geo.features.push(feature);
        existingIcaos.add(icao);
        added++;
        console.log(
          `✅ ${feature.properties.name_en} (${feature.geometry.coordinates[0].length} pts)`
        );

        // 每次成功都存檔（防中斷）
        if (added % 5 === 0) {
          saveGeoJSON(geo);
        }
      } else {
        failed.push(icao);
        console.log("❌ 找不到邊界");
      }
    } catch (err: any) {
      failed.push(icao);
      console.log(`❌ ${err.message}`);
    }

    if (i < targetIcaos.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // 最終存檔
  saveGeoJSON(geo);

  console.log(`\n=== 完成 ===`);
  console.log(`新增: ${added} 座`);
  console.log(`失敗: ${failed.length} 座`);
  if (failed.length > 0) {
    console.log(`失敗清單: ${failed.join(", ")}`);
  }
  console.log(`總計: ${geo.features.length} 座機場`);
}

main().catch(console.error);
