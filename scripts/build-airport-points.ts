/**
 * 產出 public/airport-points.geojson — Atlas 面板用的「所有機場總覽」點集
 *
 *   npx tsx scripts/build-airport-points.ts
 *
 * 點集 = manifest 已抓機場 ∪ top1000 目標機場（union ~2062 座）。
 * 每個 Point 帶 properties：icao/iata/name/nameZh/nameEn/city/country/continent/rank/
 *   dailyProxy（圓圈大小用）/capturedFlights/estDaily/status（顏色用）。
 *
 * 資料來源（皆本地，部分 gitignored）：
 *   public/tracks/manifest.json         → 已抓機場 flights/isCore/dates/fullDates
 *   scripts/top1000-airports.json       → rank/iata/name/country/continent/est_daily_flights
 *   scripts/airports-coords.json        → ident → [lat,lng]（主座標索引）
 *   scripts/airports-cache.csv          → 座標/name/city/keywords/country/continent（備援 + 搜尋詞）
 *   public/airports.geojson             → 中英文機場名（有資料者）
 *   src/map/cameraPresets.ts AIRPORT_INFO→ 中文名（優先顯示）
 *
 * 抓完新批次、跑完 split-tracks 後重跑本腳本，讓完整度/航班數同步。
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { AIRPORT_INFO } from "../src/map/cameraPresets";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── 讀資料 ──────────────────────────────────────────
interface ManifestEntry {
  flights: number;
  isCore?: boolean;
  dates?: Record<string, number>;
  fullDates?: string[];
}
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "public/tracks/manifest.json"), "utf-8"),
) as { airports: Record<string, ManifestEntry> };

interface Top1000Entry {
  icao: string;
  iata?: string;
  name?: string;
  country?: string;
  continent?: string;
  rank?: number;
  est_daily_flights?: number;
}
const top1000raw = JSON.parse(
  readFileSync(resolve(ROOT, "scripts/top1000-airports.json"), "utf-8"),
);
const top1000: Top1000Entry[] = Array.isArray(top1000raw)
  ? top1000raw
  : top1000raw.airports ?? [];
const top1000Map = new Map<string, Top1000Entry>();
for (const a of top1000) top1000Map.set(a.icao, a);

// ident → [lat,lng]
const coordsByIdent = JSON.parse(
  readFileSync(resolve(ROOT, "scripts/airports-coords.json"), "utf-8"),
) as Record<string, [number, number]>;

// ── 解析 CSV（icao_code → {lat,lng,name,country,continent,iata}）──
interface CsvEntry {
  lat: number;
  lng: number;
  name: string;
  iata: string;
  country: string;
  continent: string;
  city: string;
  regionCode: string;
  localCode: string;
  searchKeywords: string[];
}
const csvByIcao = new Map<string, CsvEntry>();
{
  const csv = readFileSync(resolve(ROOT, "scripts/airports-cache.csv"), "utf-8");
  const lines = csv.split("\n");
  const header = parseCsvLine(lines[0]!);
  const col = (name: string) => header.indexOf(name);
  const iIdent = col("ident");
  const iLat = col("latitude_deg");
  const iLng = col("longitude_deg");
  const iName = col("name");
  const iCont = col("continent");
  const iCountry = col("iso_country");
  const iIcao = col("icao_code");
  const iIata = col("iata_code");
  const iCity = col("municipality");
  const iRegion = col("iso_region");
  const iLocalCode = col("local_code");
  const iKeywords = col("keywords");
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n];
    if (!line) continue;
    const f = parseCsvLine(line);
    const icao = (f[iIcao] || f[iIdent] || "").toUpperCase();
    if (!icao) continue;
    const lat = parseFloat(f[iLat] || "");
    const lng = parseFloat(f[iLng] || "");
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    if (!csvByIcao.has(icao)) {
      csvByIcao.set(icao, {
        lat,
        lng,
        name: f[iName] || "",
        iata: f[iIata] || "",
        country: f[iCountry] || "",
        continent: f[iCont] || "",
        city: f[iCity] || "",
        regionCode: f[iRegion] || "",
        localCode: f[iLocalCode] || "",
        searchKeywords: (f[iKeywords] || "")
          .split(/[,;]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      });
    }
  }
}

interface LocalizedAirportName {
  nameZh: string;
  nameEn: string;
}

const localizedNames = new Map<string, LocalizedAirportName>();
{
  const geojson = JSON.parse(
    readFileSync(resolve(ROOT, "public/airports.geojson"), "utf-8"),
  ) as {
    features?: Array<{
      properties?: { icao?: string; name?: string; name_en?: string };
    }>;
  };
  for (const feature of geojson.features ?? []) {
    const properties = feature.properties;
    const icao = properties?.icao?.toUpperCase();
    if (!icao) continue;
    localizedNames.set(icao, {
      nameZh: properties?.name || "",
      nameEn: properties?.name_en || "",
    });
  }
}

/** 最小 CSV 行解析（處理雙引號包住的逗號欄位） */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// ── Join ────────────────────────────────────────────
type Status = "complete" | "core-partial" | "partial" | "planned";

