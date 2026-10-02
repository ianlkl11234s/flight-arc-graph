import type { TrackPath } from "../types/trackPath";

/**
 * 航班卡的「目前高度」（公尺）：取時刻 t 以前最後一個航跡點的高度；
 * t 在航跡時間範圍外（還沒起飛／已落地）回 null（顯示「—」，R9）。
 * 純函式（單元測試：scripts/design/tests/flightAltitude.test.mjs）。
 */
export function altitudeAt(path: TrackPath, t: number): number | null {
  if (path.length === 0 || t < path.t(0) || t > path.t(path.length - 1)) return null;
  for (let i = path.length - 1; i >= 0; i--) {
    if (path.t(i) <= t) return Math.round(path.alt(i));
  }
  return null;
}
