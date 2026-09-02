import type {
  Flight,
  DailyStat,
  HourlyStat,
  DestinationStat,
  CountryGroup,
  AirportComparison,
  AircraftTypeStat,
  AirlineStat,
  DurationBucket,
  DomesticRoute,
} from "../types";
import { ICAO_TO_IATA } from "./flightLoader";
import { AIRPORT_INFO } from "../map/cameraPresets";

/** 航班出發時間：優先 dep_time，其次 path 首點 t（path 為空回傳 0，與舊版 tuple optional chaining ?? 0 語意相同） */
function flightDepTs(f: Flight): number {
  return f.dep_time > 0 ? f.dep_time : f.path.length > 0 ? f.path.t(0) : 0;
}

/** 航班抵達時間：優先 arr_time，其次 path 末點 t（path 為空回傳 0） */
function flightArrTs(f: Flight): number {
  return f.arr_time > 0 ? f.arr_time : f.path.length > 0 ? f.path.t(f.path.length - 1) : 0;
}

/** ICAO prefix → 國家/地區名稱 */
const ICAO_PREFIX_COUNTRY: Record<string, string> = {
  RC: "Taiwan",
  RJ: "Japan",
  RO: "Okinawa/Japan",
  RK: "Korea",
  VH: "Hong Kong",
  VM: "Macau",
  ZB: "China",
  ZG: "China",
  ZH: "China",
  ZS: "China",
  ZU: "China",
  ZP: "China",
  ZW: "China",
  ZL: "China",
  ZJ: "China",
  WS: "Singapore",
  WM: "Malaysia",
  WB: "Malaysia",
  WA: "Indonesia",
  WI: "Indonesia",
  VT: "Thailand",
  RP: "Philippines",
  VV: "Vietnam",
  VD: "Cambodia",
  VL: "Laos",
  VY: "Myanmar",
  VI: "India",
  NZ: "New Zealand",
  YB: "Australia",
  YM: "Australia",
  OM: "UAE",
  OT: "Qatar",
  OB: "Bahrain",
  OE: "Saudi Arabia",
  KJ: "USA",
  KL: "USA",
  KS: "USA",
  KO: "USA",
  KD: "USA",
  KI: "USA",
  KP: "USA",
  PA: "USA",
  PH: "USA",
  PG: "USA",
  CY: "Canada",
  EG: "UK",
  EH: "Netherlands",
  LF: "France",
  ED: "Germany",
  LI: "Italy",
  LK: "Czech Republic",
  LO: "Austria",
  LT: "Turkey",
  PT: "Pacific Islands",
};

function getCountry(icao: string): string {
  // Try 2-char prefix first (most ICAO codes)
  const p2 = icao.slice(0, 2);
  if (ICAO_PREFIX_COUNTRY[p2]) return ICAO_PREFIX_COUNTRY[p2];
  return "Other";
}

function resolveIata(icao: string): string {
  return ICAO_TO_IATA[icao] ?? icao;
}

function toTaipeiDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Taipei",
  });
}

/** 取得台北時區的小時 */
function getTaipeiHour(ts: number): number {
  const d = new Date(ts * 1000);
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const taipei = new Date(utc + 8 * 3600000);
  return taipei.getHours();
}

/** 篩選與特定機場相關的航班 */
function airportFlights(flights: Flight[], icao: string): Flight[] {
  return flights.filter(
    (f) => f.origin_icao === icao || f.dest_icao === icao,
  );
}

