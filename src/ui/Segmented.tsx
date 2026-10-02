import type { ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { themeVars } from "./vars";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}

export interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** 與既有 ToggleButtons 相容 */
  disabledValues?: Set<T>;
  /** 撐滿容器、各段等寬（ToggleButtons 的版型） */
  fullWidth?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
}

/** 分段控制（選項 ≤3）：選中 = accent 字 + accentSoft 底（spec §5）。 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabledValues,
  fullWidth,
  ariaLabel,
  disabled,
}: SegmentedProps<T>) {
  const { tokens } = useTheme();
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        ...themeVars(tokens),
        display: fullWidth ? "flex" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
        alignSelf: fullWidth ? undefined : "flex-start",
        border: `1px solid ${tokens.border}`,
        borderRadius: RADIUS.base,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {options.map((opt, i) => {
        const on = opt.value === value;
        const off = disabled || opt.disabled || disabledValues?.has(opt.value);
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={on}
            aria-label={opt.ariaLabel}
            title={opt.title}
            disabled={off}
            onClick={() => onChange(opt.value)}
            className="fa-focus"
            style={{
              flex: fullWidth ? 1 : "none",
              minWidth: 0,
              padding: `${SPACE.s4}px ${SPACE.s8 + SPACE.s2}px`,
              fontFamily: FONT.ui,
              fontSize: SIZE.body,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
              border: 0,
              borderLeft: i > 0 ? `1px solid ${tokens.border}` : 0,
              background: on ? tokens.accentSoft : "transparent",
              color: off ? tokens.fg3 : on ? tokens.accent : tokens.fg2,
              opacity: off ? 0.6 : 1,
              cursor: off ? "not-allowed" : "pointer",
              transition: "background .15s, color .15s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
