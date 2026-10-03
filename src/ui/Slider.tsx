import type { ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { FONT, SIZE, SPACE } from "../styles/tokens";
import { mix, themeVars } from "./vars";

interface SliderCommon {
  /** 標籤（左）與數值（右）同一行，控件在下一行 */
  label?: ReactNode;
  min: number;
  max: number;
  step?: number;
  /** 數值顯示格式；範圍模式各端分別套用 */
  format?: (v: number) => string;
  /** 完全自訂右側數值顯示（優先於 format） */
  valueLabel?: ReactNode;
  /** 不顯示標籤列（例如時間軸內嵌） */
  bare?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export interface SliderSingleProps extends SliderCommon {
  range?: false;
  value: number;
  onChange: (v: number) => void;
}

export interface SliderRangeProps extends SliderCommon {
  /** 雙把手範圍模式（取代 DurationRange） */
  range: true;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  /** 兩端最小間距，預設 0 */
  minGap?: number;
}

export type SliderProps = SliderSingleProps | SliderRangeProps;

export const THUMB_W = 6;
const HIT_H = 14;

/** 全站唯一滑桿：2px 軌 + 6×14 方形 thumb；可單值或雙把手範圍（spec §5）。 */
export function Slider(props: SliderProps) {
  const { tokens } = useTheme();
  const { label, min, max, step = 1, format, valueLabel, bare, disabled, ariaLabel } = props;
  const fmt = format ?? ((v: number) => String(v));
  const pct = (v: number) => (max === min ? 0 : (Math.min(max, Math.max(min, v)) - min) / (max - min));
  const at = (p: number) => `calc(${p} * (100% - ${THUMB_W}px) + ${THUMB_W / 2}px)`;

  const [lo, hi] = props.range ? props.value : [min, props.value];
  const fillLeft = props.range ? at(pct(lo)) : "0px";
  const fillRight = `calc(100% - ${at(pct(hi))})`;

  const display = valueLabel ?? (props.range ? `${fmt(props.value[0])} – ${fmt(props.value[1])}` : fmt(props.value));
  const a11y = ariaLabel ?? (typeof label === "string" ? label : undefined);

  const inputStyle = {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: HIT_H,
  };

  return (
    <div style={{ ...themeVars(tokens), display: "flex", flexDirection: "column", gap: SPACE.s4, opacity: disabled ? 0.5 : 1 }}>
      {!bare && (label != null || display != null) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: SPACE.s8,
            fontFamily: FONT.ui,
            fontSize: SIZE.body,
            color: tokens.fg1,
          }}
        >
          <span style={{ minWidth: 0 }}>{label}</span>
          <span style={{ color: tokens.fg2, fontFamily: FONT.data, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {display}
          </span>
        </div>
      )}
      <div style={{ position: "relative", height: HIT_H }}>
        <span
          aria-hidden="true"
          style={{ position: "absolute", left: 0, right: 0, top: (HIT_H - 2) / 2, height: 2, background: mix(tokens.fg1, 20) }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: fillLeft,
            right: fillRight,
            top: (HIT_H - 2) / 2,
            height: 2,
            background: disabled ? tokens.fg3 : tokens.accent,
          }}
        />
        {props.range ? (
          <>
            <input
              type="range"
              className="fa-slider fa-slider--range"
              aria-label={a11y ? `${a11y}（下限）` : "下限"}
              min={min}
              max={max}
              step={step}
              value={lo}
              disabled={disabled}
              onChange={(e) => {
                const v = Math.min(Number(e.target.value), hi - (props.minGap ?? 0));
                props.onChange([v, hi]);
              }}
              style={{ ...inputStyle, zIndex: lo > max - (max - min) / 2 ? 2 : 1 }}
            />
            <input
              type="range"
              className="fa-slider fa-slider--range"
              aria-label={a11y ? `${a11y}（上限）` : "上限"}
              min={min}
              max={max}
              step={step}
              value={hi}
              disabled={disabled}
              onChange={(e) => {
                const v = Math.max(Number(e.target.value), lo + (props.minGap ?? 0));
                props.onChange([lo, v]);
              }}
              style={{ ...inputStyle, zIndex: 1 }}
            />
          </>
        ) : (
          <input
            type="range"
            className="fa-slider"
            aria-label={a11y}
            min={min}
            max={max}
            step={step}
            value={props.value}
            disabled={disabled}
            onChange={(e) => props.onChange(Number(e.target.value))}
            style={inputStyle}
          />
        )}
      </div>
    </div>
  );
}
