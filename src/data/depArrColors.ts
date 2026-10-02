/**
 * 起降染色（docs/backlog/studio-design-system.md §7）的純函式。
 *
 * 判斷依據＝「選定的機場集合」（單機場 = 該機場；組合模式 = 組合內所有機場）：
 *   - dest ∈ 選定、origin ∉ → 'arr'（進場色）
 *   - origin ∈ 選定、dest ∉ → 'dep'（離場色）
 *   - 兩端都在選定內 → 'internal'（沿路漸層：起點離場色 → 終點進場色）
 *   - 兩端都不在 → null（不上色；理論上篩選後不會出現）
 *
 * 漸層比例用「累積大圓距離 / 全長」：與 LOD 換層無關（同一班不同解析度的 path 比例幾乎相同），
 * 不像點序比例會隨點數變動。呼叫端應在資料變動時預算一次（per-path 快取），不要每幀算。
 */
import { TRAJ } from "../types/colorTheme";

export type DepArrKind = "arr" | "dep" | "internal";

/** 工具列「染色」：altitude = 高度漸層（預設、原行為）；deparr = 起降染色 */
export type TrajColorBy = "altitude" | "deparr";

export function classifyDepArr(
  origin: string | null | undefined,
  dest: string | null | undefined,
  selected: ReadonlySet<string>,
): DepArrKind | null {
  const o = !!origin && selected.has(origin);
  const d = !!dest && selected.has(dest);
  if (o && d) return "internal";
  if (d) return "arr";
  if (o) return "dep";
  return null;
}

/** 只需要 TrackPath 的逐欄存取（測試可直接用 TrackPath.fromArray） */
export interface PathLike {
  readonly length: number;
  lat(i: number): number;
  lng(i: number): number;
  t(i: number): number;
}

const DEG = Math.PI / 180;

/**
 * 每個路徑點的累積距離比例（0 → 1）。長度 = path.length。
 * 距離用 haversine（經度差先 wrap 到 ±180，處理跨換日線展開的經度）。
 * 全長為 0（單點或原地）→ 退回點序比例。
 */
export function cumulativeFractions(path: PathLike): Float32Array {
  const n = path.length;
  const out = new Float32Array(n);
  if (n < 2) return out;
  let total = 0;
  let pLat = path.lat(0) * DEG;
  let pLng = path.lng(0);
  for (let i = 1; i < n; i++) {
    const lat = path.lat(i) * DEG;
    const lng = path.lng(i);
    let dLng = lng - pLng;
    dLng = ((dLng + 540) % 360) - 180;
    const sLat = Math.sin((lat - pLat) / 2);
    const sLng = Math.sin((dLng * DEG) / 2);
    const h = sLat * sLat + Math.cos(pLat) * Math.cos(lat) * sLng * sLng;
    total += 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    out[i] = total;
    pLat = lat;
    pLng = lng;
  }
  if (total > 0) {
    for (let i = 1; i < n; i++) out[i] = out[i]! / total;
  } else {
    for (let i = 1; i < n; i++) out[i] = i / (n - 1);
  }
  out[n - 1] = 1;
  return out;
}

/**
 * 時刻 t 時航班在路徑上的距離比例（光球取色用）。binary search + 段內線性插值，不配置記憶體。
 * t 在航跡時間範圍外 → clamp 到 0 / 1。
 */
export function fractionAtTime(path: PathLike, fracs: Float32Array, t: number): number {
  const n = path.length;
  if (n === 0) return 0;
  if (t <= path.t(0)) return fracs[0] ?? 0;
  if (t >= path.t(n - 1)) return fracs[n - 1] ?? 1;
  // 最後一個 path.t(i) <= t
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (path.t(m) <= t) lo = m;
    else hi = m - 1;
  }
  const t0 = path.t(lo), t1 = path.t(lo + 1);
  const f0 = fracs[lo]!, f1 = fracs[lo + 1]!;
  const r = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  return f0 + (f1 - f0) * r;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

/** 兩個 #rrggbb 之間線性插值（0 → a、1 → b），回傳 #rrggbb。冷路徑用（2D GeoJSON 分段色）。 */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const k = Math.min(1, Math.max(0, t));
  const c = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

export interface DepArrColoring {
  /** 進場／離場航班：fr24_id → 平色 hex（走既有 perFlightColorMap 管線） */
  flat: Map<string, string>;
  /** 組合內互飛航班：fr24_id → [起點離場色, 終點進場色]（沿路漸層） */
  gradients: Map<string, readonly [string, string]>;
}

interface FlightLike {
  fr24_id: string;
  origin_icao: string;
  dest_icao: string;
}

/** 依選定機場集合為每班指派起降色。資料或選定集合變動時算一次。 */
export function computeDepArrColoring(
  flights: readonly FlightLike[],
  selected: ReadonlySet<string>,
  isDark: boolean,
): DepArrColoring {
  const pal = isDark ? TRAJ.dark : TRAJ.light;
  const flat = new Map<string, string>();
  const gradients = new Map<string, readonly [string, string]>();
  const grad = [pal.dep, pal.arr] as const;
  for (const f of flights) {
    const k = classifyDepArr(f.origin_icao, f.dest_icao, selected);
    if (k === "arr") flat.set(f.fr24_id, pal.arr);
    else if (k === "dep") flat.set(f.fr24_id, pal.dep);
    else if (k === "internal") gradients.set(f.fr24_id, grad);
  }
  return { flat, gradients };
}
