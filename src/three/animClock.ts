/**
 * DEV 視覺回歸用的動畫時鐘覆寫。
 *
 * 光球呼吸／閃爍、機場 bloom、空域極光都以 wall-clock 秒數推進，截圖無法重現。
 * `scripts/perf/visual-check.mjs` 會先呼叫 `window.__flightArcDebug.freezeAnimation(t)`
 * 把這個值釘死，讓同一時刻的畫面可逐像素比對。
 *
 * production 永遠是 null（沒有任何 UI 路徑會設定它），不影響正式行為。
 */
let frozenSeconds: number | null = null;

/** 凍結（秒）／解除（null）所有 wall-clock 動畫時間 */
export function setFrozenAnimTime(t: number | null) {
  frozenSeconds = t;
}

/** 目前的凍結值；null = 照常走 wall-clock */
export function getFrozenAnimTime(): number | null {
  return frozenSeconds;
}
