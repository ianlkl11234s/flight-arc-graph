/**
 * 平面方位投影（方位等距／蘭伯特等積／日晷）的純數學，不依賴 mapbox。
 *
 * 做法：Mapbox 停在 mercator，只當相機；我們把「以某機場為中心的方位投影平面」
 * 直接擺進 mercator 世界座標（[0,1]²，中心點在 (0.5, 0.5)）。軌跡走 toMercator()
 * 這個單一入口換算；自畫底圖則把同一組平面座標反解成「假經緯度」交給 Mapbox 畫線。
 *
 * 為什麼不用 map.setProjection()：Mapbox 內建沒有方位投影，而且除了 mercator／globe
 * 之外的投影一律不畫 custom layer（軌跡、光球都是 custom layer）。
 */

export type PlaneKind = "aeqd" | "laea" | "gnom";

export const PLANE_KINDS: readonly PlaneKind[] = ["aeqd", "laea", "gnom"];

/**
 * 平面相對於「赤道處 mercator」的縮放。0.3 → 方位等距的整個圓盤半徑 0.15。
 * 取這麼小是因為模式中要關 renderWorldCopies（軌跡 custom layer 只畫一份），而 Mapbox 在
 * 關閉後會限制最小 zoom ＝「世界寬度填滿畫面寬度」；圓盤直徑 ≤ 0.36 個世界寬，
 * 寬高比 2.5:1 以內的畫面在最小 zoom 下都還放得下整個圓盤。
 * 高度與公尺尺寸也乘同一個係數，中心點附近的水平／垂直比例才一致。
 */
export const PLANE_SCALE = 0.3;

/** 球面 1 弧度在 mercator 世界座標的長度 */
export const PLANE_UNIT = PLANE_SCALE / (2 * Math.PI);

/** 日晷投影畫得到的最大角距離；超過的點夾在邊緣（tan 發散，90° 以外無定義） */
export const GNOM_MAX_DEG = 75;

export const EARTH_RADIUS_KM = 6371.0088;

const D2R = Math.PI / 180;

export interface PlanePoint {
  x: number;
  y: number;
}

/** 徑向函數種類：三種可選的投影，加上只在展開動畫當起點用的正射（＝正對中心看地球） */
export type PlaneRadial = PlaneKind | "ortho";

/** 展開動畫：從 from 的徑向函數漸變到目標投影；t 0→1（呼叫端自己套 easing） */
export interface PlaneMorph {
  from: PlaneRadial;
  t: number;
}

export interface PlaneProjector {
  kind: PlaneKind;
  lat0: number;
  lng0: number;
  /** 投影邊界（圓）在 mercator 世界座標的半徑 */
  rimRadius: number;
  /** 畫得到的最大角距離（度）；動畫中會變 */
  clipDeg: number;
  /**
   * 經緯度 → mercator 世界座標，寫進 out。
   * 回傳 false = 這個點超出投影範圍，out 是夾在邊緣的位置（保留方位）。
   */
  project(lat: number, lng: number, out: PlanePoint): boolean;
}

/** 各投影畫得到的最大角距離（度） */
const CLIP_DEG: Record<PlaneRadial, number> = { aeqd: 180, laea: 180, gnom: GNOM_MAX_DEG, ortho: 90 };

/** 徑向函數 r(c)：c = 到中心的角距離（弧度），回傳單位球上的平面半徑 */
function radial(kind: PlaneRadial, c: number): number {
  switch (kind) {
    case "aeqd": return c;
    case "laea": return 2 * Math.sin(c / 2);
    case "gnom": return Math.tan(Math.min(c, GNOM_MAX_DEG * D2R));
    case "ortho": return Math.sin(Math.min(c, Math.PI / 2));
  }
}

