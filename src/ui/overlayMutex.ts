/**
 * 浮層互斥（spec R2；移植自 mini-taiwan-pulse leftPanelMutex.ts）。
 *
 * 登記清單：rail 面板（所有 workspace 共用一格，railPanel !== null 即開著；統計是 rail「分析」
 * workspace 的一個分頁，不再是右側浮層）、說明視窗 InfoModal。
 * dock 卡（航班卡／空域卡）是資訊不是面板，不在清單內。新的浮層必須加進 OVERLAY_KEYS。
 *
 * App 只觀察「剛由關變開」的那個，用本函式算出其他該關掉的，再呼叫既有的關閉 setter。
 * 純函式：不碰 DOM、不 import React（單元測試：scripts/design/tests/overlayMutex.test.mjs）。
 */
export const OVERLAY_KEYS = ["rail", "info"] as const;

export type OverlayKey = (typeof OVERLAY_KEYS)[number];
export type OverlayState = Record<OverlayKey, boolean>;

export const ALL_OVERLAYS_CLOSED: OverlayState = { rail: false, info: false };

/**
 * 回傳應關閉的浮層。沒有浮層剛打開 → []（只關不開時不做事，也不會互相觸發）。
 * 同一輪有多個同時打開時，依 OVERLAY_KEYS 順序保留第一個。
 */
export function overlaysToClose(prev: OverlayState, next: OverlayState): OverlayKey[] {
  const keep = OVERLAY_KEYS.find((key) => next[key] && !prev[key]);
  if (!keep) return [];
  return OVERLAY_KEYS.filter((key) => key !== keep && next[key]);
}

/** 進入 Capture 模式：全部關掉（回傳目前開著的）。 */
export function overlaysOpen(state: OverlayState): OverlayKey[] {
  return OVERLAY_KEYS.filter((key) => state[key]);
}
