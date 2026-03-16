import type { Map as MapboxMap } from "mapbox-gl";

const SOURCE_ID = "viewshed-source";
const FILL_LAYER = "viewshed-fill";
const EDGE_LAYER = "viewshed-edge";

const SIDE_OFFSET = 90;
const HALF_FOV = 25;

/**
 * 根據高度動態計算可視半徑 (km)
 * 含大氣衰減上限
 */
function visibleDistanceKm(altM: number): number {
  if (altM <= 0) return 0;
  if (altM < 1000) return 20;
  if (altM < 3000) return 20 + (altM - 1000) / 2000 * 40;
  if (altM < 10000) return 60 + (altM - 3000) / 7000 * 60;
  return Math.min(120 + (altM - 10000) / 3000 * 30, 150);
}

/** 計算兩點間的航向角 */
function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const dLng = (lng2 - lng1) * toRad;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/** 從 origin 沿 bearing 走 distance_km */
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

function getColors(style: ViewshedStyle) {
  switch (style) {
    case "satellite":
      return { fill: "rgba(255,200,50,0.07)", edge: "rgba(255,200,50,0.15)" };
    case "light":
      return { fill: "rgba(255,140,20,0.08)", edge: "rgba(255,140,20,0.18)" };
    case "dark":
    default:
      return { fill: "rgba(255,255,255,0.05)", edge: "rgba(255,255,255,0.10)" };
  }
}

/** 產生單側扇形 */
function createFanPolygon(
  lat: number, lng: number, radiusKm: number,
  centerAngle: number, halfFov: number, segments: number = 24,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [[lng, lat]];
  const start = centerAngle - halfFov;
  const end = centerAngle + halfFov;
  const step = (end - start) / segments;
  for (let i = 0; i <= segments; i++) {
    coords.push(destinationPoint(lat, lng, start + step * i, radiusKm));
  }
  coords.push([lng, lat]);
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/** 新增/重建 viewshed 圖層 */
export function addViewshedLayer(map: MapboxMap, style: ViewshedStyle) {
  if (map.getSource(SOURCE_ID)) return;
  const { fill, edge } = getColors(style);

  map.addSource(SOURCE_ID, { type: "geojson", data: emptyFC() });

  map.addLayer({
    id: FILL_LAYER,
    type: "fill",
    source: SOURCE_ID,
    paint: { "fill-color": fill, "fill-antialias": true },
  });

  map.addLayer({
    id: EDGE_LAYER,
    type: "line",
    source: SOURCE_ID,
    paint: { "line-color": edge, "line-width": 0.8, "line-dasharray": [4, 4] },
  });
}

/** 更新 viewshed 位置 + 顏色 */
export function updateViewshed(
  map: MapboxMap,
  lat: number, lng: number,
  altitudeM: number, heading: number,
  style: ViewshedStyle,
) {
  const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!source) return;

  // 更新顏色（style 可能在運行中切換）
  const { fill, edge } = getColors(style);
  if (map.getLayer(FILL_LAYER)) map.setPaintProperty(FILL_LAYER, "fill-color", fill);
  if (map.getLayer(EDGE_LAYER)) map.setPaintProperty(EDGE_LAYER, "line-color", edge);

  const radiusKm = visibleDistanceKm(altitudeM);
  if (radiusKm < 3) {
    source.setData(emptyFC());
    return;
  }

  const leftFan = createFanPolygon(lat, lng, radiusKm, heading + SIDE_OFFSET, HALF_FOV);
  const rightFan = createFanPolygon(lat, lng, radiusKm, heading - SIDE_OFFSET, HALF_FOV);

  source.setData({ type: "FeatureCollection", features: [leftFan, rightFan] });
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
