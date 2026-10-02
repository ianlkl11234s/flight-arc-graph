/**
 * 網址記住狀態（spec R8／P6，Q7 = 全部）
 *
 * 把「機場／組合／範圍、日期、起降、染色、配色、播放時刻、鏡頭、資料來源、選取航班」
 * 序列化成 query string，重新整理與分享連結都能回到同一畫面。參考 Pulse `src/lib/urlState.ts`。
 *
 * 規則：
 * 1. **只寫與預設不同的值**：全部是預設時 encode 回空的 URLSearchParams（網址不帶 `?`）。
 * 2. **版本**：有寫其他 key 時才寫 `v=1`。與 Pulse 不同，缺版本或版本不符**仍盡量解析**
 *    看得懂的 key（本站沒有嵌入碼，舊連結少還原一點比整組作廢好）。
 * 3. **靜默降級**：未知 key 忽略；格式錯誤的值只丟掉該 key，絕不 throw（別人的連結壞掉也不能白屏）。
 * 4. **互斥**：`set`（組合）> `scope`（區域範圍）> `a`（單一機場），encode／decode 都只留優先者。
 *
 * 純函式、不碰 DOM —— 「機場存不存在、日期有沒有資料」這類要查目錄的驗證在 App 套用時做。
 */
import { BUILTIN_SETS } from "../map/savedSets";
import { COLOR_THEMES, DEFAULT_THEME_KEY } from "../types/colorTheme";

export const URL_STATE_VERSION = 1;

export interface UrlCamera {
  lat: number;
  lng: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

/** 播放時刻（台灣時間）：起始日 00:00 起算的分鐘數 + 第幾天（多日／Compare 用，0 = 起始日） */
export interface UrlTime {
  minutes: number;
  dayOffset: number;
}

export interface UrlState {
  /** `a`：單一機場 ICAO */
  airport?: string;
  /** `set`：預設組合 id（BUILTIN_SETS） */
  setId?: string;
  /** `set`：自訂組合的 ICAO 清單 */
  setIcaos?: string[];
  /** `scope`：區域範圍的 region key（App 端驗證是否存在） */
  scope?: string;
  /** `d`：起始日期 YYYY-MM-DD */
  date?: string;
  /** `n`：天數（多日） */
  days?: number;
  /** `cmp`：Compare 日期清單 */
  compare?: string[];
  /** `f`：起降篩選 */
  depArr?: "all" | "arr" | "dep";
  /** `cb`：染色方式 */
  colorBy?: "altitude" | "deparr";
  /** `th`：軌跡配色主題 key（COLOR_THEMES） */
  theme?: string;
  /** `t`：暫停中的播放時刻（播放中不寫） */
  time?: UrlTime;
  /** `cam`：鏡頭 */
  camera?: UrlCamera;
  /** `ds`：資料來源 */
  dataSource?: "tracks" | "airspace";
  /** `fl`：選取中的航班 fr24_id */
  flight?: string;
}

export const URL_DEFAULTS = {
  airport: "RCTP",
  date: "2026-02-18",
  days: 1,
  depArr: "all",
  colorBy: "altitude",
  theme: DEFAULT_THEME_KEY,
  dataSource: "tracks",
} as const;

export interface EncodeOptions {
  /** 目前畫面的「預設鏡頭」（單機場 = 機場 preset）。給了且在輸出精度下相等就不寫 cam。 */
  defaultCamera?: UrlCamera;
}

const ICAO_RE = /^[A-Z0-9]{3,4}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const REGION_KEY_RE = /^[A-Za-z]{2,5}$/;
const FLIGHT_ID_RE = /^[A-Za-z0-9]{4,20}$/;
// 「+N」= 第 N 天（手打的 + 在 query 會被解成空白，兩者都收）
const TIME_RE = /^(\d{1,2}):(\d{2})(?:[+ ](\d{1,2}))?$/;
const MAX_DAYS = 31;
const MAX_COMPARE = 8;
const MAX_SET = 30;

/** 真實存在的日期才收（`Date.parse` 會把 2026-02-30 寬鬆成 3/2，故自己往返比對） */
export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function finiteNum(raw: string | undefined): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function inRange(n: number | undefined, min: number, max: number): number | undefined {
  return n != null && n >= min && n <= max ? n : undefined;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

function normalizeBearing(n: number): number {
  const m = ((n % 360) + 540) % 360 - 180;
  return Object.is(m, -0) ? 0 : m;
}

/** 鏡頭輸出精度：經緯度 4 位（~11 m）、zoom 2 位、pitch／bearing 1 位 */
export function roundCamera(c: UrlCamera): UrlCamera {
  return {
    lat: round(c.lat, 4),
    lng: round(c.lng, 4),
    zoom: round(c.zoom, 2),
    pitch: round(c.pitch, 1),
    bearing: round(normalizeBearing(c.bearing), 1),
  };
}

function sameCamera(a: UrlCamera, b: UrlCamera): boolean {
  const x = roundCamera(a), y = roundCamera(b);
  return x.lat === y.lat && x.lng === y.lng && x.zoom === y.zoom && x.pitch === y.pitch && x.bearing === y.bearing;
}

function parseIcaoList(raw: string): string[] | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const icao = part.trim().toUpperCase();
    if (!ICAO_RE.test(icao) || seen.has(icao)) continue;
    seen.add(icao);
    out.push(icao);
    if (out.length >= MAX_SET) break;
  }
  return out.length > 0 ? out : undefined;
}

