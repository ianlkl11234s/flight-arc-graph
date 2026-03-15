import type { Flight, TrailPoint } from "../types";
import { AIRPORT_INFO } from "../map/cameraPresets";

/** ICAO → IATA 對照表：台灣機場 + 常見國際航點 */
export const ICAO_TO_IATA: Record<string, string> = {
  // 台灣機場（從 AIRPORT_INFO 展開）
  ...Object.fromEntries(
    Object.entries(AIRPORT_INFO).map(([icao, info]) => [icao, info.iata]),
  ),
  // 日本
  RJTT: "HND", RJAA: "NRT", RJBB: "KIX", RJOO: "ITM",
  RJFF: "FUK", RJCC: "CTS", RJFK: "KOJ", RJNS: "FSZ",
  RJNK: "KMQ", RJOT: "OKJ", RJOM: "MYJ", RJSN: "KIJ",
  RJGG: "NGO", RJBE: "UKB", RJCH: "OBO", RJFO: "OIT",
  RJFR: "KKJ", RJFT: "KMJ", RJNT: "TOY", RJOA: "HIJ",
  RJOB: "IWJ", RJOK: "KCZ", RJSS: "SDJ",
  // 沖繩
  ROAH: "OKA", ROIG: "ISG", RORS: "MMY",
  // 韓國
  RKSI: "ICN", RKSS: "GMP", RKPK: "PUS", RKPC: "CJU",
  RKTN: "TAE", RKTU: "CJJ",
  // 港澳中國
  VHHH: "HKG", VMMC: "MFM", ZGGG: "CAN", ZSPD: "PVG",
  ZSSS: "SHA", ZBAA: "PEK", ZGSZ: "SZX", ZUUU: "CTU",
  ZGHA: "CSX", ZUCK: "CKG", ZHCC: "CGO", ZSNJ: "NKG",
  ZHHH: "WUH", ZSAM: "XMN", ZSFZ: "FOC", ZSHC: "HGH",
  ZSNB: "NGB", ZUTF: "TFU",
  // 台灣離島 / 軍用
  RCCM: "CMJ", RCGI: "GNI", RCMT: "MFK", RCLY: "KYD", RCDC: "PIF",
  // 東南亞
  WSSS: "SIN", WMKK: "KUL", WMKP: "PEN", VTBS: "BKK",
  VTBD: "DMK", VTSP: "HKT", VTCC: "CNX",
  RPLL: "MNL", RPVM: "CEB", RPLC: "CRK",
  VVTS: "SGN", VVNB: "HAN", VVDN: "DAD", VVCR: "CXR",
  VVDL: "DLI", VVPQ: "PQC",
  WADD: "DPS", WIII: "CGK", WAMM: "MDC", WBKK: "BKI",
  VDPP: "PNH", VDTI: "REP", VLVT: "VTE", VYYY: "RGN",
  VIDP: "DEL",
  // 大洋洲
  NZAA: "AKL", YBBN: "BNE", YMML: "MEL",
  // 中東
  OMDB: "DXB", OMAA: "AUH", OMDW: "DWC",
  // 美洲
  KJFK: "JFK", KLAX: "LAX", KSFO: "SFO", KORD: "ORD",
  KSEA: "SEA", KDFW: "DFW", KIAH: "IAH", KONT: "ONT",
  KPHX: "PHX", PANC: "ANC", PHNL: "HNL", PGUM: "GUM",
  CYVR: "YVR", CYYZ: "YYZ",
  // 歐洲
  EGLL: "LHR", EHAM: "AMS", LFPG: "CDG", EDDF: "FRA",
  EDDM: "MUC", LIMC: "MXP", LKPR: "PRG", LOWW: "VIE",
  LTFM: "IST",
  // 其他
  PTRO: "TRO",
};

/** 解析 IATA 代碼：優先用既有值，其次查表，最後 fallback 到 ICAO */
function resolveIata(icao: string, existingIata: string): string {
  if (existingIata) return existingIata;
  return ICAO_TO_IATA[icao] ?? icao;
}

/**
 * 展開路徑經度，避免跨越 ±180° 換日線時折返
 * 例：lng 從 170 → -170 會被修正為 170 → 190
 */
