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

export interface AirportMeta {
  name: string;
  iata: string;
  lat: number;
  lng: number;
  country: string;
  continent: string;
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
    country?: string;
    continent?: string;
  };
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
            iata: p.iata || "",
            lat,
            lng,
            country: p.country || "",
            continent: p.continent || "",
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
