import type { Map as MapboxMap } from "mapbox-gl";

const SOURCE_ID = "viewshed-source";
const FILL_LAYER = "viewshed-fill";
const EDGE_LAYER = "viewshed-edge";

/**
 * 乘客窗戶視野參數
 * - 左右各一個扇形，中心在航向的 ±90°
 * - 每側 FOV ≈ 50°（±25°），模擬實際窗戶視野
 */
const SIDE_OFFSET = 90;
const HALF_FOV = 25;

/** 漸層環數（越多越平滑，但 feature 越多） */
const GRADIENT_RINGS = 5;

/**
 * 根據高度動態計算可視半徑 (km)
 * - < 1,000m: 20km（低空，霧霾影響大）
 * - 1,000~3,000m: 20→60km（爬升中）
 * - 3,000~10,000m: 60→120km（高空，能見度改善）
 * - > 10,000m: 120→150km（巡航，大氣衰減上限）
 */
function visibleDistanceKm(altM: number): number {
  if (altM <= 0) return 0;
  if (altM < 1000) return 20;
  if (altM < 3000) return 20 + (altM - 1000) / 2000 * 40;       // 20→60
  if (altM < 10000) return 60 + (altM - 3000) / 7000 * 60;      // 60→120
  return Math.min(120 + (altM - 10000) / 3000 * 30, 150);        // 120→150, cap 150
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

/** 產生扇形弧線上的點 */
function fanArcPoints(
  lat: number, lng: number, radiusKm: number,
  centerAngle: number, halfFov: number, segments: number,
): [number, number][] {
  const pts: [number, number][] = [];
  const startAngle = centerAngle - halfFov;
  const endAngle = centerAngle + halfFov;
  const step = (endAngle - startAngle) / segments;
  for (let i = 0; i <= segments; i++) {
    pts.push(destinationPoint(lat, lng, startAngle + step * i, radiusKm));
  }
  return pts;
}

/**
 * 產生漸層扇形環（donut ring）
 * ring 0 = 最內圈（最不透明），ring N-1 = 最外圈（最透明）
 */
function createGradientRings(
  lat: number, lng: number, maxRadius: number,
  centerAngle: number, halfFov: number,
  ringCount: number, isDark: boolean,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const segments = 20;
  const origin: [number, number] = [lng, lat];

  // 每環的透明度（從內到外遞減）
  const baseOpacity = isDark ? 0.10 : 0.14;

  for (let r = 0; r < ringCount; r++) {
    const innerFrac = r / ringCount;
    const outerFrac = (r + 1) / ringCount;
    const innerR = maxRadius * innerFrac;
    const outerR = maxRadius * outerFrac;

    // 透明度隨距離衰減（二次方 falloff 更自然）
    const midFrac = (innerFrac + outerFrac) / 2;
    const opacity = baseOpacity * (1 - midFrac * midFrac);

    let outerRing: [number, number][];
    if (innerR < 0.5) {
      // 最內圈：完整扇形（不挖洞）
      outerRing = [origin, ...fanArcPoints(lat, lng, outerR, centerAngle, halfFov, segments), origin];
      features.push({
        type: "Feature",
        properties: { opacity },
        geometry: { type: "Polygon", coordinates: [outerRing] },
      });
    } else {
      // 環形（outer - inner donut）
      const outerArc = fanArcPoints(lat, lng, outerR, centerAngle, halfFov, segments);
      const innerArc = fanArcPoints(lat, lng, innerR, centerAngle, halfFov, segments);

      // 外圈順時針
      outerRing = [origin, ...outerArc, origin];
      // 內圈逆時針（作為 hole）
      const innerRing: [number, number][] = [origin, ...innerArc.slice().reverse(), origin];

      features.push({
        type: "Feature",
        properties: { opacity },
        geometry: { type: "Polygon", coordinates: [outerRing, innerRing] },
      });
    }
  }

  return features;
}

/** 空的 GeoJSON FeatureCollection */
function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/** 新增 viewshed 圖層 */
export function addViewshedLayer(map: MapboxMap, isDark: boolean) {
  if (map.getSource(SOURCE_ID)) return;

  const fillColor = isDark ? "rgba(255,255,255,1)" : "rgba(255,160,40,1)";
  const edgeColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(255,140,20,0.12)";

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: emptyFC(),
  });

  // 填充：用 data-driven opacity
  map.addLayer({
    id: FILL_LAYER,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": fillColor,
      "fill-opacity": ["coalesce", ["get", "opacity"], 0.06],
      "fill-antialias": true,
    },
  });

  // 最外圈邊線（很淡）
  map.addLayer({
    id: EDGE_LAYER,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": edgeColor,
      "line-width": 0.5,
      "line-opacity": 0.4,
    },
  });
}

/** 更新 viewshed：左右兩側各一個漸層扇形 */
export function updateViewshed(
  map: MapboxMap,
  lat: number,
  lng: number,
  altitudeM: number,
  heading: number,
  isDark: boolean,
) {
  const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!source) return;

  const radiusKm = visibleDistanceKm(altitudeM);
  if (radiusKm < 3) {
    source.setData(emptyFC());
    return;
  }

  // 左舷窗
  const leftRings = createGradientRings(
    lat, lng, radiusKm,
    heading + SIDE_OFFSET, HALF_FOV,
    GRADIENT_RINGS, isDark,
  );

  // 右舷窗
  const rightRings = createGradientRings(
    lat, lng, radiusKm,
    heading - SIDE_OFFSET, HALF_FOV,
    GRADIENT_RINGS, isDark,
  );

  source.setData({
    type: "FeatureCollection",
    features: [...leftRings, ...rightRings],
  });
}

/** 清除 viewshed 資料 */
export function clearViewshed(map: MapboxMap) {
  const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (source) source.setData(emptyFC());
}

export { computeBearing };
