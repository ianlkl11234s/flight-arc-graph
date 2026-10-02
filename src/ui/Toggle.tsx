import type { ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { mix, themeVars } from "./vars";

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** 有 label 時渲染成整列（標籤左、開關右）；沒有時只渲染開關，須給 ariaLabel */
  label?: ReactNode;
  /** 標籤下方的次要說明 */
  description?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  title?: string;
}

/** 28×16 方角開關：開 = accent 底（spec §5）。 */
export function Toggle({ checked, onChange, label, description, ariaLabel, disabled, title }: ToggleProps) {
  const { tokens } = useTheme();
  const sw = (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="fa-focus"
      style={{
        ...themeVars(tokens),
        position: "relative",
        width: 28,
        height: 16,
        padding: 0,
        border: 0,
        borderRadius: RADIUS.base,
        background: checked ? tokens.accent : mix(tokens.fg1, 18),
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        flex: "none",
        transition: "background .15s",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: SPACE.s2,
          top: SPACE.s2,
          width: 12,
          height: 12,
          borderRadius: RADIUS.base / 2,
          background: checked ? tokens.accentInk : tokens.fg1,
          transform: checked ? "translateX(12px)" : "none",
          transition: "transform .15s",
        }}
      />
    </button>
  );

  if (label == null) return sw;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: SPACE.s8 + SPACE.s2,
        fontFamily: FONT.ui,
        fontSize: SIZE.body,
        color: disabled ? tokens.fg3 : tokens.fg1,
      }}
    >
      <span
        onClick={() => !disabled && onChange(!checked)}
        style={{ minWidth: 0, cursor: disabled ? "not-allowed" : "pointer", userSelect: "none" }}
      >
        {label}
        {description && (
          <span style={{ display: "block", fontSize: SIZE.minor, color: tokens.fg3, marginTop: SPACE.s2 }}>
            {description}
          </span>
        )}
      </span>
      {sw}
    </div>
  );
}
