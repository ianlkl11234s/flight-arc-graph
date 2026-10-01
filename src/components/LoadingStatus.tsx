import { useEffect, useRef, useState } from "react";
import { SPACE, Z } from "../styles/tokens";
import { StatusBar, type StatusState } from "../ui";
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
}

/**
 * 右上工具列下方的載入狀態條（spec R6）。節奏在 ui/loadingStatusController，外觀是 ui/StatusBar。
 * 取代舊的畫面中央 LoadingIndicator 膠囊。手機版不掛。
 */
export function LoadingStatus({ loading, label, count, loaded, playing }: LoadingStatusProps) {
  const [view, setView] = useState<LoadingStatusView>(HIDDEN_LOADING_STATUS);
  const controllerRef = useRef<ReturnType<typeof createLoadingStatusController> | null>(null);
  const prevLoadingRef = useRef(loading);
  const latest = useRef({ label, count, playing });
  latest.current = { label, count, playing };

  useEffect(() => {
    const controller = createLoadingStatusController({ onChange: setView });
    controllerRef.current = controller;
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
    controller.setPlaying(latest.current.playing);
    if (loading) controller.handle({ type: "start", label: latest.current.label });
    else controller.handle({ type: "done", count: latest.current.count });
  }, [loading]);

  if (!view.visible && view.label === "" && view.count === 0) return null;

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
        top: BELOW_TOOLBAR,
        right: SPACE.s16,
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
      />
    </div>
  );
}
