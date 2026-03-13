/** 將 "YYYY-MM-DD" 轉成台灣時區 00:00:00 的 unix sec */
export function dateToUnixTW(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcMs = Date.UTC(y!, m! - 1, d!, 0, 0, 0) - 8 * 3600_000;
  return utcMs / 1000;
}

/** 將 "YYYY-MM-DD" + "HH:MM" 轉成台灣時區的 unix sec */
export function timeToUnixTW(dateStr: string, timeStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  const utcMs = Date.UTC(y!, mo! - 1, d!, h!, m!, 0) - 8 * 3600_000;
  return Math.floor(utcMs / 1000);
}
