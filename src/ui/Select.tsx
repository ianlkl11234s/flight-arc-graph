import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { IconChevron } from "./icons";
import { themeVars } from "./vars";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string | number> {
  options: SelectOption<T>[];
  /** null ＝ 未選（顯示 placeholder） */
  value: T | null;
  onChange: (v: T) => void;
  /** 有傳時加一個空值選項（value=""），例如「— 選擇航班 —」 */
  placeholder?: string;
  /** 左側行內標籤（與控件同一行） */
  label?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  title?: string;
  width?: number | string;
  fullWidth?: boolean;
  style?: CSSProperties;
}

/** 下拉（選項 >3）：原生 select 套樣式 + SVG chevron；數字值也可（spec §5）。 */
export function Select<T extends string | number>({
  options,
  value,
  onChange,
  placeholder,
  label,
  ariaLabel,
  disabled,
  title,
  width,
  fullWidth,
  style,
}: SelectProps<T>) {
  const { tokens, isDark } = useTheme();
  const control = (
    <span
      style={{
        position: "relative",
        display: fullWidth || label ? "flex" : "inline-flex",
        flex: label && width === undefined ? 1 : undefined,
        width: fullWidth ? "100%" : width,
        minWidth: 0,
      }}
    >
      <select
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        title={title}
        disabled={disabled}
        value={value === null ? "" : String(value)}
        onChange={(e) => {
          const hit = options.find((o) => String(o.value) === e.target.value);
          if (hit) onChange(hit.value);
        }}
        className="fa-focus"
        style={{
          ...themeVars(tokens),
          appearance: "none",
          WebkitAppearance: "none",
          width: "100%",
          height: 28,
          padding: `0 ${SPACE.s24}px 0 ${SPACE.s8 + SPACE.s2}px`,
          fontFamily: FONT.ui,
          fontSize: SIZE.body,
          color: tokens.fg1,
          background: tokens.ctl,
          border: `1px solid ${tokens.border}`,
          borderRadius: RADIUS.base,
          colorScheme: isDark ? "dark" : "light",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
          textOverflow: "ellipsis",
          ...style,
        }}
      >
        {placeholder !== undefined && (
          <option value="" disabled={value !== null}>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          right: SPACE.s8,
          top: "50%",
          transform: "translateY(-50%)",
          color: tokens.fg3,
          pointerEvents: "none",
          display: "flex",
        }}
      >
        <IconChevron size={9} />
      </span>
    </span>
  );

  if (!label) return control;
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: SPACE.s8,
        fontFamily: FONT.ui,
        fontSize: SIZE.body,
        color: tokens.fg1,
      }}
    >
      <span style={{ flex: "none" }}>{label}</span>
      {control}
    </label>
  );
}
