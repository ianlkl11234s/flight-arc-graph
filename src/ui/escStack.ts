/**
 * Esc 分層（spec R7）：每次 Esc 只關最上面一層。
 *
 * 優先序：Capture（原本的退出邏輯，錄影／HQ 匯出中不退出）→ 說明視窗 → 時間軸月曆 →
 * dock 卡（航班卡／空域卡，同一層、同時只一張）與單航班模式（退回 Stack All）——兩者都開著時
 * 「最近開的先關」：先開卡再按「追蹤」→ 先退出追蹤、再關卡；追蹤中才點開空域卡 → 先關卡 →
 * 開著的 rail 面板 → 無。
 *
 * 實際攔截順序：說明視窗由 Modal 在 window capture 階段攔下並 stopImmediatePropagation；
 * 月曆由 Timeline 在 document 階段處理並 preventDefault；App 的單一 handler 掛在 window
 * bubble 階段，看到 defaultPrevented 就不動作——所以這裡的 info 只是保險。
 * 焦點在 input／textarea／select／contenteditable 時讓元件自己吃（Capture 例外，維持原行為）。
 *
 * 純函式：不碰 DOM（單元測試：scripts/design/tests/escStack.test.mjs）。
 */
export type EscLayer = "capture" | "info" | "dock" | "single" | "panel";

export interface EscState {
  /** 事件已被上層（Modal／月曆）處理 */
  defaultPrevented: boolean;
  /** 焦點在可編輯元件 */
  editableTarget: boolean;
  captureMode: boolean;
  /** 錄影或 HQ 匯出中（Capture 不退出） */
  exporting: boolean;
  infoOpen: boolean;
  /** dock 卡（航班卡或空域卡）開著 */
  dockCardOpen: boolean;
  singleFlight: boolean;
  /** dock 卡與單航班模式都開著時，dock 卡是否比單航班模式晚開（晚開的先關） */
  dockNewerThanSingle: boolean;
  /** rail 面板開著 */
  panelOpen: boolean;
}

export function escLayerToClose(s: EscState): EscLayer | null {
  if (s.captureMode) return s.exporting ? null : "capture";
  if (s.defaultPrevented || s.editableTarget) return null;
  if (s.infoOpen) return "info";
  if (s.dockCardOpen && s.singleFlight) return s.dockNewerThanSingle ? "dock" : "single";
  if (s.dockCardOpen) return "dock";
  if (s.singleFlight) return "single";
  if (s.panelOpen) return "panel";
  return null;
}

/** 不吃 Esc 的 input type（滑桿、勾選框等點過之後留下 focus，不該擋住 Esc） */
const NON_TEXT_INPUT = new Set(["range", "checkbox", "radio", "button", "submit", "reset", "color", "file", "image"]);

/** 事件目標是否為可編輯元件（文字類 input／textarea／select／contenteditable） */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as { tagName?: unknown }).tagName !== "string") return false;
  const el = target as unknown as { tagName: string; type?: string; isContentEditable?: boolean };
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT") return !NON_TEXT_INPUT.has((el.type ?? "text").toLowerCase());
  return tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}
