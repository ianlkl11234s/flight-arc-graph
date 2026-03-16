import type { Map as MapboxMap } from "mapbox-gl";

const SOURCE_ID = "viewshed-source";
const FILL_LAYER = "viewshed-fill";
const GLOW_LAYER = "viewshed-glow";
const EDGE_LAYER = "viewshed-edge";

/** 最大顯示半徑 (km) — 避免扇形過大佔滿地圖 */
const MAX_RADIUS_KM = 200;

/** 最小顯示半徑 (km) — 地面滑行時不顯示 */
const MIN_RADIUS_KM = 5;

/**
 * 乘客窗戶視野參數
 * - 左右各一個扇形，中心在航向的 ±90°（垂直於機身）
 * - 每側 FOV ≈ 90°（±45° from perpendicular）
 *   前方被機身/機翼擋住（約 heading ±45° 的死角）
 *   後方也被機身擋住
 */
const SIDE_OFFSET = 90;   // 扇形中心相對航向的偏移角度
const HALF_FOV = 45;      // 每側扇形的半張角

/** 理論地平線距離 (km)：d ≈ 3.57 × √h，加上上限 */
function horizonDistanceKm(altitudeMeters: number): number {
  const d = 3.57 * Math.sqrt(Math.max(0, altitudeMeters));
  return Math.min(d, MAX_RADIUS_KM);
}

/** 計算兩點間的航向角 (degrees, 0=N, CW) */
function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const dLng = (lng2 - lng1) * toRad;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/** 從 origin 沿 bearing 走 distance_km，回傳 [lng, lat] */
function destinationPoint(
  lat: number, lng: number, bearing: number, distanceKm: number,
): [number, number] {
  const R = 6371;
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const φ1 = lat * toRad;
  const λ1 = lng * toRad;
  const θ = bearing * toRad;
  const δ = distanceKm / R;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
  );

  return [λ2 * toDeg, φ2 * toDeg];
}

/** 產生單側扇形 GeoJSON Polygon */
function createFanPolygon(
  lat: number,
  lng: number,
  radiusKm: number,
  centerAngle: number,
  halfFov: number,
  segments: number = 24,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [[lng, lat]];
  const startAngle = centerAngle - halfFov;
  const endAngle = centerAngle + halfFov;
  const step = (endAngle - startAngle) / segments;

  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + step * i;
    coords.push(destinationPoint(lat, lng, angle, radiusKm));
  }

  coords.push([lng, lat]);

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
  };
}

/** 空的 GeoJSON FeatureCollection */
function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/** 新增 viewshed 圖層 */
export function addViewshedLayer(map: MapboxMap, isDark: boolean) {
  if (map.getSource(SOURCE_ID)) return;

  const fillColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,160,40,0.10)";
  const glowColor = isDark ? "rgba(255,255,255,0.03)" : "rgba(255,160,40,0.05)";
  const edgeColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(255,140,20,0.25)";

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: emptyFC(),
  });

  map.addLayer({
    id: GLOW_LAYER,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": glowColor,
      "fill-antialias": true,
    },
  });

  map.addLayer({
    id: FILL_LAYER,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": fillColor,
      "fill-antialias": true,
    },
  });

  map.addLayer({
    id: EDGE_LAYER,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": edgeColor,
      "line-width": 1,
      "line-opacity": 0.6,
    },
  });
}

/** 更新 viewshed：左右兩個扇形 */
export function updateViewshed(
  map: MapboxMap,
  lat: number,
  lng: number,
  altitudeM: number,
  heading: number,
) {
  const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!source) return;

  const radiusKm = horizonDistanceKm(altitudeM);
  if (radiusKm < MIN_RADIUS_KM) {
    source.setData(emptyFC());
    return;
  }

  // 左側窗戶：航向 + 90°（左舷）
  const leftFan = createFanPolygon(
    lat, lng, radiusKm,
    heading + SIDE_OFFSET,
    HALF_FOV,
  );

  // 右側窗戶：航向 - 90°（右舷）
  const rightFan = createFanPolygon(
    lat, lng, radiusKm,
    heading - SIDE_OFFSET,
    HALF_FOV,
  );

  source.setData({
    type: "FeatureCollection",
    features: [leftFan, rightFan],
  });
}

/** 清除 viewshed 資料 */
export function clearViewshed(map: MapboxMap) {
  const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (source) source.setData(emptyFC());
}

export { computeBearing };
