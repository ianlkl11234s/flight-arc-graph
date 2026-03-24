/**
 * Day/Night Terminator Overlay
 * 根據模擬時間在地圖上繪製晨昏線，夜晚區域半透明遮罩
 * 僅在衛星底圖啟用
 *
 * 太陽位置：NOAA Solar Calculator 演算法（精度 ±0.01°）
 * 多邊形：逐經度計算晨昏線緯度，不會有 antimeridian 斷裂
 */
import type { Map as MapboxMap, GeoJSONSource } from "mapbox-gl";

const SOURCE_ID = "terminator";
const LAYER_ID = "terminator-fill";
const DEG = Math.PI / 180;

/**
 * NOAA Solar Calculator — 計算太陽直射點
 * 回傳 { lng, lat } 精度遠優於簡化餘弦公式：
 * - Declination: 考慮 equation of center + nutation
 * - Longitude: 加入 Equation of Time 修正（最大 ±16 分鐘 = ±4°）
 */
function subSolarPoint(unixSec: number): { lng: number; lat: number } {
  const JD = unixSec / 86400 + 2440587.5;
  const T = (JD - 2451545) / 36525; // Julian century from J2000.0

  // Geometric mean longitude of sun (deg)
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;

  // Mean anomaly (deg)
  const M = 357.52911 + T * (35999.05029 - T * 0.0001537);
  const Mrad = (M % 360) * DEG;

  // Eccentricity
  const e = 0.016708634 - T * (0.000042037 + T * 0.0000001267);

  // Equation of center (deg)
  const C =
    (1.914602 - T * (0.004817 + T * 0.000014)) * Math.sin(Mrad) +
    (0.019993 - T * 0.000101) * Math.sin(2 * Mrad) +
    0.000289 * Math.sin(3 * Mrad);

  // Sun apparent longitude (deg) — with nutation & aberration
  const omega = (125.04 - 1934.136 * T) * DEG;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * DEG;

  // Obliquity of ecliptic (deg → rad)
  const eps0 =
    23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * DEG;

  // Declination
  const lat = Math.asin(Math.sin(eps) * Math.sin(lambda)) / DEG;

  // Equation of Time (minutes)
  const y = Math.tan(eps / 2) ** 2;
  const L0rad = (L0 % 360) * DEG;
  const eqTime =
    (4 / DEG) *
    (y * Math.sin(2 * L0rad) -
      2 * e * Math.sin(Mrad) +
      4 * e * y * Math.sin(Mrad) * Math.cos(2 * L0rad) -
      0.5 * y * y * Math.sin(4 * L0rad) -
      1.25 * e * e * Math.sin(2 * Mrad));

  // Subsolar longitude: solar noon at Greenwich = 720 - eqTime (UTC minutes)
  const utcMin = (((unixSec % 86400) + 86400) % 86400) / 60;
  const lng = ((720 - utcMin - eqTime) / 4 + 540) % 360 - 180;

  return { lng, lat };
}

/**
 * 產生夜晚區域的 GeoJSON
 *
 * 對每條經線，用日落方程求出晨昏線緯度：
 *   0 = sin(lat)·sin(decl) + cos(lat)·cos(decl)·cos(ha)
 *   → lat = atan( -cos(ha) / tan(decl) )
 *
 * 夜晚多邊形 = 晨昏線 + 封閉到暗極
 */
function computeTerminatorGeoJSON(unixSec: number): GeoJSON.FeatureCollection {
  const sun = subSolarPoint(unixSec);
  const decl = sun.lat * DEG;

  // 逐經度計算晨昏線
  const steps = 360;
  const terminator: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const lng = -180 + (360 * i) / steps;
    const ha = (lng - sun.lng) * DEG;
    // atan 保證回傳 (-90°, 90°)，不會溢出
    const lat = Math.atan(-Math.cos(ha) / Math.tan(decl)) / DEG;
    terminator.push([lng, lat]);
  }

  // decl > 0（北半球夏季）→ 南極在暗區；decl < 0 → 北極在暗區
  const nightPole: 90 | -90 = sun.lat >= 0 ? -90 : 90;

  // CCW winding：極線（左→右）→ 晨昏線（右→左）→ 回起點
  const ring: [number, number][] = [];
  ring.push([-180, nightPole]);
  ring.push([180, nightPole]);
  for (let i = steps; i >= 0; i--) {
    ring.push(terminator[i]!);
  }
  ring.push([-180, nightPole]); // close

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
      },
    ],
  };
}

let rafId: number | null = null;
let mapRef: MapboxMap | null = null;
let getTimeFn: (() => number) | null = null;
let lastUpdateTime = 0;
let lastRafMs = 0;

/** rAF loop — throttle 到 ~5fps，避免 setData 過頻 */
function tick() {
  rafId = requestAnimationFrame(tick);
  if (!getTimeFn || !mapRef) return;

  const now = performance.now();
  if (now - lastRafMs < 200) return; // ~5fps
  lastRafMs = now;

  const t = getTimeFn();
  if (Math.abs(t - lastUpdateTime) < 5) return; // 至少 5 秒模擬時間才重算
  lastUpdateTime = t;

  const src = mapRef.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (src) src.setData(computeTerminatorGeoJSON(t));
}

/**
 * 初始化晨昏線圖層
 */
export function initTerminatorLayer(
  map: MapboxMap,
  getTime: () => number,
  _isDark: boolean,
): void {
  mapRef = map;
  getTimeFn = getTime;
  const time = getTime();
  const geojson = computeTerminatorGeoJSON(time);
  lastUpdateTime = time;

  try {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  } catch {
    /* ignore */
  }

  map.addSource(SOURCE_ID, { type: "geojson", data: geojson });

  const beforeId = map.getLayer("static-trails-glow")
    ? "static-trails-glow"
    : map.getLayer("airport-glow-2")
      ? "airport-glow-2"
      : undefined;

  map.addLayer(
    {
      id: LAYER_ID,
      type: "fill",
      source: SOURCE_ID,
      paint: {
        "fill-color": "#000022",
        "fill-opacity": 0.4,
      },
    },
    beforeId,
  );

  if (rafId) cancelAnimationFrame(rafId);
  lastRafMs = 0;
  rafId = requestAnimationFrame(tick);
}

/**
 * 移除晨昏線圖層
 */
export function removeTerminatorLayer(map: MapboxMap): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  mapRef = null;
  getTimeFn = null;
  try {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  } catch {
    /* ignore */
  }
}
