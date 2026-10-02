import type { ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { IconClose } from "./icons";
import { mix, themeVars } from "./vars";

export interface ChipProps {
  label: ReactNode;
  selected?: boolean;
  /** 有傳時 chip 本身是按鈕（輸出 aria-pressed） */
  onClick?: () => void;
  /** 有傳時尾端加 SVG 移除鈕（取代 SetChip 的「×」） */
  onRemove?: () => void;
  removeLabel?: string;
  title?: string;
  disabled?: boolean;
  /** 機場碼等用 mono；預設 true */
  mono?: boolean;
}

/** 篩選／最近瀏覽 chip：選中 = accent 邊框（spec §5）。 */
export function Chip({ label, selected = false, onClick, onRemove, removeLabel = "移除", title, disabled, mono = true }: ChipProps) {
  const { tokens } = useTheme();
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: SPACE.s4,
    fontFamily: mono ? FONT.data : FONT.ui,
    fontSize: SIZE.s10,
    lineHeight: 1.4,
    padding: onRemove ? `${SPACE.s2}px ${SPACE.s2}px ${SPACE.s2}px ${SPACE.s8}px` : `${SPACE.s2}px ${SPACE.s8}px`,
    borderRadius: RADIUS.base,
    border: `1px solid ${selected ? mix(tokens.accent, 60) : tokens.border}`,
    background: selected ? tokens.accentSoft : tokens.ctl,
    color: disabled ? tokens.fg3 : selected ? tokens.fg1 : tokens.fg2,
    opacity: disabled ? 0.6 : 1,
    whiteSpace: "nowrap" as const,
    boxSizing: "border-box" as const,
  };

  const remove = onRemove && (
    <button
      type="button"
      aria-label={typeof label === "string" ? `${removeLabel} ${label}` : removeLabel}
      title={removeLabel}
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      className="fa-focus fa-hover-fg"
      style={{
        width: 16,
        height: 16,
        padding: 0,
        border: 0,
        background: "transparent",
        color: tokens.fg3,
        display: "grid",
        placeItems: "center",
        borderRadius: RADIUS.base,
        cursor: "pointer",
      }}
    >
      <IconClose size={9} />
    </button>
  );

  if (onClick) {
    // 有移除鈕時不能巢狀 button → 外層用 span + 內層兩顆 button
    if (remove) {
      return (
        <span style={{ ...themeVars(tokens), ...base, padding: `0 ${SPACE.s2}px 0 0` }} title={title}>
          <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={onClick}
            className="fa-focus"
            style={{
              font: "inherit",
              color: "inherit",
              background: "transparent",
              border: 0,
              padding: `${SPACE.s2}px ${SPACE.s2}px ${SPACE.s2}px ${SPACE.s8}px`,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {label}
          </button>
          {remove}
        </span>
      );
    }
    return (
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        title={title}
        className="fa-focus fa-hover-fg"
        style={{ ...themeVars(tokens), ...base, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        {label}
      </button>
    );
  }

  return (
    <span style={{ ...themeVars(tokens), ...base }} title={title}>
      {label}
      {remove}
    </span>
  );
}

export interface ChipGroupProps<T extends string | number> {
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  /** 多選集合（取代 DeepAnalysis 的 ChipGroup） */
  selected: ReadonlySet<T>;
  onToggle: (v: T) => void;
  ariaLabel?: string;
  mono?: boolean;
}

/** 多選 chip 群組。 */
export function ChipGroup<T extends string | number>({ options, selected, onToggle, ariaLabel, mono }: ChipGroupProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: "flex", flexWrap: "wrap", gap: SPACE.s6 }}>
      {options.map((o) => (
        <Chip
          key={String(o.value)}
          label={o.label}
          title={o.title}
          disabled={o.disabled}
          mono={mono}
          selected={selected.has(o.value)}
          onClick={() => onToggle(o.value)}
        />
      ))}
    </div>
  );
}