function parseCamera(raw: string): UrlCamera | undefined {
  const parts = raw.split(",").map((s) => finiteNum(s));
  const lat = inRange(parts[0], -90, 90);
  const lng = inRange(parts[1], -180, 180);
  const zoom = inRange(parts[2], 0, 22);
  // 經緯度與 zoom 缺一就沒有可用的鏡頭（半套鏡頭比沒有更糟）
  if (lat == null || lng == null || zoom == null) return undefined;
  return {
    lat,
    lng,
    zoom,
    pitch: inRange(parts[3], 0, 85) ?? 0,
    bearing: parts[4] != null ? normalizeBearing(parts[4]) : 0,
  };
}

function parseTime(raw: string): UrlTime | undefined {
  const m = TIME_RE.exec(raw);
  if (!m) return undefined;
  const hh = Number(m[1]), mm = Number(m[2]);
  const dayOffset = m[3] != null ? Number(m[3]) : 0;
  if (hh > 23 || mm > 59 || dayOffset >= MAX_DAYS) return undefined;
  return { minutes: hh * 60 + mm, dayOffset };
}

export function formatTime(t: UrlTime): string {
  const hh = String(Math.floor(t.minutes / 60)).padStart(2, "0");
  const mm = String(t.minutes % 60).padStart(2, "0");
  return `${hh}:${mm}${t.dayOffset > 0 ? `+${t.dayOffset}` : ""}`;
}

/**
 * 解析 query string。任何欄位壞掉只丟該欄位，不 throw。
 * @param search `location.search`（可含或不含前導 `?`）
 */