/** 每日統計：出發 / 到達數 */
export function computeDailyStats(
  flights: Flight[],
  icao: string,
): DailyStat[] {
  const af = airportFlights(flights, icao);
  const map = new Map<
    string,
    { departures: number; arrivals: number; total: number }
  >();

  for (const f of af) {
    const ts = flightDepTs(f);
    if (ts === 0) continue;
    const date = toTaipeiDate(ts);
    const entry = map.get(date) ?? { departures: 0, arrivals: 0, total: 0 };
    if (f.origin_icao === icao) entry.departures++;
    if (f.dest_icao === icao) entry.arrivals++;
    entry.total++;
    map.set(date, entry);
  }

  return [...map.entries()]
    .map(([date, s]) => ({ date, ...s }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 24 小時分佈 */
export function computeHourlyStats(
  flights: Flight[],
  icao: string,
): HourlyStat[] {
  const af = airportFlights(flights, icao);
  const hours = new Array(24).fill(0) as number[];

  for (const f of af) {
    const ts = flightDepTs(f);
    if (ts === 0) continue;
    hours[getTaipeiHour(ts)]!++;
  }

  return hours.map((count, hour) => ({ hour, count }));
}

/** 目的地統計（從指定機場出發到哪裡） */
export function computeDestinationStats(
  flights: Flight[],
  icao: string,
): DestinationStat[] {
  const departures = flights.filter((f) => f.origin_icao === icao);
  const map = new Map<string, number>();

  for (const f of departures) {
    map.set(f.dest_icao, (map.get(f.dest_icao) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([destIcao, count]) => ({
      icao: destIcao,
      iata: resolveIata(destIcao),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/** 按國家分組 */
export function groupByCountry(stats: DestinationStat[]): CountryGroup[] {
  const map = new Map<string, DestinationStat[]>();

  for (const s of stats) {
    const country = getCountry(s.icao);
    const arr = map.get(country) ?? [];
    arr.push(s);
    map.set(country, arr);
  }

  return [...map.entries()]
    .map(([country, airports]) => ({
      country,
      airports: airports.sort((a, b) => b.count - a.count),
      totalFlights: airports.reduce((sum, a) => sum + a.count, 0),
    }))
    .sort((a, b) => b.totalFlights - a.totalFlights);
}

/** 台灣機場比較 */
export function computeAirportComparison(
  flights: Flight[],
): AirportComparison[] {
  const map = new Map<string, number>();

  for (const f of flights) {
    if (f.origin_icao.startsWith("RC")) {
      map.set(f.origin_icao, (map.get(f.origin_icao) ?? 0) + 1);
    }
    if (f.dest_icao.startsWith("RC")) {
      map.set(f.dest_icao, (map.get(f.dest_icao) ?? 0) + 1);
    }
  }

  return [...map.entries()]
    .map(([icao, count]) => ({
      icao,
      iata: resolveIata(icao),
      name: AIRPORT_INFO[icao]?.name ?? icao,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/** 機型統計 */
export function getAircraftTypeStats(
  flights: Flight[],
  icao: string,
): AircraftTypeStat[] {
  const af = airportFlights(flights, icao);
  const map = new Map<string, number>();

  for (const f of af) {
    const t = f.aircraft_type || "Unknown";
    map.set(t, (map.get(t) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

/** 航空公司統計（callsign 前 2-3 碼） */
export function getAirlineStats(
  flights: Flight[],
  icao: string,
): AirlineStat[] {
  const af = airportFlights(flights, icao);
  const map = new Map<string, number>();

  for (const f of af) {
    // Extract airline code: first 2-3 letters from callsign
    const match = f.callsign.match(/^([A-Z]{2,3})/);
    const code = match?.[1] ?? (f.callsign.slice(0, 3) || "???");
    map.set(code, (map.get(code) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
}

/** 飛行時間分佈 */
export function getFlightDurationDistribution(
  flights: Flight[],
  icao: string,
): DurationBucket[] {
  const af = airportFlights(flights, icao);
  const buckets: DurationBucket[] = [
    { label: "< 1h", tag: "domestic", min: 0, max: 60, count: 0 },
    { label: "1-3h", tag: "regional", min: 60, max: 180, count: 0 },
    { label: "3-6h", tag: "medium", min: 180, max: 360, count: 0 },
    { label: "6h+", tag: "long-haul", min: 360, max: Infinity, count: 0 },
  ];

  for (const f of af) {
    const dep = flightDepTs(f);
    const arr = flightArrTs(f);
    if (dep === 0 || arr === 0) continue;
    const mins = (arr - dep) / 60;
    if (mins <= 0) continue;
    for (const b of buckets) {
      if (mins >= b.min && mins < b.max) {
        b.count++;
        break;
      }
    }
  }

  return buckets;
}

/** 特定航線的航班清單 */
export function getRouteFlights(
  flights: Flight[],
  originIcao: string,
  destIcao: string,
): Flight[] {
  return flights
    .filter((f) => f.origin_icao === originIcao && f.dest_icao === destIcao)
    .sort((a, b) => a.dep_time - b.dep_time);
}

/** 可達目的地（按國家分組 — All Region view） */
export function computeReachableDestinations(
  flights: Flight[],
): CountryGroup[] {
  // Only departures from Taiwan
  const twDepartures = flights.filter((f) =>
    f.origin_icao.startsWith("RC") && !f.dest_icao.startsWith("RC"),
  );
  const map = new Map<string, Map<string, number>>();

  for (const f of twDepartures) {
    const country = getCountry(f.dest_icao);
    if (!map.has(country)) map.set(country, new Map());
    const airports = map.get(country)!;
    airports.set(f.dest_icao, (airports.get(f.dest_icao) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([country, airports]) => ({
      country,
      airports: [...airports.entries()]
        .map(([icao, count]) => ({ icao, iata: resolveIata(icao), count }))
        .sort((a, b) => b.count - a.count),
      totalFlights: [...airports.values()].reduce((s, c) => s + c, 0),
    }))
    .sort((a, b) => b.totalFlights - a.totalFlights);
}

/** 國內航線統計 */
export function computeDomesticRoutes(flights: Flight[]): DomesticRoute[] {
  const domestic = flights.filter(
    (f) => f.origin_icao.startsWith("RC") && f.dest_icao.startsWith("RC"),
  );
  const map = new Map<string, number>();

  for (const f of domestic) {
    // Normalize route key (sort ICAO to avoid A→B / B→A duplicates)
    const pair =
      f.origin_icao < f.dest_icao
        ? `${f.origin_icao}|${f.dest_icao}`
        : `${f.dest_icao}|${f.origin_icao}`;
    map.set(pair, (map.get(pair) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split("|") as [string, string];
      return {
        from,
        to,
        fromIata: resolveIata(from),
        toIata: resolveIata(to),
        count,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/** 計算資料涵蓋天數 */
export function getUniqueDays(flights: Flight[], icao: string): number {
  const af = airportFlights(flights, icao);
  const dates = new Set<string>();
  for (const f of af) {
    const ts = flightDepTs(f);
    if (ts > 0) dates.add(toTaipeiDate(ts));
  }
  return dates.size;
}

/** 國家 → 2 字母代碼 */
const COUNTRY_CODE: Record<string, string> = {
  Taiwan: "TW", Japan: "JP", "Okinawa/Japan": "JP", Korea: "KR",
  "Hong Kong": "HK", Macau: "MO", China: "CN", Singapore: "SG",
  Malaysia: "MY", Indonesia: "ID", Thailand: "TH", Philippines: "PH",
  Vietnam: "VN", Cambodia: "KH", Laos: "LA", Myanmar: "MM", India: "IN",
  "New Zealand": "NZ", Australia: "AU", UAE: "AE", Qatar: "QA",
  Bahrain: "BH", "Saudi Arabia": "SA", USA: "US", Canada: "CA",
  UK: "GB", Netherlands: "NL", France: "FR", Germany: "DE", Italy: "IT",
  "Czech Republic": "CZ", Austria: "AT", Turkey: "TR", "Pacific Islands": "PW",
};

export function getCountryCode(country: string): string {
  return COUNTRY_CODE[country] ?? country.slice(0, 2).toUpperCase();
}

/** Top Routes：特定機場出發的前 N 條航線 + 主要航空公司 */
export interface TopRoute {
  originIata: string;
  destIata: string;
  originIcao: string;
  destIcao: string;
  count: number;
  airlines: string[]; // top 2 airline codes
}

export function computeTopRoutes(
  flights: Flight[],
  icao: string,
  limit?: number,
): TopRoute[] {
  const departures = flights.filter((f) => f.origin_icao === icao);
  const routeMap = new Map<string, { count: number; airlines: Map<string, number> }>();

  for (const f of departures) {
    const key = f.dest_icao;
    if (!routeMap.has(key)) routeMap.set(key, { count: 0, airlines: new Map() });
    const entry = routeMap.get(key)!;
    entry.count++;
    const match = f.callsign.match(/^([A-Z]{2,3})/);
    const code = match?.[1] ?? "??";
    entry.airlines.set(code, (entry.airlines.get(code) ?? 0) + 1);
  }

  return [...routeMap.entries()]
    .map(([destIcao, data]) => ({
      originIata: resolveIata(icao),
      destIata: resolveIata(destIcao),
      originIcao: icao,
      destIcao,
      count: data.count,
      airlines: [...data.airlines.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([code]) => code),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit ?? Infinity);
}

/** Fleet Mix：機型分類為 Narrowbody / Widebody / Regional */
export interface FleetMixStat {
  category: string;
  count: number;
  percentage: number;
}

const WIDEBODY_TYPES = new Set([
  "A332", "A333", "A338", "A339", "A342", "A343", "A345", "A346",
  "A35K", "A359", "A380",
  "B744", "B748", "B763", "B764", "B772", "B773", "B77L", "B77W", "B788", "B789", "B78X",
]);

const REGIONAL_TYPES = new Set([
  "AT72", "AT76", "AT75", "DH8A", "DH8B", "DH8C", "DH8D",
  "E170", "E175", "E190", "E195", "CRJ2", "CRJ7", "CRJ9", "CRJX",
]);

export function getFleetMix(
  flights: Flight[],
  icao: string,
): FleetMixStat[] {
  const af = airportFlights(flights, icao);
  let narrowbody = 0, widebody = 0, regional = 0;

  for (const f of af) {
    const t = f.aircraft_type;
    if (WIDEBODY_TYPES.has(t)) widebody++;
    else if (REGIONAL_TYPES.has(t)) regional++;
    else narrowbody++;
  }

  const total = narrowbody + widebody + regional || 1;
  return [
    { category: "Narrowbody", count: narrowbody, percentage: Math.round((narrowbody / total) * 100) },
    { category: "Widebody", count: widebody, percentage: Math.round((widebody / total) * 100) },
    { category: "Regional", count: regional, percentage: Math.round((regional / total) * 100) },
  ];
}

/** 取得出發/到達分別的航班數 */
export function getDepArrCount(
  flights: Flight[],
  icao: string,
): { departures: number; arrivals: number } {
  let departures = 0, arrivals = 0;
  for (const f of flights) {
    if (f.origin_icao === icao) departures++;
    if (f.dest_icao === icao) arrivals++;
  }
  return { departures, arrivals };
}

/** 每小時起降分離統計（可篩選日期） */
export function computeHourlyDepArr(
  flights: Flight[],
  icao: string,
  date?: string,
): { hour: number; departures: number; arrivals: number }[] {
  const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, departures: 0, arrivals: 0 }));

  for (const f of flights) {
    if (f.origin_icao === icao) {
      const ts = flightDepTs(f);
      if (ts > 0 && (!date || toTaipeiDate(ts) === date)) {
        hours[getTaipeiHour(ts)]!.departures++;
      }
    }
    if (f.dest_icao === icao) {
      const ts = flightArrTs(f);
      if (ts > 0 && (!date || toTaipeiDate(ts) === date)) {
        hours[getTaipeiHour(ts)]!.arrivals++;
      }
    }
  }

  return hours;
}

/** 取得資料中出現的所有日期（台北時區） */
export function getAvailableDates(flights: Flight[], icao: string): string[] {
  const af = airportFlights(flights, icao);
  const dates = new Set<string>();
  for (const f of af) {
    const ts = flightDepTs(f);
    if (ts > 0) dates.add(toTaipeiDate(ts));
  }
  return [...dates].sort();
}

/** 按日期篩選航班 */
export function filterFlightsByDate(flights: Flight[], date: string): Flight[] {
  return flights.filter((f) => {
    const ts = flightDepTs(f);
    return ts > 0 && toTaipeiDate(ts) === date;
  });
}

/** 按多日期篩選航班 */
export function filterFlightsByDates(flights: Flight[], dates: string[]): Flight[] {
  const dateSet = new Set(dates);
  return flights.filter((f) => {
    const ts = flightDepTs(f);
    return ts > 0 && dateSet.has(toTaipeiDate(ts));
  });
}

/** 時間軸每小時一個 slot */
export interface TimelineSlot {
  date: string;
  hour: number;
  departures: number;
  arrivals: number;
}

/** 計算時間軸起降統計（跨日，每小時一筆） */
export function computeTimelineDepArr(
  flights: Flight[],
  icao: string,
  dates?: string[],
): TimelineSlot[] {
  const allDates = getAvailableDates(flights, icao);
  const targetDates = dates && dates.length > 0 ? [...dates].sort() : allDates;

  const slotMap = new Map<string, TimelineSlot>();
  for (const date of targetDates) {
    for (let h = 0; h < 24; h++) {
      slotMap.set(`${date}-${h}`, { date, hour: h, departures: 0, arrivals: 0 });
    }
  }

  for (const f of flights) {
    if (f.origin_icao === icao) {
      const ts = flightDepTs(f);
      if (ts > 0) {
        const slot = slotMap.get(`${toTaipeiDate(ts)}-${getTaipeiHour(ts)}`);
        if (slot) slot.departures++;
      }
    }
    if (f.dest_icao === icao) {
      const ts = flightArrTs(f);
      if (ts > 0) {
        const slot = slotMap.get(`${toTaipeiDate(ts)}-${getTaipeiHour(ts)}`);
        if (slot) slot.arrivals++;
      }
    }
  }

  return targetDates.flatMap((date) =>
    Array.from({ length: 24 }, (_, h) => slotMap.get(`${date}-${h}`)!)
  );
}
