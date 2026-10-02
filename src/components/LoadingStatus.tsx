import { useEffect, useRef, useState } from "react";
import { SPACE, Z } from "../styles/tokens";
import { Button, StatusBar, type StatusState } from "../ui";
import {
  createLoadingStatusController,
  HIDDEN_LOADING_STATUS,
  LOADING_STATUS_TIMING,
  type LoadingStatusView,
} from "../ui/loadingStatusController";
import { BELOW_TOOLBAR } from "./Toolbar";

interface LoadingStatusProps {
  /** useFlightData 的 loading（LOD 背景換層不會切它） */
  loading: boolean;
  /** 載入對象，例：「RCTP · 2026-02-18」 */
  label: string;
  /** 載入完成時的班數 */
  count: number;
  /** 載入中目前已讀到的班數（右側 mono 次要資訊） */
  loaded?: number;
  /** 時間軸播放中：完成時不跳「已載入」 */
  playing: boolean;
  /** 這次載入失敗（網路／伺服器錯誤）：狀態條停著顯示失敗，直到重試或下一次載入 */
  failed: boolean;
  onRetry: () => void;
  /** 位置（預設：桌機右上工具列下方） */
  top?: number;
  right?: number;
  /** 只在失敗時顯示（錄影 Capture 畫面：精簡失敗提示，載入中／已載入不出現） */
  failOnly?: boolean;
  /** 暫時不畫（例：錄影中 REC）；節奏控制器照常運作，解除後仍能看到持續中的失敗 */
  hidden?: boolean;
}

/**
 * 右上工具列下方的載入狀態條（spec R6）。節奏在 ui/loadingStatusController，外觀是 ui/StatusBar。
 * 取代舊的畫面中央 LoadingIndicator 膠囊。App 只掛一個實例（桌機／手機／錄影共用，切模式不漏掉進行中的失敗），
 * 以 top/right/failOnly/hidden 依模式調整。
 */
export function LoadingStatus({
  loading,
  label,
  count,
  loaded,
  playing,
  failed,
  onRetry,
  top = BELOW_TOOLBAR,
  right = SPACE.s16,
  failOnly = false,
  hidden = false,
}: LoadingStatusProps) {
  const [view, setView] = useState<LoadingStatusView>(HIDDEN_LOADING_STATUS);
  const controllerRef = useRef<ReturnType<typeof createLoadingStatusController> | null>(null);
  const prevLoadingRef = useRef(loading);
  const latest = useRef({ label, count, playing, failed });
  latest.current = { label, count, playing, failed };
  // 上一次 commit 時的播放狀態。切機場那一輪 App 的自動播放 effect 會立刻 play()，
  // 所以「切換當下是否在播放」要看切換前那一刻，否則暫停中切換也會被當成播放中。
  const committedPlayingRef = useRef(playing);
  const playingAtStartRef = useRef(false);

  useEffect(() => {
    const controller = createLoadingStatusController({ onChange: setView });
    controllerRef.current = controller;
    // 首次進站：掛載時已在載入（沒有 false→true 的變化）→ 補送開始事件，地圖先出現、狀態條顯示載入中（R6）
    if (prevLoadingRef.current) {
      playingAtStartRef.current = committedPlayingRef.current;
      controller.setPlaying(false);
      controller.handle({ type: "start", label: latest.current.label });
    }
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const prev = prevLoadingRef.current;
    prevLoadingRef.current = loading;
    const controller = controllerRef.current;
    if (!controller || prev === loading) return;
    if (loading) playingAtStartRef.current = committedPlayingRef.current;
    // 播放中不跳「已載入」：切換當下在播放、完成時也還在播放
    controller.setPlaying(playingAtStartRef.current && latest.current.playing);
    if (loading) controller.handle({ type: "start", label: latest.current.label });
    else if (latest.current.failed) controller.handle({ type: "fail", label: latest.current.label, persist: true });
    else controller.handle({ type: "done", count: latest.current.count });
  }, [loading]);

  // 放在 [loading] effect 之後：該 effect 讀到的是上一輪 commit 的值
  useEffect(() => {
    committedPlayingRef.current = playing;
  });

  // 錯誤被清掉但沒有新的載入（理論上不會發生）→ 收起失敗訊息
  useEffect(() => {
    if (!failed && controllerRef.current?.view.phase === "error" && controllerRef.current.view.visible) {
      controllerRef.current.handle({ type: "clear" });
    }
  }, [failed]);

  if (!view.visible && view.label === "" && view.count === 0) return null;
  if (hidden) return null;
  if (failOnly && view.phase !== "error") return null;

  let state: StatusState;
  let message: string;
  if (view.phase === "error") {
    state = "error";
    message = `載入失敗：${view.label}`;
  } else if (view.phase === "done") {
    state = view.count > 0 ? "done" : "empty";
    message = view.count > 0 ? `已載入 ${view.count.toLocaleString()} 班` : "已載入 · 此範圍無航班資料";
  } else {
    state = "loading";
    message = `載入 ${view.label}`;
  }

  return (
    <div
      aria-hidden={!view.visible}
      style={{
        position: "absolute",
        top,
        right,
        zIndex: Z.toast,
        maxWidth: 360,
        opacity: view.visible ? 1 : 0,
        transition: `opacity ${LOADING_STATUS_TIMING.fadeMs}ms ease`,
        pointerEvents: view.visible ? "auto" : "none",
      }}
    >
      <StatusBar
        state={state}
        message={message}
        detail={state === "loading" && loaded ? `${loaded.toLocaleString()} 班` : undefined}
        action={state === "error" ? <Button variant="ghost" onClick={onRetry}>重試</Button> : undefined}
      />
    </div>
  );
}
