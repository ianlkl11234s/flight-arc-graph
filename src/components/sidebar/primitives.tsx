import { type ReactNode } from "react";
import { getAirportInfo } from "../../map/cameraPresets";
import { FONT } from "../../styles/tokens";
import type { ThemeColors } from "./theme";

/* ── Sub-components ──────────────────────────────────────── */

export function RailIcon({
  active,
  onClick,
  children,
  title,
  theme,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title: string;
  theme: ThemeColors;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      style={{
        position: "relative",
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "none",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        color: active ? theme.ACTIVE_TEXT : theme.DIM,
        filter: active ? "none" : "brightness(0.85)",
        transition: "color 0.15s, filter 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.filter = "brightness(1.3)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.filter = "brightness(0.85)";
      }}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            left: -6,
            top: 10,
            bottom: 10,
            width: 3,
            borderRadius: 2,
            background: theme.ACCENT_BLUE,
          }}
        />
      )}
      {children}
    </button>
  );
}

export function SectionHeader({ children, theme }: { children: string; theme: ThemeColors }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: theme.DIM,
        marginTop: 12,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

export function ToggleButtons<T extends string>({
  options,
  value,
  onChange,
  disabledValues,
  theme,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabledValues?: Set<T>;
  theme: ThemeColors;
}) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
      {options.map((opt) => {
        const isActive = value === opt.value;
        const isDisabled = disabledValues?.has(opt.value);
        return (
          <button
            key={opt.value}
            disabled={isDisabled}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: "5px 0",
              fontSize: 11,
              fontFamily: FONT.ui,
              border: `1px solid ${isActive ? theme.ACTIVE_BORDER : theme.BORDER}`,
              borderRadius: 4,
              background: isActive ? theme.ACTIVE_BG : "transparent",
              color: isDisabled ? theme.DISABLED_TEXT : isActive ? theme.ACTIVE_TEXT : theme.ACCENT,
              cursor: isDisabled ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  theme,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  theme: ThemeColors;
}) {
  const display = format ? format(value) : String(value);
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          fontFamily: FONT.ui,
          color: theme.ACCENT,
          marginBottom: 2,
        }}
      >
        <span>{label}</span>
        <span style={{ color: theme.DIM }}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          height: 4,
          appearance: "none",
          WebkitAppearance: "none",
          background: theme.SLIDER_TRACK,
          borderRadius: 2,
          outline: "none",
          cursor: "pointer",
          accentColor: theme.ACCENT_BLUE,
        }}
      />
    </div>
  );
}

/* ── SVG Icons ───────────────────────────────────────────── */

export function IconPlaneMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.8 19 16 11l3.5-3.5c1.5-1.5 2-3.5 1-4.5s-3-.5-4.5 1L12.5 7.5 4.5 5.7 3 7.2l6.5 3.8L6 14.5 3.5 14l-1 1 3.5 2 2 3.5 1-1-.5-2.5 3.5-3.5 3.8 6.5Z" />
    </svg>
  );
}

export function IconGlobeNetwork() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17M12 3c2.4 2.5 3.5 5.5 3.5 9S14.4 18.5 12 21M12 3C9.6 5.5 8.5 8.5 8.5 12S9.6 18.5 12 21" />
      <circle cx="7" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPinPlus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 10c0 4.2-5 8.4-5 8.4S7 14.2 7 10a5 5 0 0110 0z" />
      <circle cx="12" cy="10" r="1.6" />
      <path d="M18.5 16.5v5M16 19h5" />
    </svg>
  );
}

export function IconLayers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 3 8l9 5 9-5-9-5z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

export function IconRouteAnalysis() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="17" r="2" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="19" cy="14" r="2" />
      <path d="M6.2 15.4 10.8 8.6M13.7 8.2l3.6 4.6" />
    </svg>
  );
}

export function IconCamera() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h3l1.5-2h7L17 7h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

/* ── SetsPanel: 多機場組合檢視 ─────────────────────────────── */

