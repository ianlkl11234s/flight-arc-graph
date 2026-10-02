/**
 * 右上載入狀態條的節奏（spec R6；仿 mini-taiwan-pulse loadingStatusController）。
 *
 *  - 150ms 內就結束的載入不顯示（避免閃爍）
 *  - 一出現，「載入中」至少停 600ms
 *  - 結束後再等 300ms 合併同一批（期間又開始載入 → 繼續顯示載入中）
 *  - 「已載入 N 班」停 2 秒後淡出
 *  - 播放中不跳「已載入」：以「結束那一刻」是否播放為準，播放中就直接淡出
 *    （本 app 載完會自動播放，若像 Pulse 等停下才顯示，「載入中」會卡在畫面上）
 *  - 失敗立刻顯示、停 4 秒淡出；persist 時一直停著，直到下一次 start 或 clear（重試按鈕要點得到）
 *
 * 純邏輯、不碰 DOM、不 import React；計時器可注入（單元測試：scripts/design/tests/loadingStatus.test.mjs）。
 */

export const LOADING_STATUS_TIMING = {
  showDelayMs: 150,
  minLoadingMs: 600,
  settleMs: 300,
  doneHoldMs: 2000,
  errorHoldMs: 4000,
  fadeMs: 500,
} as const;

export type LoadingStatusPhase = "loading" | "done" | "error";

export interface LoadingStatusView {
  /** false 時淡出；內容保留到淡出結束 */
  visible: boolean;
  phase: LoadingStatusPhase;
  /** loading／error：載入對象（例：RCTP · 2026-02-18） */
  label: string;
  /** done：載入的班數 */
  count: number;
}

export const HIDDEN_LOADING_STATUS: LoadingStatusView = { visible: false, phase: "loading", label: "", count: 0 };

export type LoadingStatusEvent =
  | { type: "start"; label: string }
  | { type: "done"; count: number }
  | { type: "fail"; label: string; persist?: boolean }
  | { type: "clear" };

type State = "hidden" | "pending" | "loading" | "settling" | "done" | "error" | "fading";

interface Options {
  onChange: (view: LoadingStatusView) => void;
  now?: () => number;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  timing?: typeof LOADING_STATUS_TIMING;
}

export function createLoadingStatusController({
  onChange,
  now = () => performance.now(),
  setTimer = (cb, ms) => setTimeout(cb, ms),
  clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  timing = LOADING_STATUS_TIMING,
}: Options) {
  let state: State = "hidden";
  let playing = false;
  let shownAt = 0;
  let label = "";
  let view: LoadingStatusView = HIDDEN_LOADING_STATUS;
  const timers = new Set<unknown>();

  function later(cb: () => void, ms: number) {
    const handle = setTimer(() => {
      timers.delete(handle);
      cb();
    }, ms);
    timers.add(handle);
  }
  function clearAll() {
    for (const t of timers) clearTimer(t);
    timers.clear();
  }
  function publish(next: LoadingStatusView) {
    view = next;
    onChange(view);
  }
  function fadeOut(afterMs: number) {
    later(() => {
      state = "fading";
      publish({ ...view, visible: false });
      later(() => {
        state = "hidden";
      }, timing.fadeMs);
    }, afterMs);
  }
  function showLoading() {
    if (state !== "loading" && state !== "settling") shownAt = now();
    state = "loading";
    publish({ visible: true, phase: "loading", label, count: 0 });
  }

  function handle(event: LoadingStatusEvent) {
    switch (event.type) {
      case "start": {
        label = event.label;
        clearAll();
        if (state === "loading" || state === "settling") {
          showLoading(); // 合併：同一批繼續顯示，只更新名稱
          return;
        }
        if (state === "done" || state === "error" || state === "fading") {
          // 已在畫面上（或淡出中）→ 直接切回載入中，不再等 150ms
          shownAt = now();
          state = "loading";
          publish({ visible: true, phase: "loading", label, count: 0 });
          return;
        }
        state = "pending";
        later(() => {
          if (state === "pending") showLoading();
        }, timing.showDelayMs);
        return;
      }
      case "done": {
        if (state === "pending") {
          clearAll();
          state = "hidden";
          return;
        }
        if (state !== "loading") return;
        clearAll();
        state = "settling";
        const playingAtDone = playing;
        const count = event.count;
        const wait = Math.max(timing.settleMs, shownAt + timing.minLoadingMs - now());
        later(() => {
          if (state !== "settling") return;
          if (playingAtDone) {
            state = "fading";
            publish({ ...view, visible: false });
            later(() => {
              state = "hidden";
            }, timing.fadeMs);
            return;
          }
          state = "done";
          publish({ visible: true, phase: "done", label, count });
          fadeOut(timing.doneHoldMs);
        }, wait);
        return;
      }
      case "fail": {
        clearAll();
        label = event.label;
        state = "error";
        publish({ visible: true, phase: "error", label, count: 0 });
        if (!event.persist) fadeOut(timing.errorHoldMs);
        return;
      }
      case "clear": {
        if (state === "hidden" || state === "fading") return;
        clearAll();
        if (state === "pending") {
          state = "hidden";
          return;
        }
        state = "fading";
        publish({ ...view, visible: false });
        later(() => {
          state = "hidden";
        }, timing.fadeMs);
        return;
      }
    }
  }

  return {
    handle,
    setPlaying(next: boolean) {
      playing = next;
    },
    dispose() {
      clearAll();
    },
    get view() {
      return view;
    },
  };
}
