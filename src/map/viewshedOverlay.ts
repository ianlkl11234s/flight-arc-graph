/**
 * Viewshed 純計算工具（無 Mapbox 依賴）
 * 所有渲染已搬到 Three.js (FlightScene)
 */

const SIDE_OFFSET = 90;
const HALF_FOV = 25;

export type ViewshedStyle = "dark" | "light" | "satellite";

/** 根據高度動態計算可視半徑 (km) */
export function visibleDistanceKm(altM: number): number {
  if (altM <= 0) return 0;
  if (altM < 1000) return 20;
  if (altM < 3000) return 20 + (altM - 1000) / 2000 * 40;
  if (altM < 10000) return 60 + (altM - 3000) / 7000 * 60;
  return Math.min(120 + (altM - 10000) / 3000 * 30, 150);
}

/** 兩點間航向角 (degrees, 0=N, CW) */
export function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

/** 單側扇形弧線點 */
function fanArc(
  lat: number, lng: number, radiusKm: number,
  centerAngle: number, halfFov: number, segments: number,
): [number, number][] {
  const pts: [number, number][] = [];
  const start = centerAngle - halfFov;
  const end = centerAngle + halfFov;
  const step = (end - start) / segments;
  for (let i = 0; i <= segments; i++) {
    pts.push(destinationPoint(lat, lng, start + step * i, radiusKm));
  }
  return pts;
}

/** 一側的 ring 資料 */
export interface ViewshedRing {
  /** 弧線上的 [lng, lat] 點 */
  arc: [number, number][];
  /** 此環的 alpha (0~1, 內圈=1 外圈=0) */
  alpha: number;
}

/**
 * 取得 viewshed 漸層環資料（供 Three.js 渲染）
 * @returns left/right 各 ringCount 個環
 */
export function getViewshedRings(
  lat: number, lng: number, altM: number, heading: number,
  ringCount: number = 5, segments: number = 16,
): { left: ViewshedRing[]; right: ViewshedRing[] } | null {
  const maxRadius = visibleDistanceKm(altM);
  if (maxRadius < 3) return null;

  const buildSide = (offset: number): ViewshedRing[] => {
    const rings: ViewshedRing[] = [];
    for (let r = 1; r <= ringCount; r++) {
      const radius = maxRadius * (r / ringCount);
      const arc = fanArc(lat, lng, radius, heading + offset, HALF_FOV, segments);
      // 二次方衰減：內圈亮外圈暗
      const frac = r / ringCount;
      const alpha = 1 - frac * frac;
      rings.push({ arc, alpha });
    }
    return rings;
  };

  return {
    left: buildSide(SIDE_OFFSET),
    right: buildSide(-SIDE_OFFSET),
  };
}

/**
 * 取得掃描線弧線點（最外圈）
 */
export function getViewshedArcPoints(
  lat: number, lng: number, altM: number, heading: number,
  segments: number = 8,
): { left: [number, number][]; right: [number, number][] } {
  const radiusKm = visibleDistanceKm(altM);
  if (radiusKm < 3) return { left: [], right: [] };

  return {
    left: fanArc(lat, lng, radiusKm, heading + SIDE_OFFSET, HALF_FOV, segments),
    right: fanArc(lat, lng, radiusKm, heading - SIDE_OFFSET, HALF_FOV, segments),
  };
}