export function SetChip({ icao, onRemove, theme }: {
  icao: string;
  onRemove: () => void;
  theme: ThemeColors;
}) {
  const info = getAirportInfo(icao);
  const label = info?.iata ?? icao;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 4px 2px 8px",
        background: theme.ACTIVE_BTN_BG,
        border: `1px solid ${theme.ACTIVE_BORDER}`,
        borderRadius: 12,
        fontSize: 11,
        fontFamily: FONT.ui,
        color: theme.ACTIVE_TEXT,
        lineHeight: 1.4,
      }}
      title={info?.name ?? icao}
    >
      {label}
      <button
        onClick={onRemove}
        style={{
          width: 16, height: 16, padding: 0,
          background: "transparent", border: "none",
          color: theme.DIM, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, lineHeight: 1, borderRadius: "50%",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = theme.ACCENT; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = theme.DIM; }}
        title="移除"
      >
        ×
      </button>
    </span>
  );
}

export function AirportCheckboxRow({
  icao,
  name,
  iata,
  checked,
  coverage,
  matchReason,
  disabled = false,
  onToggle,
  theme,
}: {
  icao: string;
  name: string;
  iata?: string;
  checked: boolean;
  coverage?: string;
  matchReason?: string;
  disabled?: boolean;
  onToggle: () => void;
  theme: ThemeColors;
}) {
  const info = getAirportInfo(icao);
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      title={disabled ? "目前尚無可載入的軌跡資料" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 8px",
        background: checked ? theme.ACTIVE_BTN_BG : "transparent",
        border: "none",
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        width: "100%",
        transition: "background 0.15s",
        opacity: disabled ? 0.52 : 1,
      }}
      onMouseEnter={(e) => { if (!checked && !disabled) e.currentTarget.style.background = theme.HOVER_BG; }}
      onMouseLeave={(e) => { if (!checked && !disabled) e.currentTarget.style.background = "transparent"; }}
    >
      <span
        style={{
          width: 14, height: 14, flexShrink: 0,
          borderRadius: 3,
          border: `1.5px solid ${checked ? theme.ACTIVE_BORDER : theme.BORDER}`,
          background: checked ? theme.ACTIVE_BORDER : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 10, lineHeight: 1,
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: checked ? theme.ACTIVE_TEXT : theme.ACCENT, lineHeight: 1.3 }}>
          {info?.name ?? name}
        </div>
        <div style={{ fontSize: 10, color: theme.DIM, fontFamily: FONT.ui }}>
          {info?.iata || iata || icao} / {icao}{coverage ? ` · ${coverage}` : ""}
        </div>
        {matchReason && (
          <div style={{ fontSize: 9, color: theme.DIM, marginTop: 2 }}>
            符合：{matchReason}
          </div>
        )}
      </div>
    </button>
  );
}

export function StatRow({ label, value, sub, theme }: { label: string; value: string | number; sub?: string; theme: ThemeColors }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0" }}>
      <span style={{ fontSize: 11, color: theme.DIM, fontFamily: FONT.ui }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: theme.ACCENT, fontFamily: FONT.ui }}>
        {value}
        {sub && <span style={{ fontSize: 10, color: theme.DIM, marginLeft: 4, fontWeight: 400 }}>{sub}</span>}
      </span>
    </div>
  );
}

export function MiniBar({ items, theme }: { items: { label: string; value: number; color?: string }[]; theme: ThemeColors }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: theme.DIM, fontFamily: FONT.ui, width: 32, textAlign: "right", flexShrink: 0 }}>
            {item.label}
          </span>
          <div style={{ flex: 1, height: 10, background: theme.SLIDER_TRACK, borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              width: `${(item.value / max) * 100}%`,
              height: "100%",
              background: item.color ?? theme.ACCENT_BLUE,
              borderRadius: 3,
              transition: "width 0.3s ease",
            }} />
          </div>
          <span style={{ fontSize: 10, color: theme.ACCENT, fontFamily: FONT.ui, width: 28, textAlign: "right", flexShrink: 0 }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 24h 迷你熱力條 */