function unwrapPathLongitudes(path: TrailPoint[]): TrailPoint[] {
  if (path.length < 2) return path;
  const result: TrailPoint[] = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const [lat, lng, alt, ts] = path[i]!;
    const prevLng = result[i - 1]![1];
    let adjustedLng = lng;
    while (adjustedLng - prevLng > 180) adjustedLng -= 360;
    while (adjustedLng - prevLng < -180) adjustedLng += 360;
    result.push([lat, adjustedLng, alt, ts]);
  }
  return result;
}

/**
 * 修正 FR24 資料中的英呎/公尺混用問題
 *
 * FR24 在低高度（~1000ft / ~300m）會從公尺切換成英呎回報，
 * 例如：降落時 ...320m, 312m, [1000ft, 975ft, 875ft...]
 * 被當作公尺渲染時，312→1000 會造成巨大的高度跳升。
 *
 * 策略：雙向掃描 + 黏著模式。初次偵測到英呎切換後，
 * 連續 3 次轉換即進入黏著模式，持續轉換直到明確回到公尺。
 */
function fixAltitudeUnits(path: TrailPoint[]): TrailPoint[] {
  if (path.length < 2) return path;
  const result: TrailPoint[] = path.map((pt) => [pt[0], pt[1], pt[2], pt[3]]);
  const FT_TO_M = 0.3048;
  const STICKY_THRESHOLD = 3; // 連續轉換幾次後進入黏著模式

  // 正向掃描：修正降落段（公尺→英呎切換）
  let streak = 0;
  for (let i = 1; i < result.length; i++) {
    const prevAlt = result[i - 1]![2];
    const currAlt = result[i]![2];
    const converted = Math.round(currAlt * FT_TO_M);
    const jumpRaw = Math.abs(currAlt - prevAlt);
    const jumpConv = Math.abs(converted - prevAlt);

    if (streak >= STICKY_THRESHOLD) {
      // 黏著模式：持續轉換，除非轉換結果明顯更差
      if (jumpConv <= jumpRaw * 2) {
        result[i]![2] = converted;
      } else {
        streak = 0;
      }
    } else if (jumpRaw > 200 && jumpConv < jumpRaw * 0.5) {
      result[i]![2] = converted;
      streak++;
    } else {
      streak = 0;
    }
  }

  // 反向掃描：修正起飛段（英呎→公尺切換）
  streak = 0;
  for (let i = result.length - 2; i >= 0; i--) {
    const nextAlt = result[i + 1]![2];
    const currAlt = result[i]![2];
    const converted = Math.round(currAlt * FT_TO_M);
    const jumpRaw = Math.abs(currAlt - nextAlt);
    const jumpConv = Math.abs(converted - nextAlt);

    if (streak >= STICKY_THRESHOLD) {
      if (jumpConv <= jumpRaw * 2) {
        result[i]![2] = converted;
      } else {
        streak = 0;
      }
    } else if (jumpRaw > 200 && jumpConv < jumpRaw * 0.5) {
      result[i]![2] = converted;
      streak++;
    } else {
      streak = 0;
    }
  }

  return result;
}

/** 前處理單筆航班：修正高度、展開經度、補齊 IATA、推算時間 */
export function preprocessFlight(f: Flight): Flight {
  return {
    ...f,
    path: unwrapPathLongitudes(fixAltitudeUnits(f.path)),
    origin_iata: resolveIata(f.origin_icao, f.origin_iata),
    dest_iata: resolveIata(f.dest_icao, f.dest_iata),
    dep_time: f.dep_time > 0 ? f.dep_time : (f.path[0]?.[3] ?? 0),
    arr_time: f.arr_time > 0 ? f.arr_time : (f.path[f.path.length - 1]?.[3] ?? 0),
  };
}

/** 前處理航班陣列 */
export function preprocessFlights(flights: Flight[]): Flight[] {
  return flights.filter((f) => f.path.length > 0).map(preprocessFlight);
}

// ── 快取 ──

let cachedTracks: Flight[] | null = null;
let cachedAirspace: Flight[] | null = null;

/** 按機場快取的軌跡 */
const airportCache = new Map<string, Flight[]>();
/** 按 region 快取的軌跡 */
const regionCache = new Map<string, Flight[]>();

const S3_BASE =
  "https://migu-gis-data-collector.s3.ap-southeast-2.amazonaws.com/flight-arc";