const union = new Set<string>([
  ...Object.keys(manifest.airports),
  ...top1000.map((a) => a.icao),
]);

const features: unknown[] = [];
let noCoord = 0;
const statusCount: Record<Status, number> = {
  complete: 0,
  "core-partial": 0,
  partial: 0,
  planned: 0,
};

for (const icao of union) {
  const m = manifest.airports[icao];
  const t = top1000Map.get(icao);
  const csv = csvByIcao.get(icao);
  const localized = localizedNames.get(icao);

  // 座標：coords.json（byIdent）優先，CSV（byIcao）備援
  const ll = coordsByIdent[icao] ?? (csv ? [csv.lat, csv.lng] : null);
  if (!ll) {
    noCoord++;
    continue;
  }
  const [lat, lng] = ll;

  // 完整度分級
  let status: Status;
  if (m && (m.fullDates?.length ?? 0) > 0) status = "complete";
  else if (m && m.isCore) status = "core-partial";
  else if (m) status = "partial";
  else status = "planned";
  statusCount[status]++;

  // 圓圈大小：日均代理值（top1000 用估計，manifest-only 用 累計/天數）
  const nDates = m?.dates ? Object.keys(m.dates).length : 0;
  const dailyProxy =
    t?.est_daily_flights ??
    (m ? Math.round(m.flights / Math.max(1, nDates)) : 0);

  const name =
    AIRPORT_INFO[icao]?.name || t?.name || csv?.name || icao;
  const iata = t?.iata || AIRPORT_INFO[icao]?.iata || csv?.iata || "";

  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      icao,
      iata,
      name,
      nameZh: localized?.nameZh || null,
      nameEn: localized?.nameEn || t?.name || csv?.name || null,
      city: csv?.city || null,
      regionCode: csv?.regionCode || null,
      localCode: csv?.localCode || null,
      searchKeywords: csv?.searchKeywords ?? [],
      country: t?.country || csv?.country || "",
      continent: t?.continent || csv?.continent || "",
      rank: t?.rank ?? null,
      status,
      dailyProxy,
      capturedFlights: m?.flights ?? null,
      estDaily: t?.est_daily_flights ?? null,
    },
  });
}

const geojson = { type: "FeatureCollection", features };
const outPath = resolve(ROOT, "public/airport-points.geojson");
writeFileSync(outPath, JSON.stringify(geojson));

console.log("=== build-airport-points ===");
console.log(`union 機場: ${union.size}`);
console.log(`  無座標略過: ${noCoord}`);
console.log(`  產出 features: ${features.length}`);
console.log("完整度分級:");
console.log(`  complete(完整):      ${statusCount.complete}`);
console.log(`  core-partial(核心):  ${statusCount["core-partial"]}`);
console.log(`  partial(部分附帶):   ${statusCount.partial}`);
console.log(`  planned(僅規劃):     ${statusCount.planned}`);
console.log(`→ ${outPath}`);
