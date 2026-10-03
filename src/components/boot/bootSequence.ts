/**
 * 開場時序狀態機（純函式，scripts/design/tests/bootSequence.test.mjs）。規格：docs/design-system/spec.md「開場（Boot）」。
 *
 *   loading ──(地圖 ready 且第一批航班載完或失敗，且已顯示 ≥ minShowMs)──▶ done
 *   done ──(停 doneHoldMs，顯示「完成」)──▶ leaving
 *   leaving ──(遮罩淡出 fadeMs，內容放大 1.04)──▶ entering   ← 這時才設 <html data-boot="enter">
 *   entering ──(面板彈入 enterMs × enterScale)──▶ gone        ← 移除 data-boot
 *
 * - loading 超過 timeoutMs 還沒就緒 → 直接 leaving（不停「完成」）
 * - 減少動態（reducedMotion）：就緒或逾時 → 直接 gone（不等最少顯示時間、不淡出、不彈入）
 */

export type BootPhase = "loading" | "done" | "leaving" | "entering" | "gone";

export const BOOT_TIMING = {
  doneHoldMs: 400,
  fadeMs: 450,
  /** 彈入 0.85s ＋ 最後一個 rail 圖示延遲 0.70s ＋ 圖示放大 0.4s 的上限，再留一點餘裕 */
  enterMs: 1600,
  timeoutMs: 30000,
} as const;

export interface BootSignals {
  mapReady: boolean;
  /** 第一批航班載入完成或失敗（任一即可） */
  dataSettled: boolean;
}

export interface BootConfig {
  minShowMs: number;
  enterScale: number;
  reducedMotion: boolean;
}

export interface BootState {
  phase: BootPhase;
  /** 開場開始時刻（ms） */
  startedAt: number;
  /** 進入目前 phase 的時刻（ms） */
  phaseAt: number;
  /** 是否因逾時結束（狀態 chip 不說「完成」） */
  timedOut: boolean;
}

export function initBoot(now: number): BootState {
  return { phase: "loading", startedAt: now, phaseAt: now, timedOut: false };
}

export interface BootStep {
  state: BootState;
  /** 多久後要再呼叫一次 stepBoot（null ＝ 等外部訊號或已結束） */
  wakeInMs: number | null;
}

/** 推進狀態機到 now 這一刻（可一次跨多個 phase）。state 沒變時回傳同一個物件。 */
export function stepBoot(state: BootState, signals: BootSignals, now: number, cfg: BootConfig): BootStep {
  let s = state;
  const to = (phase: BootPhase, at: number, patch: Partial<BootState> = {}): void => {
    s = { ...s, ...patch, phase, phaseAt: at };
  };
  const enterMs = BOOT_TIMING.enterMs * Math.max(0, cfg.enterScale);

  for (let guard = 0; guard < 8; guard++) {
    const before = s;
    switch (s.phase) {
      case "loading": {
        const ready = signals.mapReady && signals.dataSettled;
        const timeoutAt = s.startedAt + BOOT_TIMING.timeoutMs;
        if (cfg.reducedMotion) {
          if (ready) to("gone", now);
          else if (now >= timeoutAt) to("gone", timeoutAt, { timedOut: true });
          break;
        }
        const minAt = s.startedAt + cfg.minShowMs;
        if (ready && now >= minAt) to("done", now);
        else if (now >= timeoutAt) to("leaving", timeoutAt, { timedOut: true });
        break;
      }
      case "done":
        if (now >= s.phaseAt + BOOT_TIMING.doneHoldMs) to("leaving", s.phaseAt + BOOT_TIMING.doneHoldMs);
        break;
      case "leaving":
        if (now >= s.phaseAt + BOOT_TIMING.fadeMs) to("entering", s.phaseAt + BOOT_TIMING.fadeMs);
        break;
      case "entering":
        if (now >= s.phaseAt + enterMs) to("gone", s.phaseAt + enterMs);
        break;
      case "gone":
        break;
    }
    if (s === before) break;
  }

  return { state: s === state ? state : s, wakeInMs: nextWake(s, signals, now, cfg, enterMs) };
}

function nextWake(s: BootState, signals: BootSignals, now: number, cfg: BootConfig, enterMs: number): number | null {
  const left = (at: number) => Math.max(0, at - now);
  switch (s.phase) {
    case "loading": {
      const timeoutLeft = left(s.startedAt + BOOT_TIMING.timeoutMs);
      if (!cfg.reducedMotion && signals.mapReady && signals.dataSettled) {
        return Math.min(timeoutLeft, left(s.startedAt + cfg.minShowMs));
      }
      return timeoutLeft;
    }
    case "done":
      return left(s.phaseAt + BOOT_TIMING.doneHoldMs);
    case "leaving":
      return left(s.phaseAt + BOOT_TIMING.fadeMs);
    case "entering":
      return left(s.phaseAt + enterMs);
    case "gone":
      return null;
  }
}

/** <html data-boot> 的值：遮罩期間 wait（面板藏在邊界外），淡出後 enter（彈入），結束移除 */
export function bootAttrFor(phase: BootPhase): "wait" | "enter" | null {
  if (phase === "entering") return "enter";
  if (phase === "gone") return null;
  return "wait";
}

/** 遮罩是否還在畫面上（期間載入狀態條不顯示，結束後才接手） */
export function bootMaskVisible(phase: BootPhase): boolean {
  return phase === "loading" || phase === "done" || phase === "leaving";
}

/** 開站元件進場狀態掛在 <html data-boot>，各元件只需標 data-boot-part，不必接 props。 */
export function setBootAttr(value: "wait" | "enter" | null): void {
  if (typeof document === "undefined") return;
  if (value) document.documentElement.dataset.boot = value;
  else delete document.documentElement.dataset.boot;
}

/** 進場時長倍率寫到 <html> 的 --boot-k，boot.css 的 transition 時間都乘上它 */
export function setBootScale(k: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--boot-k", String(k));
}