/** 嘗試載入 JSON 檔案（支援多路徑 fallback） */
async function tryLoadLocal(...paths: string[]): Promise<Flight[] | null> {
  for (const path of paths) {
    try {
      const res = await fetch(`/${path}`);
      if (!res.ok) continue;
      const text = await res.text();
      if (text.trimStart().startsWith("<")) continue;
      return JSON.parse(text);
    } catch {
      continue;
    }
  }
  return null;
}

/** 從 S3 manifest 載入指定來源的航班 */
async function loadFromS3(source: "tracks" | "airspace"): Promise<Flight[]> {
  const manifestRes = await fetch(`${S3_BASE}/${source}/manifest.json`);
  if (!manifestRes.ok) throw new Error(`S3 ${source} manifest not available`);
  const manifest: { dates: { date: string }[] } = await manifestRes.json();

  const fetches = manifest.dates.map(async (d) => {
    const [y, m, dd] = d.date.split("-");
    const res = await fetch(`${S3_BASE}/${source}/${y}/${m}/${dd}/data.json`);
    if (!res.ok) return [];
    return (await res.json()) as Flight[];
  });

  const results = await Promise.all(fetches);
  return results.flat();
}

/** 載入 FR24 完整軌跡（舊式：一次全載） */
export async function loadTracks(): Promise<Flight[]> {
  if (cachedTracks) return cachedTracks;

  let data = await tryLoadLocal(
    "data/tracks/latest.json",       // Zeabur /data volume
    "tracks/aviation_data.json",     // 本地開發 / docker mount
  );
  if (data) {
    console.log(`[Loader] Tracks: ${data.length} flights (local)`);
  }

  if (!data) {
    console.log("[Loader] Tracks: loading from S3...");
    try {
      data = await loadFromS3("tracks");
    } catch {
      data = [];
    }
  }

  cachedTracks = preprocessFlights(data);
  return cachedTracks;
}

// ── Manifest ──

interface TrackManifest {
  airports: Record<string, { flights: number; gzipBytes: number }>;
  regions: Record<string, { flights: number; gzipBytes: number }>;
  /** 各 region 有資料的日期（含部分） */
  regionDates?: Record<string, string[]>;
  /** 各 region 有完整抓取的日期 */
  regionFullDates?: Record<string, string[]>;
  totalFlights: number;
}

/** 取得指定 region 的所有可用日期 */
export function getRegionDates(manifest: TrackManifest, region: string): string[] {
  return manifest.regionDates?.[region] ?? [];
}

/** 取得指定 region 的完整資料日期 */
export function getRegionFullDates(manifest: TrackManifest, region: string): string[] {
  return manifest.regionFullDates?.[region] ?? [];
}

let cachedManifest: TrackManifest | null = null;

/** 載入 tracks manifest（機場列表 + 檔案大小） */
export async function loadManifest(): Promise<TrackManifest> {
  if (cachedManifest) return cachedManifest;
  try {
    const res = await fetch("/tracks/manifest.json");
    if (res.ok) {
      cachedManifest = await res.json();
      console.log(`[Loader] Manifest: ${Object.keys(cachedManifest!.airports).length} airports`);
      return cachedManifest!;
    }
  } catch {
    // fallback
  }
  cachedManifest = { airports: {}, regions: {}, totalFlights: 0 };
  return cachedManifest;
}

/** 從 manifest 取得所有機場 ICAO */
export function getManifestAirports(manifest: TrackManifest): string[] {
  return Object.keys(manifest.airports).sort();
}

// ── JSONL 串流載入 ──

/**
 * 串流載入 JSONL 檔案，每批航班到達時呼叫 onBatch
 * @returns 完整的航班陣列
 */
async function streamLoadJsonl(
  url: string,
  onBatch?: (flights: Flight[], total: number) => void,
): Promise<Flight[]> {
  const res = await fetch(url);
  if (!res.ok || !res.body) return [];

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const flights: Flight[] = [];
  let buffer = "";
  let batchBuffer: Flight[] = [];
  const BATCH_SIZE = 30; // 每 30 筆通知一次

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!; // 最後一行可能不完整

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const f = preprocessFlight(JSON.parse(trimmed) as Flight);
        if (f.path.length > 0) {
          flights.push(f);
          batchBuffer.push(f);
        }
      } catch {
        // 略過無效行
      }
    }

    if (batchBuffer.length >= BATCH_SIZE && onBatch) {
      onBatch([...flights], flights.length);
      batchBuffer = [];
    }
  }

  // 處理剩餘 buffer
  if (buffer.trim()) {
    try {
      const f = preprocessFlight(JSON.parse(buffer) as Flight);
      if (f.path.length > 0) flights.push(f);
    } catch {
      // ignore
    }
  }

  if (onBatch) onBatch([...flights], flights.length);
  return flights;
}

