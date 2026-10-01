import { useState, type ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { IconChevron } from "./icons";
import { EYEBROW_LETTER_SPACING, mix, themeVars } from "./vars";

export interface SectionProps {
  /** 眉標文字（大寫英文 + 中文，例：`FILTER · 篩選`） */
  title: ReactNode;
  children?: ReactNode;
  /** 標題列右側（細線之後）的附加內容，例如「重設」小按鈕 */
  right?: ReactNode;
  /** 數字徽章（>0 才顯示），例如已啟用篩選數 */
  badge?: number;
  /** 可收合；受控用 open + onToggle，非受控用 defaultOpen */
  collapsible?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  /** 標題與內容間距，預設 SPACE.s6 */
  gap?: number;
}

/** 區段：眉標 + 右延細線；可收合時前置 chevron（spec §5）。 */
export function Section({
  title,
  children,
  right,
  badge,
  collapsible = false,
  open,
  defaultOpen = true,
  onToggle,
  gap = SPACE.s6,
}: SectionProps) {
  const { tokens } = useTheme();
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const isOpen = !collapsible || (open ?? innerOpen);

  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setInnerOpen(next);
    onToggle?.(next);
  };

  const label = (
    <>
      {collapsible && <IconChevron size={9} direction={isOpen ? "down" : "right"} />}
      <span style={{ whiteSpace: "nowrap" }}>{title}</span>
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            fontSize: SIZE.s9,
            letterSpacing: 0,
            color: tokens.accent,
            background: tokens.accentSoft,
            border: `1px solid ${mix(tokens.accent, 60)}`,
            borderRadius: RADIUS.base,
            padding: `0 ${SPACE.s4}px`,
            lineHeight: 1.5,
          }}
        >
          {badge}
        </span>
      )}
    </>
  );

  const headStyle = {
    display: "flex",
    alignItems: "center",
    gap: SPACE.s8,
    fontFamily: FONT.data,
    fontSize: SIZE.s9,
    letterSpacing: EYEBROW_LETTER_SPACING,
    textTransform: "uppercase" as const,
    color: tokens.fg3,
    paddingTop: SPACE.s6,
  };

  return (
    <div style={{ ...themeVars(tokens), display: "flex", flexDirection: "column", gap: isOpen ? gap : 0 }}>
      <div style={headStyle}>
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={isOpen}
            className="fa-focus fa-hover-fg"
            style={{
              ...headStyle,
              paddingTop: 0,
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: "pointer",
              borderRadius: RADIUS.base,
            }}
          >
            {label}
          </button>
        ) : (
          label
        )}
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: tokens.border, minWidth: SPACE.s8 }} />
        {right}
      </div>
      {isOpen && children}
    </div>
  );
}
