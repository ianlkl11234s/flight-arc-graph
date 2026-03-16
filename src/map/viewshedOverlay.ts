import type { Map as MapboxMap } from "mapbox-gl";

const SOURCE_ID = "viewshed-source";
const FILL_LAYER = "viewshed-fill";
const GLOW_LAYER = "viewshed-glow";
const EDGE_LAYER = "viewshed-edge";

/** 理論地平線距離 (km)：d ≈ 3.57 × √h */
function horizonDistanceKm(altitudeMeters: number): number {
  return 3.57 * Math.sqrt(Math.max(0, altitudeMeters));
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
  const R = 6371; // 地球半徑 km
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

/** 產生扇形 GeoJSON Polygon */
function createFanPolygon(
  lat: number,
  lng: number,
  radiusKm: number,
  heading: number,
  halfFov: number = 60,
  segments: number = 32,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [[lng, lat]]; // 起點
  const startAngle = heading - halfFov;
  const endAngle = heading + halfFov;
  const step = (endAngle - startAngle) / segments;

  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + step * i;
    coords.push(destinationPoint(lat, lng, angle, radiusKm));
  }

  coords.push([lng, lat]); // 回到原點封閉

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

  // 外層 glow（稍微擴大的半透明層）
  map.addLayer({
    id: GLOW_LAYER,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": glowColor,
      "fill-antialias": true,
    },
  });

  // 主填充
  map.addLayer({
    id: FILL_LAYER,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": fillColor,
      "fill-antialias": true,
    },
  });

  // 邊線
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

/** 更新 viewshed 扇形位置 */
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
  // 高度太低時不顯示（地面滑行）
  if (radiusKm < 5) {
    source.setData(emptyFC());
    return;
  }

  const fan = createFanPolygon(lat, lng, radiusKm, heading);
  source.setData({
    type: "FeatureCollection",
    features: [fan],
  });
}

/** 清除 viewshed 資料 */
export function clearViewshed(map: MapboxMap) {
  const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (source) source.setData(emptyFC());
}

/** 移除 viewshed 圖層 */
export function removeViewshedLayer(map: MapboxMap) {
  if (map.getLayer(EDGE_LAYER)) map.removeLayer(EDGE_LAYER);
  if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER);
  if (map.getLayer(GLOW_LAYER)) map.removeLayer(GLOW_LAYER);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

/** 更新主題色 */
export function setViewshedTheme(map: MapboxMap, isDark: boolean) {
  if (!map.getLayer(FILL_LAYER)) return;

  const fillColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,160,40,0.10)";
  const glowColor = isDark ? "rgba(255,255,255,0.03)" : "rgba(255,160,40,0.05)";
  const edgeColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(255,140,20,0.25)";

  map.setPaintProperty(FILL_LAYER, "fill-color", fillColor);
  map.setPaintProperty(GLOW_LAYER, "fill-color", glowColor);
  map.setPaintProperty(EDGE_LAYER, "line-color", edgeColor);
}

/** 設定可見度 */
export function setViewshedVisible(map: MapboxMap, visible: boolean) {
  const vis = visible ? "visible" : "none";
  if (map.getLayer(FILL_LAYER)) map.setLayoutProperty(FILL_LAYER, "visibility", vis);
  if (map.getLayer(GLOW_LAYER)) map.setLayoutProperty(GLOW_LAYER, "visibility", vis);
  if (map.getLayer(EDGE_LAYER)) map.setLayoutProperty(EDGE_LAYER, "visibility", vis);
}

export { computeBearing };
