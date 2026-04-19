import type { AirspaceFeature } from "../data/airspaceLoader";
import type { AirspaceSettings } from "../types/airspace";

/** Ray-casting point-in-polygon */
function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0], yi = ring[i]![1];
    const xj = ring[j]![0], yj = ring[j]![1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
                      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Shoelace 面積（平方度，僅用於排序大小） */
function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j]![0] * ring[i]![1];
    a -= ring[i]![0] * ring[j]![1];
  }
  return Math.abs(a) * 0.5;
}

/**
 * 找出點 (lng, lat) 命中的所有空域 features，
 * 依範圍大小升序（最具體的限制排第一）。
 */
export function pickAirspace(
  lng: number,
  lat: number,
  features: AirspaceFeature[],
  settings: AirspaceSettings,
): AirspaceFeature[] {
  if (!settings.enabled) return [];
  const hits: { f: AirspaceFeature; area: number }[] = [];
  for (const f of features) {
    if (!settings.visibility[f.category]) continue;
    if (pointInRing(lng, lat, f.ring)) {
      hits.push({ f, area: ringArea(f.ring) });
    }
  }
  hits.sort((a, b) => a.area - b.area);
  return hits.map((h) => h.f);
}
