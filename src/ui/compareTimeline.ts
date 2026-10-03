/**
 * 多日 Compare 時間軸的「等寬分段」換算（純函式，單元測試：scripts/design/tests/compareTimeline.test.mjs）。
 *
 * Compare 的實際語意是「依日期先後串成一條絕對時間軸」：useTimeline 的視窗 = 最早所選日 00:00
 * 到最晚所選日 24:00，播放時鐘線性前進（中間沒選的日子也照樣走過，只是沒有航班）。
 * 介面上把每個所選日期畫成一段等寬區塊（不依絕對時間留白），滑桿位置 u ∈ [0,1] 與時刻 t 依此換算：
 * - 第 k 段（日期升冪）佔 [k/N, (k+1)/N)，段內依當日秒數線性。
 * - t 落在兩段之間的空檔（沒選的日子）→ 釘在前一段的末端；早於第一段 → 0；晚於最後一段 → 1。
 */
import { dateToUnixTW } from "../utils/dateUtils";

export const DAY_SEC = 86400;

/** 所選日期 → 各段起點（unix 秒，台灣 00:00），日期升冪、去重 */
export function compareSegmentStarts(dates: readonly string[]): number[] {
  return [...new Set(dates)].sort().map(dateToUnixTW);
}

/** 時刻 → 滑桿位置 */
export function compareTimeToProgress(t: number, starts: readonly number[]): number {
  const n = starts.length;
  if (n === 0) return 0;
  if (t < starts[0]!) return 0;
  for (let k = n - 1; k >= 0; k--) {
    const s = starts[k]!;
    if (t >= s) {
      const frac = Math.min(1, (t - s) / DAY_SEC);
      return (k + frac) / n;
    }
  }
  return 0;
}

/** 滑桿位置 → 時刻（每段最後一秒為 s + DAY_SEC − 1，對齊 useTimeline 的 windowEnd） */
export function compareProgressToTime(u: number, starts: readonly number[]): number {
  const n = starts.length;
  if (n === 0) return 0;
  const x = Math.max(0, Math.min(1, u)) * n;
  const k = Math.min(n - 1, Math.floor(x));
  const s = starts[k]!;
  return Math.min(s + DAY_SEC - 1, s + Math.round((x - k) * DAY_SEC));
}
