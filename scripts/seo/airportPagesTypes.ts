/**
 * 機場靜態頁（/airports/<icao>/）的資料契約。
 *
 * scripts/seo/build-airport-pages-data.ts 從本機 public/tracks/（gitignored）算出
 * scripts/seo/airport-pages-data.json（進 git）；build 時 scripts/seo/generate-airport-pages.ts
 * 只讀這份 JSON 與 public/airport-points.geojson 產生 HTML（Zeabur build 拿不到 tracks）。
 * 抓完軌跡後要重跑 build-airport-pages-data.ts，否則頁面數字停在舊的 generatedAt。
 */

/** 收錄航班數達此門檻的機場才產生頁面（太少的頁面內容單薄，會被判為重複的薄內容） */
export const MIN_FLIGHTS_FOR_PAGE = 30;

export interface AirportPagesData {
  /** 直接沿用 public/tracks/manifest.json 的 generatedAt */
  generatedAt: string;
  minFlights: number;
  /** 依 flights 由多到少排序 */
  airports: AirportPageEntry[];
}

export interface AirportPageEntry {
  icao: string;
  iata: string | null;
  nameZh: string | null;
  nameEn: string;
  city: string | null;
  /** ISO 3166-1 alpha-2（airport-points.geojson 的 country） */
  country: string | null;
  lat: number;
  lng: number;
  /** manifest.airports[icao].flights：此機場檔的不重複航班（進場＋離場） */
  flights: number;
  /** datesArr／datesDep 加總 */
  arr: number;
  dep: number;
  /** 有資料的日期（YYYY-MM-DD，遞增） */
  dates: string[];
  /** manifest 的 fullDates（與 Atlas「完整」同一判定） */
  fullDates: string[];
  /** 往來機場前 10 名（依 total 排序；對端 ICAO 空白的航班不計入） */
  topRoutes: RouteStat[];
  /** 航空公司前 8 名（callsign 前 2–3 個大寫字母；沒 match 的不計，不像 flightStats.ts getAirlineStats 補 "???"） */
  topAirlines: { code: string; count: number }[];
  /** 機型前 8 名（aircraft_type；空白不計入） */
  topAircraft: { type: string; count: number }[];
}

export interface RouteStat {
  /** 對端機場 ICAO */
  icao: string;
  /** 從對端飛來本機場的航班數 */
  arr: number;
  /** 從本機場飛往對端的航班數 */
  dep: number;
  total: number;
}