export function decodeUrlState(search: string): UrlState {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return {};
  }
  const get = (k: string): string | undefined => {
    const v = q.get(k);
    return v == null ? undefined : v.trim();
  };
  const state: UrlState = {};

  // 選取對象：set > scope > a（互斥）
  const setRaw = get("set");
  if (setRaw) {
    const builtin = BUILTIN_SETS.find((s) => s.id === setRaw);
    if (builtin) state.setId = builtin.id;
    else {
      const icaos = parseIcaoList(setRaw);
      if (icaos) state.setIcaos = icaos;
    }
  }
  const hasSet = state.setId != null || state.setIcaos != null;
  const scope = get("scope");
  if (!hasSet && scope && REGION_KEY_RE.test(scope)) state.scope = scope;
  const a = get("a")?.toUpperCase();
  if (!hasSet && state.scope == null && a && ICAO_RE.test(a)) state.airport = a;

  const d = get("d");
  if (d && isValidDate(d)) state.date = d;
  const n = finiteNum(get("n"));
  if (n != null && Number.isInteger(n) && n >= 1 && n <= MAX_DAYS) state.days = n;
  const cmpRaw = get("cmp");
  if (cmpRaw) {
    const dates = [...new Set(cmpRaw.split(",").map((s) => s.trim()).filter(isValidDate))].slice(0, MAX_COMPARE);
    if (dates.length > 0) state.compare = dates;
  }

  const f = get("f");
  if (f === "arr" || f === "dep" || f === "all") state.depArr = f;
  const cb = get("cb");
  if (cb === "deparr" || cb === "altitude") state.colorBy = cb;
  const th = get("th");
  if (th && Object.prototype.hasOwnProperty.call(COLOR_THEMES, th)) state.theme = th;

  const t = get("t");
  if (t) {
    const time = parseTime(t);
    if (time) state.time = time;
  }
  const cam = get("cam");
  if (cam) {
    const camera = parseCamera(cam);
    if (camera) state.camera = camera;
  }
  const ds = get("ds");
  if (ds === "airspace" || ds === "tracks") state.dataSource = ds;
  const fl = get("fl");
  if (fl && FLIGHT_ID_RE.test(fl)) state.flight = fl;

  return state;
}

/** 由狀態組回 query（只寫與預設不同的值）。全部是預設時回空的 URLSearchParams。 */
export function encodeUrlState(state: UrlState, opts: EncodeOptions = {}): URLSearchParams {
  const q = new URLSearchParams();

  if (state.setId && BUILTIN_SETS.some((s) => s.id === state.setId)) {
    q.set("set", state.setId);
  } else if (state.setIcaos && state.setIcaos.length > 0) {
    q.set("set", state.setIcaos.join(","));
  } else if (state.scope) {
    q.set("scope", state.scope);
  } else if (state.airport && state.airport !== URL_DEFAULTS.airport) {
    q.set("a", state.airport);
  }

  if (state.date && state.date !== URL_DEFAULTS.date) q.set("d", state.date);
  if (state.days != null && state.days !== URL_DEFAULTS.days) q.set("n", String(state.days));
  if (state.compare && state.compare.length > 0) q.set("cmp", state.compare.join(","));

  if (state.depArr && state.depArr !== URL_DEFAULTS.depArr) q.set("f", state.depArr);
  if (state.colorBy && state.colorBy !== URL_DEFAULTS.colorBy) q.set("cb", state.colorBy);
  if (state.theme && state.theme !== URL_DEFAULTS.theme) q.set("th", state.theme);
  if (state.time) q.set("t", formatTime(state.time));

  if (state.camera && !(opts.defaultCamera && sameCamera(state.camera, opts.defaultCamera))) {
    const c = roundCamera(state.camera);
    q.set("cam", [c.lat, c.lng, c.zoom, c.pitch, c.bearing].join(","));
  }
  if (state.dataSource && state.dataSource !== URL_DEFAULTS.dataSource) q.set("ds", state.dataSource);
  if (state.flight) q.set("fl", state.flight);

  if ([...q.keys()].length === 0) return q;
  // v 放最前面（好讀）
  const out = new URLSearchParams();
  out.set("v", String(URL_STATE_VERSION));
  for (const [k, v] of q) out.set(k, v);
  return out;
}

/** query → 網址字串（無參數時只回 pathname，不留 `?`）；逗號不跳脫，網址好讀好手改。 */
export function buildSearch(q: URLSearchParams): string {
  const s = q.toString().replace(/%2C/gi, ",").replace(/%3A/gi, ":");
  return s ? `?${s}` : "";
}