/**
 * 載入單一機場的完整軌跡（串流 + 漸進式）
 */
export async function loadAirportFlights(
  icao: string,
  onProgress?: (flights: Flight[], total: number) => void,
): Promise<Flight[]> {
  if (airportCache.has(icao)) {
    const cached = airportCache.get(icao)!;
    if (onProgress) onProgress(cached, cached.length);
    return cached;
  }

  const url = `/tracks/airports/${icao}.jsonl`;
  console.log(`[Loader] Airport ${icao}: streaming...`);

  const flights = await streamLoadJsonl(url, onProgress);
  console.log(`[Loader] Airport ${icao}: ${flights.length} flights`);
  airportCache.set(icao, flights);
  return flights;
}

/**
 * 載入 Region 的降採樣軌跡（串流 + 漸進式）
 */
export async function loadRegionFlights(
  region: string,
  onProgress?: (flights: Flight[], total: number) => void,
): Promise<Flight[]> {
  if (regionCache.has(region)) {
    const cached = regionCache.get(region)!;
    if (onProgress) onProgress(cached, cached.length);
    return cached;
  }

  const url = `/tracks/regions/${region}.jsonl`;
  console.log(`[Loader] Region ${region}: streaming...`);

  const flights = await streamLoadJsonl(url, onProgress);
  console.log(`[Loader] Region ${region}: ${flights.length} flights`);
  regionCache.set(region, flights);
  return flights;
}

// ── Region ICAO matching ──

const REGION_PREFIXES: Record<string, string[]> = {
  TW: ["RC"],
  JP: ["RJ", "RO"],
  HK: ["VH"],
};

function icaoMatchesRegion(icao: string, region: string): boolean {
  const prefixes = REGION_PREFIXES[region];
  if (!prefixes) return false;
  return prefixes.some((p) => icao.startsWith(p));
}

/**
 * 載入 Region 的完整軌跡（依序載入各機場 JSONL，去重）
 * All Region 時載入所有機場
 */
export async function loadRegionFullFlights(
  region: string,
  onProgress?: (flights: Flight[], total: number) => void,
  abortCheck?: () => boolean,
): Promise<Flight[]> {
  if (!cachedManifest) await loadManifest();
  const manifest = cachedManifest!;

  // 找出該 region 的機場，按航班數降序（大機場先載）
  let airportIcaos: string[];
  if (region === "all") {
    airportIcaos = Object.keys(manifest.airports);
  } else {
    airportIcaos = Object.keys(manifest.airports).filter((icao) =>
      icaoMatchesRegion(icao, region),
    );
  }
  airportIcaos.sort(
    (a, b) => (manifest.airports[b]?.flights ?? 0) - (manifest.airports[a]?.flights ?? 0),
  );

  const seen = new Set<string>();
  const accumulated: Flight[] = [];

  for (const icao of airportIcaos) {
    if (abortCheck?.()) return accumulated;

    const airportFlights = await loadAirportFlights(icao);
    // 去重
    for (const f of airportFlights) {
      if (!seen.has(f.fr24_id)) {
        seen.add(f.fr24_id);
        accumulated.push(f);
      }
    }

    if (onProgress) onProgress([...accumulated], accumulated.length);
  }

  return accumulated;
}

// ── AirSpace Scan（按天懶載入）──

interface AirspaceManifest {
  dates: { date: string; flights: number }[];
}

let airspaceManifest: AirspaceManifest | null = null;
const airspaceDayCache = new Map<string, Flight[]>();

/** 載入 airspace manifest（可用日期列表） */
export async function loadAirspaceManifest(): Promise<AirspaceManifest> {
  if (airspaceManifest) return airspaceManifest;
  try {
    const res = await fetch("/airspace/manifest.json");
    if (res.ok) {
      airspaceManifest = await res.json();
      console.log(`[Loader] Airspace manifest: ${airspaceManifest!.dates.length} dates`);
      return airspaceManifest!;
    }
  } catch { /* ignore */ }
  airspaceManifest = { dates: [] };
  return airspaceManifest;
}

