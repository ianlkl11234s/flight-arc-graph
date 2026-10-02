import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { mix, themeVars } from "./vars";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  variant?: ButtonVariant;
  /** 前置 SVG 圖示 */
  icon?: ReactNode;
  /** 只有圖示時必填 aria-label（由 ariaLabel 或原生 aria-label 提供） */
  ariaLabel?: string;
  /** 切換型按鈕：設定後輸出 aria-pressed，按下時呈 accent 字 + accentSoft 底 */
  pressed?: boolean;
  fullWidth?: boolean;
  /** 會切換文字的按鈕固定寬度（spec R10） */
  width?: number | string;
  style?: CSSProperties;
}

/** 高 28 的按鈕：primary（accent 底）／secondary（ctl 底 + border）／ghost／danger（spec §5）。 */
export function Button({
  variant = "secondary",
  icon,
  ariaLabel,
  pressed,
  fullWidth,
  width,
  disabled,
  children,
  style,
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const { tokens } = useTheme();
  const iconOnly = icon != null && (children == null || children === false);

  const look: Record<ButtonVariant, CSSProperties> = {
    primary: { background: tokens.accent, borderColor: tokens.accent, color: tokens.accentInk, fontWeight: 600 },
    secondary: { background: tokens.ctl, borderColor: tokens.border, color: tokens.fg1 },
    ghost: { background: "transparent", borderColor: "transparent", color: tokens.fg2 },
    danger: { background: "transparent", borderColor: mix(tokens.danger, 45), color: tokens.danger },
  };
  const pressedLook: CSSProperties =
    pressed ? { background: tokens.accentSoft, borderColor: mix(tokens.accent, 60), color: tokens.accent } : {};

  return (
    <button
      type={type}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      title={rest.title ?? (iconOnly ? ariaLabel : undefined)}
      className={["fa-focus", "fa-hover", className].filter(Boolean).join(" ")}
      style={{
        ...themeVars(tokens),
        height: 28,
        width: fullWidth ? "100%" : iconOnly ? 28 : width,
        padding: iconOnly ? 0 : `0 ${SPACE.s12}px`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: SPACE.s6,
        fontFamily: FONT.ui,
        fontSize: SIZE.body,
        whiteSpace: "nowrap",
        border: "1px solid",
        borderRadius: RADIUS.base,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background .15s, color .15s, border-color .15s",
        boxSizing: "border-box",
        flex: "none",
        ...look[variant],
        ...pressedLook,
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
