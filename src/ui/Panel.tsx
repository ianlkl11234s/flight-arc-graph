import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { BLUR, FONT, LAYOUT, RADIUS, SIZE, SPACE, Z } from "../styles/tokens";
import { themeVars } from "./vars";

export interface PanelProps {
  children: ReactNode;
  /** true（預設）＝左浮動面板定位（left 64 / top 52）；false ＝ 一般流式排版（活元件頁、內嵌） */
  floating?: boolean;
  width?: number | string;
  /** 面板內容最大高度，超過時捲動（不含 header 時可直接傳） */
  maxHeight?: number | string;
  /** 對角琥珀刻度，預設開 */
  ticks?: boolean;
  ariaLabel?: string;
  style?: CSSProperties;
}

/** 浮動面板外殼：panel 底 + blur + 1px border + 圓角 2 + 左上／右下琥珀刻度（spec §3）。 */
export function Panel({
  children,
  floating = true,
  width = LAYOUT.panelWidth,
  maxHeight,
  ticks = true,
  ariaLabel,
  style,
}: PanelProps) {
  const { tokens } = useTheme();
  return (
    <section
      aria-label={ariaLabel}
      className={ticks ? "fa-panel" : undefined}
      style={{
        ...themeVars(tokens),
        position: floating ? "absolute" : "relative",
        ...(floating ? { left: LAYOUT.panelLeft, top: LAYOUT.panelTop, zIndex: Z.panel } : null),
        width,
        maxHeight,
        display: "flex",
        flexDirection: "column",
        background: tokens.panel,
        border: `1px solid ${tokens.border}`,
        borderRadius: RADIUS.base,
        backdropFilter: `blur(${BLUR}px) saturate(1.2)`,
        WebkitBackdropFilter: `blur(${BLUR}px) saturate(1.2)`,
        color: tokens.fg1,
        fontFamily: FONT.ui,
        fontSize: SIZE.s11,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

/** 面板內文區：padding 與區段間距（對應示意稿 .pb）。可捲動。 */
export function PanelBody({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        padding: `${SPACE.s4}px ${SPACE.s12}px ${SPACE.s12}px`,
        display: "flex",
        flexDirection: "column",
        gap: SPACE.s12,
        overflowY: "auto",
        minHeight: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
