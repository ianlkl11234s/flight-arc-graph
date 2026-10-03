import { type ReactNode } from "react";
import { getAirportInfo } from "../../map/cameraPresets";
import { useTheme } from "../../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../../styles/tokens";
import { themeVars } from "../../ui/vars";
import { IconMinus, IconPlus } from "../../ui/icons";
import { TRAJ } from "../../types/colorTheme";
import type { ArrDepCount } from "../../data/airportListStats";

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

/** 進／離數字欄寬（欄首與每列共用，讓兩者對齊） */
export const STAT_COL_W = 38;

const fmtStat = (n: number | null) => (n === null ? "—" : n.toLocaleString());

/** 數字欄欄首：進（TRAJ 進場色）、離（TRAJ 離場色）。右側留出 ＋ 鈕的位置。 */
export function AirportStatHeader() {
  const { tokens, isDark } = useTheme();
  const pal = isDark ? TRAJ.dark : TRAJ.light;
  const cell = { width: STAT_COL_W, textAlign: "right" as const, flex: "none" as const };
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        gap: SPACE.s8,
        padding: `0 ${SPACE.s8 + 24 + SPACE.s4 + SPACE.s4}px ${SPACE.s2}px ${SPACE.s8}px`,
        fontSize: SIZE.eyebrow,
        fontFamily: FONT.data,
        color: tokens.fg3,
      }}
    >
      <span style={{ flex: 1 }} />
      <span style={{ ...cell, color: pal.arr }}>進</span>
      <span style={{ ...cell, color: pal.dep }}>離</span>
    </div>
  );
}

/* ── SetsPanel：機場列（R11：點擊＝開啟機場；＋／Shift+點＝加入組合） ───── */

export function AirportRow({
  icao,
  name,
  iata,
  current,
  inSet,
  coverage,
  matchReason,
  stats,
  disabled = false,
  onOpen,
  onToggleSet,
}: {
  icao: string;
  name: string;
  iata?: string;
  /** 目前正在看的單一機場（非組合模式） */
  current: boolean;
  /** 組合模式下已在組合中 */
  inSet: boolean;
  coverage?: string;
  matchReason?: string;
  /** 所選日期的進／離場數；傳入才顯示數字欄，null = 缺值顯示「—」（R9） */
  stats?: ArrDepCount;
  disabled?: boolean;
  /** 單選並飛過去 */
  onOpen: () => void;
  /** 加入／移出組合 */
  onToggleSet: () => void;
}) {
  const { tokens, isDark } = useTheme();
  const pal = isDark ? TRAJ.dark : TRAJ.light;
  const info = getAirportInfo(icao);
  const label = info?.name ?? name;
  const highlighted = current || inSet;
  const status = current ? "目前" : inSet ? "組合中" : coverage;
  return (
    <div
      style={{
        ...themeVars(tokens),
        display: "flex",
        alignItems: "center",
        gap: SPACE.s4,
        background: highlighted ? tokens.accentSoft : "transparent",
        borderRadius: RADIUS.base,
        opacity: disabled ? 0.52 : 1,
      }}
    >
      <button
        type="button"
        aria-current={current ? "true" : undefined}
        onClick={(e) => {
          if (e.shiftKey) onToggleSet();
          else onOpen();
        }}
        disabled={disabled}
        title={disabled ? "目前尚無可載入的軌跡資料" : "點擊開啟機場；Shift+點擊加入組合"}
        className="fa-focus fa-hover"
        style={{
          display: "flex",
          alignItems: "center",
          gap: SPACE.s8,
          flex: 1,
          minWidth: 0,
          padding: `${SPACE.s6}px ${SPACE.s8}px`,
          background: "transparent",
          border: "none",
          borderRadius: RADIUS.base,
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
          fontFamily: FONT.ui,
        }}
      >
        <span
          aria-hidden="true"
          style={{ width: 2, height: 24, flexShrink: 0, background: highlighted ? tokens.accent : "transparent" }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: SIZE.body, color: highlighted ? tokens.fg1 : tokens.fg2, lineHeight: 1.3 }}>
            {label}
          </div>
          <div style={{ fontSize: SIZE.minor, color: tokens.fg3, fontFamily: FONT.data, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {info?.iata || iata || icao} / {icao}{status ? ` · ${status}` : ""}
          </div>
          {matchReason && (
            <div style={{ fontSize: SIZE.eyebrow, color: tokens.fg3, marginTop: SPACE.s2 }}>
              符合：{matchReason}
            </div>
          )}
        </div>
        {stats && (
          <>
            <StatNum value={stats.arr} color={pal.arr} label="進場" />
            <StatNum value={stats.dep} color={pal.dep} label="離場" />
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleSet}
        disabled={disabled}
        aria-label={inSet ? `從組合移除 ${label}` : `加入組合：${label}`}
        title={inSet ? "從組合移除" : "加入組合"}
        className="fa-focus fa-hover-fg"
        style={{
          width: 24,
          height: 24,
          flex: "none",
          marginRight: SPACE.s4,
          display: "grid",
          placeItems: "center",
          padding: 0,
          border: `1px solid ${inSet ? tokens.accent : tokens.border}`,
          borderRadius: RADIUS.base,
          background: inSet ? tokens.accent : "transparent",
          color: inSet ? tokens.accentInk : tokens.fg3,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {inSet ? <IconMinus /> : <IconPlus />}
      </button>
    </div>
  );
}

function StatNum({ value, color, label }: { value: number | null; color: string; label: string }) {
  const { tokens } = useTheme();
  return (
    <span
      aria-label={`${label} ${value === null ? "無資料" : value}`}
      style={{
        width: STAT_COL_W,
        flex: "none",
        textAlign: "right",
        fontFamily: FONT.data,
        fontVariantNumeric: "tabular-nums",
        fontSize: SIZE.body,
        color: value === null ? tokens.fg3 : color,
      }}
    >
      {fmtStat(value)}
    </span>
  );
}