export function createPlaneProjector(kind: PlaneKind, lat0: number, lng0: number, morph?: PlaneMorph): PlaneProjector {
  const p0 = lat0 * D2R;
  const l0 = lng0 * D2R;
  const sin0 = Math.sin(p0);
  const cos0 = Math.cos(p0);
  const from = morph && morph.t < 1 ? morph.from : null;
  const t = from ? Math.max(0, morph!.t) : 1;
  const clipDeg = from ? CLIP_DEG[from] + (CLIP_DEG[kind] - CLIP_DEG[from]) * t : CLIP_DEG[kind];
  const clip = clipDeg * D2R;
  const r = (c: number) => (from ? radial(from, c) * (1 - t) + radial(kind, c) * t : radial(kind, c));
  const rimR = r(clip);

  return {
    kind,
    lat0,
    lng0,
    rimRadius: rimR * PLANE_UNIT,
    clipDeg,
    project(lat, lng, out) {
      const p = lat * D2R;
      const dl = lng * D2R - l0;
      const sinP = Math.sin(p);
      const cosP = Math.cos(p);
      const cosDl = Math.cos(dl);
      // cc = cos(角距離)；(xe, yn) = 在中心點切平面上的東、北分量，長度 = sin(角距離)
      const cc = sin0 * sinP + cos0 * cosP * cosDl;
      const xe = cosP * Math.sin(dl);
      const yn = cos0 * sinP - sin0 * cosP * cosDl;
      const s = Math.hypot(xe, yn);
      const c = Math.atan2(s, cc);
      // 超出範圍：保留方位，半徑夾在邊緣（1e-9：邊界上的點算在內）
      const inside = c <= clip + 1e-9;
      const k = s > 1e-12 ? (inside ? r(c) : rimR) / s : 0;
      out.x = 0.5 + k * xe * PLANE_UNIT;
      out.y = 0.5 - k * yn * PLANE_UNIT; // mercator y 向南為正
      return inside;
    },
  };
}

/** mercator 世界座標 → 經緯度（把平面座標交給 Mapbox 原生圖層時用的「假經緯度」） */
export function mercatorToLngLat(x: number, y: number): [number, number] {
  return [(x - 0.5) * 360, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / D2R];
}

/** 經緯度 → mercator 世界座標（mercatorToLngLat 的反函數；相機 center 用） */
export function lngLatToMercator(lng: number, lat: number): PlanePoint {
  const p = lat * D2R;
  return { x: lng / 360 + 0.5, y: 0.5 - Math.log(Math.tan(Math.PI / 4 + p / 2)) / (2 * Math.PI) };
}

