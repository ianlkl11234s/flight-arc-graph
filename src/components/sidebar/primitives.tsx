import { type ReactNode } from "react";
import { getAirportInfo } from "../../map/cameraPresets";
import { useTheme } from "../../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../../styles/tokens";
import { themeVars } from "../../ui/vars";

/* ── Sub-components ──────────────────────────────────────── */

export function RailIcon({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title: string;
}) {
  const { tokens } = useTheme();
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className="fa-focus fa-hover-fg"
      style={{
        ...themeVars(tokens),
        position: "relative",
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "none",
        border: "none",
        borderRadius: RADIUS.base,
        cursor: "pointer",
        color: active ? tokens.fg1 : tokens.fg3,
        transition: "color 0.15s",
      }}
    >
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -6,
            top: 10,
            bottom: 10,
            width: 2,
            background: tokens.accent,
          }}
        />
      )}
      {children}
    </button>
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

export function IconRadar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12 18.4 5.6" />
      <circle cx="15.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
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

export function AirportCheckboxRow({
  icao,
  name,
  iata,
  checked,
  coverage,
  matchReason,
  disabled = false,
  onToggle,
}: {
  icao: string;
  name: string;
  iata?: string;
  checked: boolean;
  coverage?: string;
  matchReason?: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const { tokens } = useTheme();
  const info = getAirportInfo(icao);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      disabled={disabled}
      title={disabled ? "目前尚無可載入的軌跡資料" : undefined}
      className="fa-focus fa-hover"
      style={{
        ...themeVars(tokens),
        display: "flex",
        alignItems: "center",
        gap: SPACE.s8 + SPACE.s2,
        padding: `${SPACE.s6}px ${SPACE.s8}px`,
        background: checked ? tokens.accentSoft : "transparent",
        border: "none",
        borderRadius: RADIUS.base,
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        width: "100%",
        fontFamily: FONT.ui,
        opacity: disabled ? 0.52 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 14, height: 14, flexShrink: 0,
          borderRadius: RADIUS.base,
          boxSizing: "border-box",
          border: `1px solid ${checked ? tokens.accent : tokens.border}`,
          background: checked ? tokens.accent : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: tokens.accentInk,
        }}
      >
        {checked && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square">
            <path d="M2 5.2l2.2 2.2L8 3" />
          </svg>
        )}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: SIZE.s11, color: checked ? tokens.fg1 : tokens.fg2, lineHeight: 1.3 }}>
          {info?.name ?? name}
        </div>
        <div style={{ fontSize: SIZE.s10, color: tokens.fg3, fontFamily: FONT.data }}>
          {info?.iata || iata || icao} / {icao}{coverage ? ` · ${coverage}` : ""}
        </div>
        {matchReason && (
          <div style={{ fontSize: SIZE.s9, color: tokens.fg3, marginTop: SPACE.s2 }}>
            符合：{matchReason}
          </div>
        )}
      </div>
    </button>
  );
}
