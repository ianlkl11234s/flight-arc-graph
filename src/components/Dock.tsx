import type { ReactNode } from "react";
import { LAYOUT, SPACE, Z } from "../styles/tokens";

/**
 * 右下 dock（spec §4、R1、R5）：點擊資訊卡（DockCard）與圖例的停靠區，
 * 寬 LAYOUT.dockWidth，底邊與時間軸共用 LAYOUT.mapBottomInset。由下往上堆疊。
 */
export function Dock({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        right: SPACE.s16,
        bottom: LAYOUT.mapBottomInset,
        width: LAYOUT.dockWidth,
        zIndex: Z.panel,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap: SPACE.s8,
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}

/** dock 內單一可互動項目（容器本身不吃滑鼠，避免擋住地圖） */
export function DockItem({ children, align = "stretch" }: { children: ReactNode; align?: "stretch" | "end" }) {
  return <div style={{ pointerEvents: "auto", alignSelf: align === "end" ? "flex-end" : "stretch" }}>{children}</div>;
}
