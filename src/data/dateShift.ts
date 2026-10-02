/**
 * 時間軸 ◀ ▶「前／後一個有資料的日期」（spec R12）。
 *
 * dates 為已排序的 YYYY-MM-DD（字串比較即日期比較）。
 *  - 目前日期在清單內：往前／後移 |delta| 個，碰到頭尾就停在頭尾
 *  - 目前日期不在清單內（例如換機場後的過渡期）：往 delta 方向找最近的一個有資料日期
 *  - 該方向沒有任何有資料日期：回傳 null（不動）
 *
 * 純函式（單元測試：scripts/design/tests/dateShift.test.mjs）。
 */
export function shiftToAvailableDate(dates: readonly string[], current: string, delta: number): string | null {
  if (dates.length === 0 || delta === 0) return null;
  const idx = dates.indexOf(current);
  if (idx >= 0) {
    const next = dates[Math.max(0, Math.min(dates.length - 1, idx + delta))]!;
    return next === current ? null : next;
  }
  if (delta < 0) {
    const earlier = dates.filter((d) => d < current);
    return earlier.length > 0 ? earlier[Math.max(0, earlier.length + delta)]! : null;
  }
  const later = dates.filter((d) => d > current);
  return later.length > 0 ? later[Math.min(later.length - 1, delta - 1)]! : null;
}
