import mapboxgl from "mapbox-gl";
import { createPlaneProjector, PLANE_SCALE, type PlaneKind, type PlaneProjector, type PlanePoint } from "../map/planeProjection";

/**
 * 高度放大倍率（可動態調整）
 * Mercator z 在一般 zoom level 下極小，需放大才看得出高度差。
 */
let altExaggeration = 3;
let altOffset = 0; // 基準高度偏移（公尺）

export function setAltExaggeration(v: number) {
  altExaggeration = v;
}

export function getAltExaggeration(): number {
  return altExaggeration;
}

export function setAltOffset(v: number) {
  altOffset = v;
}

export function getAltOffset(): number {
  return altOffset;
}

/**
 * 平面方位投影模式（null = 標準 mercator／globe）。
 * 開啟後 toMercator() 改回傳「以某點為中心的方位投影平面」座標，下游（光軌、光球、
 * 靜態軌跡、picking）照常把它當 mercator 世界座標用。切換後要讓座標快取失效：
 * custom layer 每幀比對 getPlaneProjectionKey()，變了就 invalidate + 重建。
 */
let planeProjector: PlaneProjector | null = null;
let planeKey = "";
const _planePt: PlanePoint = { x: 0, y: 0 };

export function setPlaneProjection(cfg: { kind: PlaneKind; lat: number; lng: number } | null) {
  const key = cfg ? `${cfg.kind}|${cfg.lat}|${cfg.lng}` : "";
  if (key === planeKey) return;
  planeKey = key;
  planeProjector = cfg ? createPlaneProjector(cfg.kind, cfg.lat, cfg.lng) : null;
}

export function getPlaneProjector(): PlaneProjector | null {
  return planeProjector;
}

/** 目前投影設定的簽章（"" = 標準）；用來偵測「座標基準變了」 */
export function getPlaneProjectionKey(): string {
  return planeKey;
}

/**
 * 將 [lat, lng, alt_m] 轉換為 Mapbox MercatorCoordinate
 * Three.js 可直接使用 MercatorCoordinate 的 x, y, z
 *
 * x 手動計算以支援展開後的經度（>180° 或 <-180°，跨換日線航班），
 * 因為 MercatorCoordinate.fromLngLat 會將經度正規化到 [-180, 180]。
 * y, z 由 Mapbox 計算（僅依賴緯度和高度，與經度無關）。
 */
export function toMercator(
  lat: number,
  lng: number,
  altMeters: number,
): { x: number; y: number; z: number } {
  if (planeProjector) {
    // 平面方位投影：x/y 由投影決定；高度用赤道處的比例 × PLANE_SCALE（與平面同縮放）
    planeProjector.project(lat, lng, _planePt);
    const z0 = mapboxgl.MercatorCoordinate.fromLngLat(
      [0, 0],
      (altMeters + altOffset) * altExaggeration,
    ).z;
    return { x: _planePt.x, y: _planePt.y, z: z0 * PLANE_SCALE };
  }
  // x 手動計算，避免 Mapbox 正規化經度
  const x = (lng + 180) / 360;
  // y, z 用 Mapbox 計算（經度不影響結果）
  const mc = mapboxgl.MercatorCoordinate.fromLngLat(
    [0, lat],
    (altMeters + altOffset) * altExaggeration,
  );
  return { x, y: mc.y, z: mc.z };
}

/**
 * 取得某個 MercatorCoordinate 位置 1 公尺對應的 scale
 * 用於將公尺單位轉為 Mercator 單位
 */
export function metersPerUnit(lat: number): number {
  if (planeProjector) {
    return mapboxgl.MercatorCoordinate.fromLngLat([0, 0], 0).meterInMercatorCoordinateUnits() * PLANE_SCALE;
  }
  const mc = mapboxgl.MercatorCoordinate.fromLngLat([0, lat], 0);
  return mc.meterInMercatorCoordinateUnits();
}
