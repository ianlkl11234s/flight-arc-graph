/**
 * 機場 metadata loader — 讀 public/airport-points.geojson（由 build-airport-points.ts 產生，
 * 與 Atlas 星圖共用同一份），轉成 Record<ICAO, AirportMeta>。
 *
 * 用途：讓「有軌跡資料但沒 camera preset」的機場也能被搜尋（名稱/IATA）、
 * 出現在 Location 清單、並可正確 fly-to（座標）。
 *
 * 路徑 fallback 比照專案慣例：/data/（Zeabur volume）→ /（local public）→ S3。
 * 載入失敗一律 graceful degrade 回空物件，UI 退回現況行為。
 */

/** Atlas airport coverage status. */
export type AirportStatus = "complete" | "core-partial" | "partial" | "planned";

export interface AirportMeta {
  name: string;
  nameZh: string;
  nameEn: string;
  iata: string;
  lat: number;
  lng: number;
  country: string;
  continent: string;
  city: string;
  regionCode: string;
  localCode: string;
  searchKeywords: string[];
  /** Atlas data coverage classification. */
  status: AirportStatus;
  /** Top-1000 rank, when this airport is in the project list. */
  rank: number | null;
  /** Number of captured flights represented by the airport manifest. */
  capturedFlights: number | null;
  /** Estimated daily flights from the Top-1000 source. */
  estDaily: number | null;
  /** Daily proxy used by Atlas point size. */
  dailyProxy: number;
}

const S3_BASE =
  "https://migu-gis-data-collector.s3.ap-southeast-2.amazonaws.com/flight-arc";

const CANDIDATE_URLS = [
  "/data/airport-points.geojson",
  "/airport-points.geojson",
  `${S3_BASE}/airport-points.geojson`,
];

interface GeoFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    icao?: string;
    iata?: string;
    name?: string;
    nameZh?: string | null;
    nameEn?: string | null;
    country?: string;
    continent?: string;
    city?: string | null;
    regionCode?: string | null;
    localCode?: string | null;
    searchKeywords?: string[];
    status?: AirportStatus;
    rank?: number | null;
    capturedFlights?: number | null;
    estDaily?: number | null;
    dailyProxy?: number;
  };
}

function isAirportStatus(value: unknown): value is AirportStatus {
  return value === "complete" || value === "core-partial" || value === "partial" || value === "planned";
}

let cache: Record<string, AirportMeta> | null = null;
let inflight: Promise<Record<string, AirportMeta>> | null = null;

/** 載入機場 metadata（fetch 一次、cache）。失敗回空物件。 */
export function loadAirportMeta(): Promise<Record<string, AirportMeta>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  inflight = (async () => {
    for (const url of CANDIDATE_URLS) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const text = await res.text();
        // dev server 對缺檔常回 index.html，避免把 HTML 當 JSON parse
        if (text.trimStart().startsWith("<")) continue;
        const geo = JSON.parse(text) as { features: GeoFeature[] };
        const out: Record<string, AirportMeta> = {};
        for (const f of geo.features) {
          const p = f.properties;
          if (!p.icao) continue;
          const [lng, lat] = f.geometry.coordinates;
          out[p.icao] = {
            name: p.name || p.icao,
            nameZh: p.nameZh || "",
            nameEn: p.nameEn || "",
            iata: p.iata || "",
            lat,
            lng,
            country: p.country || "",
            continent: p.continent || "",
            city: p.city || "",
            regionCode: p.regionCode || "",
            localCode: p.localCode || "",
            searchKeywords: Array.isArray(p.searchKeywords) ? p.searchKeywords.filter((value): value is string => typeof value === "string") : [],
            status: isAirportStatus(p.status) ? p.status : "planned",
            rank: typeof p.rank === "number" ? p.rank : null,
            capturedFlights: typeof p.capturedFlights === "number" ? p.capturedFlights : null,
            estDaily: typeof p.estDaily === "number" ? p.estDaily : null,
            dailyProxy: typeof p.dailyProxy === "number" ? p.dailyProxy : 0,
          };
        }
        cache = out;
        return out;
      } catch {
        // 換下一個候選路徑
      }
    }
    console.warn("[airportMeta] 載入失敗，Location 清單/搜尋退回現況（僅 preset）");
    cache = {};
    return cache;
  })();

  return inflight;
}
