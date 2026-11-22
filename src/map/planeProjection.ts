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
 * 平面相對於「赤道處 mercator」的縮放。0.6 → 方位等距的整個圓盤半徑 0.3，
 * 完整落在 mercator 方形內並留邊（拖曳、俯仰時不會撞到世界邊界）。
 * 高度與公尺尺寸也乘同一個係數，中心點附近的水平／垂直比例才一致。
 */
export const PLANE_SCALE = 0.6;

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

export interface PlaneProjector {
  kind: PlaneKind;
  lat0: number;
  lng0: number;
  /** 投影邊界（圓）在 mercator 世界座標的半徑 */
  rimRadius: number;
  /**
   * 經緯度 → mercator 世界座標，寫進 out。
   * 回傳 false = 這個點超出投影範圍，out 是夾在邊緣的位置（只有日晷會發生）。
   */
  project(lat: number, lng: number, out: PlanePoint): boolean;
}

export function createPlaneProjector(kind: PlaneKind, lat0: number, lng0: number): PlaneProjector {
  const p0 = lat0 * D2R;
  const l0 = lng0 * D2R;
  const sin0 = Math.sin(p0);
  const cos0 = Math.cos(p0);
  const gnomMaxR = Math.tan(GNOM_MAX_DEG * D2R);
  const gnomMinCos = Math.cos(GNOM_MAX_DEG * D2R);
  const rimRadius = (kind === "aeqd" ? Math.PI : kind === "laea" ? 2 : gnomMaxR) * PLANE_UNIT;

  return {
    kind,
    lat0,
    lng0,
    rimRadius,
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
      let k: number;
      let inside = true;
      if (kind === "aeqd") {
        // r = c
        k = s > 1e-12 ? Math.atan2(s, cc) / s : 1;
      } else if (kind === "laea") {
        // r = 2·sin(c/2)
        k = Math.sqrt(2 / (1 + Math.max(cc, -0.999999999)));
      } else if (cc >= gnomMinCos) {
        // r = tan(c)
        k = 1 / cc;
      } else {
        // 超出範圍：保留方位，半徑夾在邊緣
        k = s > 1e-12 ? gnomMaxR / s : 0;
        inside = false;
      }
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
