import type { CSSProperties } from "react";
import { useTheme } from "../styles/ThemeContext";
import { Z } from "../styles/tokens";
import { mix } from "./vars";

export interface SelectionRingProps {
  /** 圓心（相對於定位容器的 px） */
  x: number;
  y: number;
  /** 直徑，預設 28 */
  size?: number;
  /** false ＝ 流式排版（活元件頁） */
  floating?: boolean;
  style?: CSSProperties;
}

/**
 * 點擊處的選取圈（spec R1）：琥珀 1.5px 圈 + 淡琥珀外暈，不吃滑鼠。
 * 固定在點擊位置（不追蹤目標移動）；呼叫端在相機移動或卡片關閉時移除。
 */
export function SelectionRing({ x, y, size = 28, floating = true, style }: SelectionRingProps) {
  const { tokens } = useTheme();
  return (
    <span
      aria-hidden="true"
      style={{
        position: floating ? "absolute" : "relative",
        ...(floating ? { left: x - size / 2, top: y - size / 2, zIndex: Z.mapOverlay } : null),
        display: "block",
        width: size,
        height: size,
        boxSizing: "border-box",
        borderRadius: "50%",
        border: `1.5px solid ${tokens.accent}`,
        boxShadow: `0 0 0 4px ${mix(tokens.accent, 18)}`,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}