/** 兩點大圓距離（公里） */
export function greatCircleKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const a =
    Math.sin((p2 - p1) / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(((lng2 - lng1) * D2R) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 距中心 km 公里的小圓（距離圈），回傳 [lng, lat][]，頭尾相接 */
export function rangeRing(lat0: number, lng0: number, km: number, stepDeg = 2): [number, number][] {
  const c = km / EARTH_RADIUS_KM;
  const p0 = lat0 * D2R;
  const out: [number, number][] = [];
  for (let b = 0; b <= 360; b += stepDeg) {
    const br = b * D2R;
    const p = Math.asin(Math.sin(p0) * Math.cos(c) + Math.cos(p0) * Math.sin(c) * Math.cos(br));
    const l =
      lng0 * D2R +
      Math.atan2(Math.sin(br) * Math.sin(c) * Math.cos(p0), Math.cos(c) - Math.sin(p0) * Math.sin(p));
    out.push([l / D2R, p / D2R]);
  }
  return out;
}

/**
 * 把一條經緯度折線投影成 Mapbox 可畫的 MultiLineString 座標（假經緯度）。
 * - 沿大圓補點（每段 ≤ stepDeg），長線段在投影後才會是正確的曲線
 * - 超出投影範圍、或投影後相鄰兩點跳太遠（對蹠點附近）就斷線
 */
export function projectLine(
  proj: PlaneProjector,
  line: ArrayLike<readonly [number, number]>,
  stepDeg = 1,
): [number, number][][] {
  const parts: [number, number][][] = [];
  let cur: [number, number][] = [];
  const pt: PlanePoint = { x: 0, y: 0 };
  const maxJump = proj.rimRadius * 0.25;
  let px = 0;
  let py = 0;
  let prevLng = 0;
  let prevLat = 0;

  const flush = () => {
    if (cur.length >= 2) parts.push(cur);
    cur = [];
  };
  const emit = (lng: number, lat: number) => {
    if (!proj.project(lat, lng, pt)) {
      flush();
      return;
    }
    if (cur.length > 0 && Math.hypot(pt.x - px, pt.y - py) > maxJump) flush();
    cur.push(mercatorToLngLat(pt.x, pt.y));
    px = pt.x;
    py = pt.y;
  };

  for (let i = 0; i < line.length; i++) {
    const lng = line[i]![0];
    const lat = line[i]![1];
    if (i > 0) {
      // 沿大圓補點：用單位向量線性內插再正規化（小步距下與 slerp 幾乎相同）
      const a = unitVector(prevLat, prevLng);
      const b = unitVector(lat, lng);
      const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const n = Math.ceil(Math.acos(dot) / (stepDeg * D2R));
      for (let j = 1; j < n; j++) {
        const t = j / n;
        const x = a[0] + (b[0] - a[0]) * t;
        const y = a[1] + (b[1] - a[1]) * t;
        const z = a[2] + (b[2] - a[2]) * t;
        const m = Math.hypot(x, y, z) || 1;
        emit(Math.atan2(y, x) / D2R, Math.asin(z / m) / D2R);
      }
    }
    emit(lng, lat);
    prevLng = lng;
    prevLat = lat;
  }
  flush();
  return parts;
}

function unitVector(lat: number, lng: number): [number, number, number] {
  const p = lat * D2R;
  const l = lng * D2R;
  const c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}

/**
 * 把陸地多邊形投影成 Mapbox 可填色的多邊形（假經緯度）。
 *
 * 方位投影把「對蹠點」攤成最外圈，所以包住對蹠點的那塊陸地，外環投影後圍住的反而是
 * 「陸地以外」的部分。處理方式：那一塊改畫成「整個圓盤，挖掉外環圍住的區域」。
 * 判斷哪一塊包住對蹠點不用做球面 point-in-polygon：方位投影保持環的繞行方向，
 * 包住對蹠點的環，投影後有號面積的正負會和其他所有陸塊相反。
 *
 * polygons：每個多邊形是 [外環, 洞…]，環是 [lng, lat, lng, lat, …] 的扁平陣列。
 */
export function projectPolygons(proj: PlaneProjector, polygons: readonly (readonly number[])[][]): [number, number][][][] {
  const maxSeg = proj.rimRadius * 0.02;
  const minArea = (proj.rimRadius * 0.002) ** 2;
  const rings = polygons.map((poly) => poly.map((ring) => projectRing(proj, ring, maxSeg)));

  // 資料的繞行慣例：取多數決（幾乎所有陸塊都不包住對蹠點）
  let pos = 0;
  let neg = 0;
  for (const poly of rings) {
    const a = poly[0]!.area;
    if (Math.abs(a) < minArea) continue;
    if (a > 0) pos++;
    else neg++;
  }
  const normalSign = pos >= neg ? 1 : -1;

  const out: [number, number][][][] = [];
  let rim: [number, number][] | null = null;
  for (const poly of rings) {
    const ext = poly[0]!;
    // 整塊在投影範圍外：所有點都被夾在邊緣。包住對蹠點的陸塊這時會沿邊緣繞一整圈，
    // 面積不是 0，不能只看面積 → 直接看有沒有任何一點在範圍內
    if (!ext.anyInside || Math.abs(ext.area) < minArea) continue;
    const holes = poly.slice(1).filter((h) => Math.abs(h.area) >= minArea).map((h) => h.coords);
    if (Math.sign(ext.area) === normalSign) {
      out.push([ext.coords, ...holes]);
    } else if (ext.clipped) {
      // 包住對蹠點、又有一部分超出投影範圍（日晷）：「圓盤挖洞」的洞會幾乎貼著外框，
      // 圖磚量化後兩條邊會交叉、填色整片出錯 → 改成把範圍內的每一段海岸各自用邊界圓弧封起來
      for (const piece of insidePieces(proj, ext.raw, normalSign, minArea)) out.push([piece]);
    } else {
      rim ??= rimRing(proj);
      out.push([rim, ext.coords, ...holes]);
    }
  }
  return out;
}

/** 投影邊界（圓）的假經緯度環 */
export function rimRing(proj: PlaneProjector, stepDeg = 1, scale = 1): [number, number][] {
  const R = proj.rimRadius * scale;
  const out: [number, number][] = [];
  for (let a = 0; a < 360; a += stepDeg) {
    const r = a * D2R;
    out.push(mercatorToLngLat(0.5 + R * Math.cos(r), 0.5 + R * Math.sin(r)));
  }
  out.push([out[0]![0], out[0]![1]]); // 頭尾完全相同（GeoJSON 環）
  return out;
}

interface RawRing {
  xs: number[];
  ys: number[];
  /** 每個點是否在投影範圍內 */
  ins: boolean[];
  /** 第一個範圍內的點（-1 = 整個環都在範圍外） */
  start: number;
}
interface ProjectedRing {
  coords: [number, number][];
  area: number;
  anyInside: boolean;
  /** 有一部分超出投影範圍 */
  clipped: boolean;
  raw: RawRing;
}

/** 沿投影邊界從角度 th0 掃到 th1（弧度，可超過一圈）的圓弧點，含兩端 */
function rimArc(R: number, th0: number, th1: number, x: number[], y: number[]) {
  const steps = Math.max(1, Math.ceil(Math.abs(th1 - th0) / D2R));
  for (let q = 0; q <= steps; q++) {
    const t = th0 + ((th1 - th0) * q) / steps;
    x.push(0.5 + R * Math.cos(t));
    y.push(0.5 + R * Math.sin(t));
  }
}

function signedArea(x: number[], y: number[]): number {
  let a = 0;
  for (let i = 0; i < x.length; i++) {
    const j = (i + 1) % x.length;
    a += x[i]! * y[j]! - x[j]! * y[i]!;
  }
  return a / 2;
}

/**
 * 用投影邊界裁切一個環（Weiler–Atherton）：環上「範圍內」的每一段照原方向走，
 * 走出邊界後沿邊界往固定方向（陸地在左手邊的那個方向）走到角度上最近的下一個進入點，
 * 接上那一段，直到回到起點。一個環可能裁成好幾個多邊形。
 */
function insidePieces(proj: PlaneProjector, raw: RawRing, normalSign: number, minArea: number): [number, number][][] {
  const { xs, ys, ins, start } = raw;
  const total = xs.length;
  const R = proj.rimRadius;
  const out: [number, number][][] = [];
  if (start < 0) return out;
  let s0 = -1;
  for (let k = 0; k < total; k++) {
    const i = (start + k) % total;
    if (ins[i] && !ins[(i - 1 + total) % total]) { s0 = i; break; }
  }
  if (s0 < 0) return out; // 沒有任何一點在範圍外
  const TAU = 2 * Math.PI;
  const pieces: { x: number[]; y: number[]; thIn: number; thOut: number; used: boolean }[] = [];
  for (let k = 0; k < total; ) {
    const i = (s0 + k) % total;
    if (!ins[i]) { k++; continue; }
    const x: number[] = [];
    const y: number[] = [];
    while (k < total && ins[(s0 + k) % total]) {
      const j = (s0 + k) % total;
      x.push(xs[j]!);
      y.push(ys[j]!);
      k++;
    }
    const n = x.length;
    pieces.push({
      x, y, used: false,
      thIn: Math.atan2(y[0]! - 0.5, x[0]! - 0.5),
      thOut: Math.atan2(y[n - 1]! - 0.5, x[n - 1]! - 0.5),
    });
  }
  const dir = normalSign >= 0 ? 1 : -1;
  // 從 a 沿 dir 方向走到 b 要掃過的角度（0, 2π]
  const sweep = (a: number, b: number) => {
    let d = ((b - a) * dir) % TAU;
    if (d <= 1e-12) d += TAU;
    return d;
  };
  for (const first of pieces) {
    if (first.used) continue;
    const x: number[] = [];
    const y: number[] = [];
    let cur = first;
    for (let guard = 0; guard <= pieces.length; guard++) {
      cur.used = true;
      for (let q = 0; q < cur.x.length; q++) { x.push(cur.x[q]!); y.push(cur.y[q]!); }
      let next = first;
      let best = sweep(cur.thOut, first.thIn);
      for (const c of pieces) {
        if (c.used) continue;
        const d = sweep(cur.thOut, c.thIn);
        if (d < best) { best = d; next = c; }
      }
      rimArc(R, cur.thOut, cur.thOut + best * dir, x, y);
      if (next === first) break;
      cur = next;
    }
    if (Math.abs(signedArea(x, y)) < minArea) continue;
    const ring: [number, number][] = x.map((v, q) => mercatorToLngLat(v, y[q]!));
    ring.push([ring[0]![0], ring[0]![1]]);
    out.push(ring);
  }
  return out;
}

/**
 * 封閉環的投影：依投影後的長度自適應補點（對蹠點附近一小段會被拉得很長），回傳座標與有號面積。
 *
 * 超出投影範圍的點（日晷 75° 外、展開動畫中的背面）會被夾在邊界上。整段在範圍外的路徑
 * 夾上去之後會在邊界上來回摺疊（零寬度的重疊邊，三角化會出錯），所以把每一段「範圍外」的
 * 路徑換成一條沿邊界的單向圓弧，掃過的角度＝那段路徑方位角的淨變化——繞行圈數不變，
 * 填出來的區域和原本一樣，但沒有摺疊。
 */
function projectRing(
  proj: PlaneProjector,
  flat: readonly number[],
  maxSeg: number,
): ProjectedRing {
  const xs: number[] = [];
  const ys: number[] = [];
  const ins: boolean[] = [];
  const a: PlanePoint = { x: 0, y: 0 };
  const b: PlanePoint = { x: 0, y: 0 };
  const m: PlanePoint = { x: 0, y: 0 };

  // 把 (u0 → u1) 這段（不含起點、含終點）補點後推進 xs／ys
  const seg = (
    u0: [number, number, number], x0: number, y0: number,
    u1: [number, number, number], x1: number, y1: number, in1: boolean, depth: number,
  ) => {
    if (depth < 9 && Math.hypot(x1 - x0, y1 - y0) > maxSeg) {
      const mx = u0[0] + u1[0];
      const my = u0[1] + u1[1];
      const mz = u0[2] + u1[2];
      const len = Math.hypot(mx, my, mz);
      if (len > 1e-9) {
        const um: [number, number, number] = [mx / len, my / len, mz / len];
        const inM = proj.project(Math.asin(um[2]) / D2R, Math.atan2(um[1], um[0]) / D2R, m);
        const px = m.x;
        const py = m.y;
        seg(u0, x0, y0, um, px, py, inM, depth + 1);
        seg(um, px, py, u1, x1, y1, in1, depth + 1);
        return;
      }
    }
    xs.push(x1);
    ys.push(y1);
    ins.push(in1);
  };

  const n = flat.length / 2;
  let prevU = unitVector(flat[1]!, flat[0]!);
  ins.push(proj.project(flat[1]!, flat[0]!, a));
  xs.push(a.x);
  ys.push(a.y);
  for (let i = 1; i < n; i++) {
    const u = unitVector(flat[i * 2 + 1]!, flat[i * 2]!);
    const inB = proj.project(flat[i * 2 + 1]!, flat[i * 2]!, b);
    seg(prevU, a.x, a.y, u, b.x, b.y, inB, 0);
    prevU = u;
    a.x = b.x;
    a.y = b.y;
  }

  const total = xs.length;
  const start = ins.indexOf(true);
  const raw: RawRing = { xs, ys, ins, start };
  if (start < 0) return { coords: [], area: 0, anyInside: false, clipped: true, raw };

  // 從一個範圍內的點出發繞一圈；遇到範圍外的一段就換成圓弧
  const ox: number[] = [];
  const oy: number[] = [];
  const R = proj.rimRadius;
  const ARC_STEP = 1 * D2R;
  for (let k = 0; k < total; ) {
    const i = (start + k) % total;
    if (ins[i]) {
      ox.push(xs[i]!);
      oy.push(ys[i]!);
      k++;
      continue;
    }
    // 範圍外的一段：累計方位角的淨變化（相鄰點差距取最短方向）
    const th0 = Math.atan2(ys[i]! - 0.5, xs[i]! - 0.5);
    let th = th0;
    let prev = th0;
    let len = 1;
    while (k + len < total && !ins[(start + k + len) % total]) {
      const j = (start + k + len) % total;
      const cur = Math.atan2(ys[j]! - 0.5, xs[j]! - 0.5);
      let d = cur - prev;
      if (d > Math.PI) d -= 2 * Math.PI;
      else if (d < -Math.PI) d += 2 * Math.PI;
      th += d;
      prev = cur;
      len++;
    }
    const steps = Math.max(1, Math.ceil(Math.abs(th - th0) / ARC_STEP));
    for (let q = 0; q <= steps; q++) {
      const t = th0 + ((th - th0) * q) / steps;
      ox.push(0.5 + R * Math.cos(t));
      oy.push(0.5 + R * Math.sin(t));
    }
    k += len;
  }

  let area = 0;
  const coords: [number, number][] = new Array(ox.length);
  for (let i = 0; i < ox.length; i++) {
    const j = (i + 1) % ox.length;
    area += ox[i]! * oy[j]! - ox[j]! * oy[i]!;
    coords[i] = mercatorToLngLat(ox[i]!, oy[i]!);
  }
  // GeoJSON 環要頭尾相同
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push([first[0], first[1]]);
  return { coords, area: area / 2, anyInside: true, clipped: ins.includes(false), raw };
}
