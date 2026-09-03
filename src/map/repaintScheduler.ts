import type { Map as MapboxMap } from "mapbox-gl";

/**
 * 全域 repaint 節流器（Phase 1-2）。
 *
 * 背景：Mapbox custom layer 觸發的是「整張地圖重繪」（底圖／terrain／globe／所有
 * style layer／3 個 custom layer），不是只重繪自己那層。暫停時唯一真正需要動的只有
 * 光球呼吸／閃爍（airport glow orbs）、atlas bloom 星點閃爍、空域極光 shimmer 這類
 * wall-clock 裝飾動畫；播放中的時間推進、相機互動、控制項變更才是「真的需要看到
 * 立即結果」的活動。
 *
 * 設計（用戶已拍板）：
 * - 暫停且相機靜止 → 裝飾動畫以單一 setTimeout 排程，20fps（50ms 週期）觸發 repaint
 * - 連續 30 秒無互動 → 完全停止裝飾 repaint（畫面停在最後一次繪出的相位）
 * - 任何互動／播放／控制項變更 → notifyActivity 立即 triggerRepaint 並重置閒置計時
 * - document.hidden → 停；visibilitychange 恢復可見 → 立即 notifyActivity 恢復
 *
 * 只有單一共用 pending timer（不會因為多個 custom layer 同時呼叫
 * requestDecorativeRepaint 而疊加出多個 timer），呼叫方不需要自己管理節流狀態。
 *
 * ⚠️ 量測時的重要背景（2026-09 實測，見 docs/backlog/render-performance-status.md）：
 * 用 probe.mjs 量到的「raw rAF/秒」不會等於這裡 setTimeout 的頻率，原因是 Mapbox
 * GL JS 自己的機制疊了兩層額外延遲：
 * 1. `Map._render()` 收尾時，只要 sources/style/placement 都不 dirty，就會自己排一個
 *    「確認閒置」的 dummy rAF（`_triggerFrame(false)`，callback 什麼都不做只是把
 *    `_frame` 歸零，確認沒人在這一 tick 內又 triggerRepaint 才會真的 fire 'idle'）。
 *    實測：閒置狀態下單獨呼叫一次 `map.triggerRepaint()`，恰好產生 **2 個** rAF
 *    （1 個真的 render + 1 個這個 dummy 確認幀）；連續播放時因為每幀都真的有事
 *    （render 前就已經 `_renderNextFrame=true`）才不會多這一幀，這也是為什麼舊版
 *    連續 60fps 重繪時 rAF 精準等於 60。
 * 2. 這裡的 50ms timer 是在 `render()` 內部（也就是被 rAF 呼叫時）重新排下一個
 *    timer，所以每個週期還要多等一次 vsync（~16ms）才會真的觸發下一次 render，
 *    實際週期 ≈ 66ms（≈15 次/秒），不是精確的 50ms。
 * 兩者疊加：50ms timer 實測「decorative repaint 次數」≈15.5/秒、raw rAF ≈31/秒
 * （≈2×）。這是 Mapbox 自身行為，不是這個節流器的 bug；已用「閒置狀態下單次
 * triggerRepaint → 數 rAF」的隔離測試驗證過恰好是 2。50ms 是刻意維持「20fps 排
 * triggerRepaint」政策原文的字面實作，不因為 raw rAF 量測值換算回去反推調整。
 */

/** 裝飾動畫節流間隔（ms）＝ 20fps，對齊使用者拍板的政策數字 */
const DECORATIVE_INTERVAL_MS = 50;

/** 連續無活動幾毫秒後完全停止裝飾 repaint */
const IDLE_STOP_MS = 30_000;

/** 觸發 notifyActivity 的地圖互動事件；move 系列的 start 事件已足夠涵蓋拖曳/縮放/旋轉/傾斜 */
const ACTIVITY_EVENTS = ["movestart", "zoomstart", "rotatestart", "pitchstart", "dragstart"] as const;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// 模組級狀態：整個 app 共用一份節流狀態（不是每個 layer 各自一份），
// 這樣三個 custom layer 同時在裝飾動畫階段也只會排出一個 timer。
// 初值設為「剛啟動」，避免頁面剛載入、使用者還沒操作前就被誤判為已閒置 30 秒。
let lastActivityAt = now();
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function clearPendingTimer(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

/**
 * 通知「真的有事發生」：時間推進（播放中）、地圖互動、控制項變更、seek、
 * globe 過渡、靜態軌跡建構中……等會立即需要看到結果的路徑呼叫這個。
 * 會立刻 triggerRepaint 一次、取消任何 pending 的裝飾 timer、並重置閒置計時，
 * 讓 requestDecorativeRepaint 之後的 30 秒閒置倒數重新起算。
 */
export function notifyActivity(map?: MapboxMap | null): void {
  lastActivityAt = now();
  clearPendingTimer();
  map?.triggerRepaint();
}

/**
 * 給「只剩裝飾動畫」的路徑用（光球呼吸/閃爍、atlas 星點閃爍、空域 shimmer）。
 * document.hidden 或距上次活動超過 30 秒 → 什麼都不做（完全停止，畫面停在當下相位）。
 * 否則若目前沒有 pending timer，排一個 50ms（20fps）後的 triggerRepaint —— 單一
 * timer，重複呼叫不會疊加。
 */
export function requestDecorativeRepaint(map: MapboxMap): void {
  if (typeof document !== "undefined" && document.hidden) return;
  if (now() - lastActivityAt > IDLE_STOP_MS) return;
  if (pendingTimer !== null) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    map.triggerRepaint();
  }, DECORATIVE_INTERVAL_MS);
}

/**
 * 掛上地圖互動事件 + visibilitychange 監聽，統一導到 notifyActivity。
 * 只需要在一個 custom layer 的 onAdd 掛一次（建議 flight-3d，因為它跟 atlas glow /
 * airspace aurora 一定同時存在）；其他 layer 直接呼叫 notifyActivity /
 * requestDecorativeRepaint 就好，不用各自重複掛監聽。
 * 回傳 detach 函式，onRemove 要呼叫（style 切換會整批 remove+re-add custom layer）。
 */
export function attachRepaintScheduler(map: MapboxMap): () => void {
  const onActivity = () => notifyActivity(map);
  for (const evt of ACTIVITY_EVENTS) map.on(evt, onActivity);

  const onVisibilityChange = () => {
    if (document.hidden) {
      // 立即停：不留著等 pending timer 自己過期
      clearPendingTimer();
    } else {
      notifyActivity(map);
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return () => {
    for (const evt of ACTIVITY_EVENTS) map.off(evt, onActivity);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}