/** 載入指定日期的 airspace 資料 */
async function loadAirspaceDay(date: string): Promise<Flight[]> {
  if (airspaceDayCache.has(date)) return airspaceDayCache.get(date)!;

  // 嘗試本地 JSONL
  const url = `/airspace/days/${date}.jsonl`;
  const flights = await streamLoadJsonl(url);
  if (flights.length > 0) {
    airspaceDayCache.set(date, flights);
    return flights;
  }

  // fallback: 嘗試 S3
  try {
    const [y, m, d] = date.split("-");
    const res = await fetch(`${S3_BASE}/airspace/${y}/${m}/${d}/data.json`);
    if (res.ok) {
      const data = preprocessFlights(await res.json());
      airspaceDayCache.set(date, data);
      return data;
    }
  } catch { /* ignore */ }

  return [];
}

/**
 * 載入指定日期範圍的 airspace 資料
 * @param dates 要載入的日期列表
 * @param onProgress 漸進式回呼
 */
export async function loadAirspaceDays(
  dates: string[],
  onProgress?: (flights: Flight[], total: number) => void,
): Promise<Flight[]> {
  const all: Flight[] = [];
  for (const date of dates) {
    const dayFlights = await loadAirspaceDay(date);
    all.push(...dayFlights);
    if (onProgress) onProgress([...all], all.length);
  }
  cachedAirspace = all;
  return all;
}

/** 舊式：一次全載（向下相容） */
export async function loadAirspace(): Promise<Flight[] | null> {
  if (cachedAirspace) return cachedAirspace;

  let data = await tryLoadLocal(
    "data/airspace/latest.json",
    "airspace/aviation_data.json",
  );
  if (data) {
    console.log(`[Loader] Airspace: ${data.length} flights (local)`);
    cachedAirspace = preprocessFlights(data);
    return cachedAirspace;
  }

  // S3 fallback
  try {
    data = await loadFromS3("airspace");
    if (data.length > 0) {
      console.log(`[Loader] Airspace: ${data.length} flights (S3)`);
      cachedAirspace = preprocessFlights(data);
      return cachedAirspace;
    }
  } catch { /* ignore */ }

  return null;
}

/** 更新 tracks 快取 */
export function updateCachedTracks(flights: Flight[]): void {
  cachedTracks = flights;
}

/** 更新 airspace 快取 */
export function updateCachedAirspace(flights: Flight[]): void {
  cachedAirspace = flights;
}

// ── 向下相容：保留舊函數名稱供其他模組使用 ──

/** @deprecated 改用 loadTracks() */
export const loadApiFlights = loadTracks;
/** @deprecated 改用 loadAirspace() */
export const loadFusedFlights = loadAirspace;
/** @deprecated 改用 updateCachedTracks() */
export const updateCachedFlights = updateCachedTracks;

/** 依目的地機場 ICAO 篩選（降落航班） */
export function filterByArrivalAirport(
  flights: Flight[],
  icao: string,
): Flight[] {
  return flights.filter((f) => f.dest_icao === icao);
}

/** 依出發機場 ICAO 篩選（起飛航班） */
export function filterByDepartureAirport(
  flights: Flight[],
  icao: string,
): Flight[] {
  return flights.filter((f) => f.origin_icao === icao);
}

/** 依機場篩選（起飛或降落） */
export function filterByAirport(flights: Flight[], icao: string): Flight[] {
  return flights.filter(
    (f) => f.dest_icao === icao || f.origin_icao === icao,
  );
}

/** 取得資料中所有出現的機場 ICAO（origin） */
export function getAllAirports(flights: Flight[]): string[] {
  const airports = new Set<string>();
  for (const f of flights) {
    if (f.origin_icao) airports.add(f.origin_icao);
  }
  return [...airports].sort();
}

/** 取得航班群的時間範圍 */
export function getTimeRange(flights: Flight[]): {
  start: number;
  end: number;
} {
  let start = Infinity;
  let end = -Infinity;
  for (const f of flights) {
    for (const pt of f.path) {
      const t = pt[3];
      if (t < start) start = t;
      if (t > end) end = t;
    }
  }
  return { start, end };
}
