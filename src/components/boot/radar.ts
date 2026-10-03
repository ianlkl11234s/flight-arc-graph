/**
 * 開場雷達上的點：預設機場周邊的真實機場，依實際方位與距離投影到雷達上（不捏造）。
 * 座標來源：機場目錄（public/airport-points.geojson，loadAirportMeta）已載入就用它；
 * 還沒到時退回 src/map/cameraPresets.ts 的機場座標。中心機場本身沒有座標 → 回空陣列（只畫環與掃描線）。
 */
import type { AirportMeta } from "../../data/airportMeta";
import { CAMERA_PRESETS, getPresetByIcao } from "../../map/cameraPresets";

export interface RadarCandidate {
  icao: string;
  lat: number;
  lng: number;
}

export interface RadarPoint {
  icao: string;
  /** 以雷達半徑為 1 的螢幕座標（x 往右、y 往下；北在上） */
  x: number;
  y: number;
  /** 方位角（rad，0 = 正北，順時針） */
  az: number;
  /** 距離（km） */
  km: number;
}

const EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** 大圓距離（km）與初始方位角（rad，0 = 北，順時針，0..2π） */
export function distanceBearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): { km: number; az: number } {
  const φ1 = rad(from.lat);
  const φ2 = rad(to.lat);
  const dφ = φ2 - φ1;
  const dλ = rad(to.lng - from.lng);
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  const km = 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  let az = Math.atan2(y, x);
  if (az < 0) az += Math.PI * 2;
  return { km, az };
}

/** 半徑 radiusKm 內的候選機場投影到雷達（方位等距投影）。依方位角排序＝掃描線掃到的順序。 */
export function radarPoints(
  center: { lat: number; lng: number },
  candidates: RadarCandidate[],
  radiusKm: number,
  maxPoints = 120,
): RadarPoint[] {
  const out: RadarPoint[] = [];
  for (const c of candidates) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const { km, az } = distanceBearing(center, c);
    if (km < 0.5 || km > radiusKm) continue; // 中心機場本身（或同一點）不算
    const r = km / radiusKm;
    out.push({ icao: c.icao, x: Math.sin(az) * r, y: -Math.cos(az) * r, az, km });
  }
  out.sort((a, b) => a.km - b.km);
  return out.slice(0, maxPoints).sort((a, b) => a.az - b.az);
}

/** 機場座標：目錄優先，退回 camera preset；都沒有 → null */
export function airportCoord(icao: string, meta: Record<string, AirportMeta>): { lat: number; lng: number } | null {
  const m = meta[icao];
  if (m && Number.isFinite(m.lat) && Number.isFinite(m.lng)) return { lat: m.lat, lng: m.lng };
  const p = getPresetByIcao(icao);
  return p ? { lat: p.center[1], lng: p.center[0] } : null;
}

/** App／調整頁共用：中心機場周邊的雷達點 */
export function bootRadarPoints(centerIcao: string, meta: Record<string, AirportMeta>, radiusKm: number): RadarPoint[] {
  const center = airportCoord(centerIcao, meta);
  if (!center) return [];
  const metaEntries = Object.entries(meta);
  const candidates: RadarCandidate[] = metaEntries.length > 0
    ? metaEntries.map(([icao, m]) => ({ icao, lat: m.lat, lng: m.lng }))
    : CAMERA_PRESETS.map((p) => ({ icao: p.icao, lat: p.center[1], lng: p.center[0] }));
  return radarPoints(center, candidates.filter((c) => c.icao !== centerIcao), radiusKm);
}
