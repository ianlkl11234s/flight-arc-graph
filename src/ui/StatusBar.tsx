import type { ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { BLUR, FONT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { mix, themeVars } from "./vars";

/** hidden 不渲染；empty ＝「這天沒資料」，和 error（載入失敗）必須分開（spec R6） */
export type StatusState = "hidden" | "loading" | "done" | "empty" | "error";

export interface StatusBarProps {
  state: StatusState;
  /** 主訊息，例：「載入 RCTP · 2026-02-18」「已載入 1,284 班」「載入失敗：網路逾時」 */
  message: ReactNode;
  /** 右側次要資訊（mono），例：`3 / 7 檔` */
  detail?: ReactNode;
  /** 0–1；loading 時有值顯示進度條，無值不顯示 */
  progress?: number;
  /** 右端動作（例如「重試」ghost Button） */
  action?: ReactNode;
  width?: number | string;
}

/**
 * 右上工具列下方的單行載入狀態條（只負責外觀；150ms / 600ms / 2s / 4s 節奏由 P4 的 hook 決定）。
 */
export function StatusBar({ state, message, detail, progress, action, width }: StatusBarProps) {
  const { tokens } = useTheme();
  if (state === "hidden") return null;

  const dotColor =
    state === "error" ? tokens.danger : state === "loading" ? tokens.accent : state === "done" ? tokens.fg2 : tokens.fg3;
  const textColor = state === "error" ? tokens.danger : state === "empty" ? tokens.fg2 : tokens.fg1;

  return (
    <div
      role={state === "error" ? "alert" : "status"}
      aria-live={state === "error" ? "assertive" : "polite"}
      style={{
        ...themeVars(tokens),
        position: "relative",
        width,
        boxSizing: "border-box",
        minHeight: 28,
        display: "flex",
        alignItems: "center",
        gap: SPACE.s8,
        padding: `0 ${SPACE.s8 + SPACE.s2}px`,
        background: tokens.panel,
        border: `1px solid ${state === "error" ? mix(tokens.danger, 45) : tokens.border}`,
        borderRadius: RADIUS.base,
        backdropFilter: `blur(${BLUR}px)`,
        WebkitBackdropFilter: `blur(${BLUR}px)`,
        fontFamily: FONT.ui,
        fontSize: SIZE.s11,
        color: textColor,
        overflow: "hidden",
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, background: dotColor, flex: "none" }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{message}</span>
      {detail && (
        <span style={{ fontFamily: FONT.data, fontSize: SIZE.s10, color: tokens.fg3, fontVariantNumeric: "tabular-nums", flex: "none" }}>
          {detail}
        </span>
      )}
      {action}
      {state === "loading" && progress !== undefined && (
        <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, background: mix(tokens.fg1, 15) }}>
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
              background: tokens.accent,
              transition: "width .2s",
            }}
          />
        </span>
      )}
    </div>
  );
}
