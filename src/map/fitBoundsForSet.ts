import type { LngLatBoundsLike } from "mapbox-gl";
import type { CameraPreset } from "../types";

export interface FitBoundsResult {
  bounds: LngLatBoundsLike;
  pitch: number;
  bearing: number;
  /** 機場數 = 1 時退化為 single preset，回傳 null 由呼叫端走 flyTo */
  fallbackPreset: CameraPreset | null;
}

/**
 * 從一組機場 ICAO 算出 fitBounds 視角。
 *
 * - 0 機場 → null（由呼叫端決定退到 default 或維持原位）
 * - 1 機場 → fallbackPreset 帶該機場 preset，呼叫端建議走 flyTo
 * - 2+ 機場 → 用 min/max lng/lat 算 bounds
 *
 * 不處理 antimeridian 跨越（Tier 1 內建組合都不橫跨太平洋）。
 */
export function computeFitBoundsForSet(
  icaos: string[],
  presetLookup: (icao: string) => CameraPreset | undefined,
): FitBoundsResult | null {
  const presets: CameraPreset[] = [];
  for (const icao of icaos) {
    const p = presetLookup(icao);
    if (p) presets.push(p);
  }
  if (presets.length === 0) return null;
  if (presets.length === 1) {
    return {
      bounds: [presets[0]!.center, presets[0]!.center],
      pitch: presets[0]!.pitch,
      bearing: presets[0]!.bearing,
      fallbackPreset: presets[0]!,
    };
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of presets) {
    const [lng, lat] = p.center;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return {
    bounds: [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    pitch: 35,
    bearing: 0,
    fallbackPreset: null,
  };
}
