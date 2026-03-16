import type { Map as MapboxMap } from "mapbox-gl";

const SOURCE_ID = "viewshed-source";
const FILL_LAYER = "viewshed-fill";
const EDGE_LAYER = "viewshed-edge";

const SIDE_OFFSET = 90;
const HALF_FOV = 25;
const GRADIENT_RINGS = 5;

type ViewshedStyle = "dark" | "light" | "satellite";

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

function getBaseColor(style: ViewshedStyle) {
  switch (style) {
    case "satellite": return { r: 255, g: 200, b: 50 };
    case "light":     return { r: 255, g: 140, b: 20 };
    default:          return { r: 255, g: 255, b: 255 };
  }
}

function fanCoords(
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
 * Glow 漸層扇形（疊加模式）
 * perRing 提高：slider=1 時中心 = 5×0.06 = 0.30（明顯可見）
 */
function createGlowFeatures(
  lat: number, lng: number, radiusKm: number, heading: number,
  opacity: number,
): GeoJSON.Feature[] {
  const perRing = 0.06 * opacity;
  const features: GeoJSON.Feature[] = [];

  for (const offset of [SIDE_OFFSET, -SIDE_OFFSET]) {
    for (let r = GRADIENT_RINGS; r >= 1; r--) {
      const radius = radiusKm * (r / GRADIENT_RINGS);
      const coords = fanCoords(lat, lng, radius, heading + offset, HALF_FOV);
      features.push({
        type: "Feature",
        properties: { opacity: perRing, isEdge: r === GRADIENT_RINGS },
        geometry: { type: "Polygon", coordinates: [coords] },
      });
    }
  }
  return features;
}

// ── Public API ──

export function addViewshedLayer(map: MapboxMap, style: ViewshedStyle) {
  if (map.getSource(SOURCE_ID)) return;
  if (!map.isStyleLoaded()) return;
  const { r, g, b } = getBaseColor(style);

  try {
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
  } catch { /* style 切換期間 */ }
}

export function updateViewshed(
  map: MapboxMap,
  lat: number, lng: number,
  altitudeM: number, heading: number,
  style: ViewshedStyle,
  opacity: number = 0.5,
) {
  if (!map.isStyleLoaded()) return;
  const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!source) return;

  const radiusKm = visibleDistanceKm(altitudeM);
  if (radiusKm < 3) {
    source.setData(emptyFC());
    return;
  }

  // 更新顏色
  const { r, g, b } = getBaseColor(style);
  try {
    if (map.getLayer(FILL_LAYER)) map.setPaintProperty(FILL_LAYER, "fill-color", `rgb(${r},${g},${b})`);
    if (map.getLayer(EDGE_LAYER)) map.setPaintProperty(EDGE_LAYER, "line-color", `rgba(${r},${g},${b},${0.3 * opacity})`);
  } catch { /* style 切換中 */ }

  const features = createGlowFeatures(lat, lng, radiusKm, heading, opacity);
  source.setData({ type: "FeatureCollection", features });
}

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
