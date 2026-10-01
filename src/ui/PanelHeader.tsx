import type { ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { IconClose } from "./icons";
import { EYEBROW_LETTER_SPACING, themeVars } from "./vars";

export interface PanelHeaderProps {
  /** 眉標，例：`SELECTION · 機場` */
  eyebrow?: string;
  title: ReactNode;
  /** 有傳才顯示 24×24 關閉鈕 */
  onClose?: () => void;
  closeLabel?: string;
  /** 標題右側、關閉鈕左側的附加內容（例如計數、次要按鈕） */
  actions?: ReactNode;
}

/** 面板標題列：眉標 + 14px 標題 + 24×24 SVG 關閉鈕，下緣 1px 分隔線（spec §5）。 */
export function PanelHeader({ eyebrow, title, onClose, closeLabel = "關閉面板", actions }: PanelHeaderProps) {
  const { tokens } = useTheme();
  return (
    <header
      style={{
        ...themeVars(tokens),
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: SPACE.s8,
        padding: `${SPACE.s8 + SPACE.s2}px ${SPACE.s12}px`,
        borderBottom: `1px solid ${tokens.border}`,
        flex: "none",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <div
          style={{
            fontFamily: FONT.ui,
            fontSize: SIZE.s14,
            fontWeight: 500,
            color: tokens.fg1,
            marginTop: eyebrow ? 3 : 0,
            lineHeight: 1.25,
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.s4, flex: "none" }}>
        {actions}
        {onClose && <CloseButton onClick={onClose} label={closeLabel} />}
      </div>
    </header>
  );
}

/** 9px 大寫 mono 眉標（spec §3）。 */
export function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
  const { tokens } = useTheme();
  return (
    <div
      style={{
        fontFamily: FONT.data,
        fontSize: SIZE.s9,
        letterSpacing: EYEBROW_LETTER_SPACING,
        textTransform: "uppercase",
        color: color ?? tokens.fg3,
        lineHeight: 1.3,
      }}
    >
      {children}
    </div>
  );
}

/** 24×24 關閉鈕（PanelHeader / DockCard / Modal 共用）。 */
export function CloseButton({ onClick, label = "關閉" }: { onClick: () => void; label?: string }) {
  const { tokens } = useTheme();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="fa-focus fa-hover-fg"
      style={{
        ...themeVars(tokens),
        width: 24,
        height: 24,
        display: "grid",
        placeItems: "center",
        padding: 0,
        border: 0,
        background: "transparent",
        color: tokens.fg3,
        borderRadius: RADIUS.base,
        cursor: "pointer",
        flex: "none",
      }}
    >
      <IconClose />
    </button>
  );
}
