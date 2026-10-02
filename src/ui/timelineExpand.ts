/**
 * 時間軸「膠囊 ↔ 展開」狀態機（spec R4；移植自 mini-taiwan-pulse timelineExpand.ts）。
 *
 * 展開的理由（hold）：滑鼠在上面、鍵盤 focus 在裡面、正在拖曳進度滑桿、月曆開著。
 * - 任一 hold 成立 → expanded。
 * - 全部解除 → closing，COLLAPSE_DELAY_MS 後（timeout）→ collapsed；期間任何 hold 回來就取消。
 * - 點膠囊（activate，觸控用）→ 展開；沒有 hold 時同樣走 closing 倒數。
 * 純函式：不讀時間、不碰 DOM、不 import React（單元測試：scripts/design/tests/timelineExpand.test.mjs）。
 */
export type ExpandPhase = "collapsed" | "expanded" | "closing";

export interface ExpandState {
  phase: ExpandPhase;
  hover: boolean;
  focusWithin: boolean;
  dragging: boolean;
  popupOpen: boolean;
}

export type ExpandEvent =
  | { type: "pointerEnter" }
  | { type: "pointerLeave" }
  | { type: "focusIn" }
  | { type: "focusOut" }
  | { type: "dragStart" }
  | { type: "dragEnd" }
  | { type: "popup"; open: boolean }
  | { type: "activate" }
  | { type: "timeout" };

/** 所有 hold 解除後多久收合 */
export const COLLAPSE_DELAY_MS = 2000;

export const INITIAL_EXPAND_STATE: ExpandState = {
  phase: "collapsed",
  hover: false,
  focusWithin: false,
  dragging: false,
  popupOpen: false,
};

export function isHeld(s: ExpandState): boolean {
  return s.hover || s.focusWithin || s.dragging || s.popupOpen;
}

function settle(next: ExpandState, prevPhase: ExpandPhase): ExpandState {
  if (isHeld(next)) return { ...next, phase: "expanded" };
  // 沒有 hold：收合中維持收合，展開中開始倒數
  return { ...next, phase: prevPhase === "collapsed" ? "collapsed" : "closing" };
}

export function expandReducer(state: ExpandState, event: ExpandEvent): ExpandState {
  switch (event.type) {
    case "pointerEnter":
      return settle({ ...state, hover: true }, state.phase);
    case "pointerLeave":
      return settle({ ...state, hover: false }, state.phase);
    case "focusIn":
      return settle({ ...state, focusWithin: true }, state.phase);
    case "focusOut":
      return settle({ ...state, focusWithin: false }, state.phase);
    case "dragStart":
      return settle({ ...state, dragging: true }, state.phase);
    case "dragEnd":
      return settle({ ...state, dragging: false }, state.phase);
    case "popup":
      return settle({ ...state, popupOpen: event.open }, state.phase);
    case "activate":
      return settle(state, "expanded");
    case "timeout":
      if (state.phase !== "closing" || isHeld(state)) return state;
      return { ...state, phase: "collapsed" };
  }
}

/** closing 倒數期間畫面仍是展開的 */
export function isExpanded(s: ExpandState): boolean {
  return s.phase !== "collapsed";
}

/** 取得 focus 的元素種類：原生 select（下拉開著時一定有 focus）或其他控制項 */
export type FocusKind = "select" | "other";

/**
 * 這個 focus 算不算 hold（R4：滑鼠點出來的 focus 不算）。
 * - select：一律算（原生下拉開著時游標可能離開時間軸範圍，不能因此收合）；
 *   元件在選定後主動 blur，避免滑鼠選完永遠不收。
 * - 其他（按鈕、range 滑桿…）：只有最後一次輸入是鍵盤時才算。
 */
export function focusHolds(kind: FocusKind, lastInputWasPointer: boolean): boolean {
  return kind === "select" || !lastInputWasPointer;
}
