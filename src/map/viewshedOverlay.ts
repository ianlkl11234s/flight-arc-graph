import type { Map as MapboxMap } from "mapbox-gl";

const SOURCE_ID = "viewshed-source";
const FILL_LAYER = "viewshed-fill";
const EDGE_LAYER = "viewshed-edge";

const SIDE_OFFSET = 90;
const HALF_FOV = 25;

/**
 * 漸層用同心扇形數量
 * 用疊加（非 donut）避免 z-fighting：
 * 內層被所有層疊加 → 最亮，外層只有自己 → 最暗
 */
const GRADIENT_RINGS = 5;

/** 根據高度動態計算可視半徑 */
function visibleDistanceKm(altM: number): number {
  if (altM <= 0) return 0;
  if (altM < 1000) return 20;
  if (altM < 3000) return 20 + (altM - 1000) / 2000 * 40;
  if (altM < 10000) return 60 + (altM - 3000) / 7000 * 60;
  return Math.min(120 + (altM - 10000) / 3000 * 30, 150);
}

function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const dLng = (lng2 - lng1) * toRad;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

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

type ViewshedStyle = "dark" | "light" | "satellite";

/** 取得基礎色（RGB，不含 alpha） */
function getBaseColor(style: ViewshedStyle) {
  switch (style) {
    case "satellite": return { r: 255, g: 200, b: 50 };
    case "light":     return { r: 255, g: 140, b: 20 };
    case "dark":
    default:          return { r: 255, g: 255, b: 255 };
  }
}

/** 產生扇形 polygon */
function createFanPolygon(
  lat: number, lng: number, radiusKm: number,
  centerAngle: number, halfFov: number, segments: number = 24,
): [number, number][] {
  const coords: [number, number][] = [[lng, lat]];
  const start = centerAngle - halfFov;
  const end = centerAngle + halfFov;
  const step = (end - start) / segments;
  for (let i = 0; i <= segments; i++) {
    coords.push(destinationPoint(lat, lng, start + step * i, radiusKm));
  }
  coords.push([lng, lat]);
  return coords;
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/**
 * 產生漸層扇形 features（疊加模式）
 * 從最大半徑到最小，每層同樣的薄 opacity
 * 內圈被多層覆蓋 → 自然變亮，外圈只有一層 → 最淡
 */
function createGradientFans(
  lat: number, lng: number, maxRadius: number,
  centerAngle: number, halfFov: number,
  ringCount: number, perRingOpacity: number,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  // 從外到內建立（外層先畫，內層疊上去）
  for (let r = ringCount; r >= 1; r--) {
    const radius = maxRadius * (r / ringCount);
    const coords = createFanPolygon(lat, lng, radius, centerAngle, halfFov);
    features.push({
      type: "Feature",
      properties: { opacity: perRingOpacity },
      geometry: { type: "Polygon", coordinates: [coords] },
    });
  }
  return features;
}

/** 新增 viewshed 圖層 */
export function addViewshedLayer(map: MapboxMap, style: ViewshedStyle) {
  if (map.getSource(SOURCE_ID)) return;
  const { r, g, b } = getBaseColor(style);

  map.addSource(SOURCE_ID, { type: "geojson", data: emptyFC() });

  map.addLayer({
    id: FILL_LAYER,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": `rgb(${r},${g},${b})`,
      "fill-opacity": ["coalesce", ["get", "opacity"], 0.03],
      "fill-antialias": true,
    },
  });

  map.addLayer({
    id: EDGE_LAYER,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": `rgba(${r},${g},${b},0.15)`,
      "line-width": 0.8,
      "line-dasharray": [4, 4],
    },
    filter: ["==", ["get", "isEdge"], true],
  });
}

/**
 * 更新 viewshed
 * @param opacity 整體不透明度乘數（0~1，預設 0.5）
 */
export function updateViewshed(
  map: MapboxMap,
  lat: number, lng: number,
  altitudeM: number, heading: number,
  style: ViewshedStyle,
  opacity: number = 0.5,
) {
  const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!source) return;

  // 更新顏色
  const { r, g, b } = getBaseColor(style);
  if (map.getLayer(FILL_LAYER)) map.setPaintProperty(FILL_LAYER, "fill-color", `rgb(${r},${g},${b})`);
  if (map.getLayer(EDGE_LAYER)) map.setPaintProperty(EDGE_LAYER, "line-color", `rgba(${r},${g},${b},${0.15 * opacity * 2})`);

  const radiusKm = visibleDistanceKm(altitudeM);
  if (radiusKm < 3) {
    source.setData(emptyFC());
    return;
  }

  // 每層的 opacity = 基礎值 × 使用者 opacity
  // 5 層疊加，中心 = 5 × perRing，所以 perRing 要小
  const perRing = 0.025 * opacity;

  const leftRings = createGradientFans(lat, lng, radiusKm, heading + SIDE_OFFSET, HALF_FOV, GRADIENT_RINGS, perRing);
  const rightRings = createGradientFans(lat, lng, radiusKm, heading - SIDE_OFFSET, HALF_FOV, GRADIENT_RINGS, perRing);

  // 最外層加上 isEdge 屬性（供邊線 filter 用）
  if (leftRings.length > 0) leftRings[0]!.properties = { ...leftRings[0]!.properties, isEdge: true };
  if (rightRings.length > 0) rightRings[0]!.properties = { ...rightRings[0]!.properties, isEdge: true };

  source.setData({
    type: "FeatureCollection",
    features: [...leftRings, ...rightRings],
  });
}

/** 取得扇形弧線上的地面點（供 3D 掃描線用） */
export function getViewshedArcPoints(
  lat: number, lng: number, altitudeM: number, heading: number,
  segments: number = 8,
): { left: [number, number][]; right: [number, number][] } {
  const radiusKm = visibleDistanceKm(altitudeM);
  if (radiusKm < 3) return { left: [], right: [] };

  const makeArc = (centerAngle: number): [number, number][] => {
    const pts: [number, number][] = [];
    const start = centerAngle - HALF_FOV;
    const end = centerAngle + HALF_FOV;
    const step = (end - start) / segments;
    for (let i = 0; i <= segments; i++) {
      pts.push(destinationPoint(lat, lng, start + step * i, radiusKm));
    }
    return pts;
  };

  return {
    left: makeArc(heading + SIDE_OFFSET),
    right: makeArc(heading - SIDE_OFFSET),
  };
}

export function clearViewshed(map: MapboxMap) {
  const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (source) source.setData(emptyFC());
}

export { computeBearing };
export type { ViewshedStyle };
