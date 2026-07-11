import { useState, useMemo, type CSSProperties, type ReactNode } from "react";
import type { DataSource, DisplayMode, Region, RenderMode, Scope, TrackMode, Flight, SavedAirportSet } from "../types";
import type { AircraftFilterKey } from "../data/aircraftCategories";
import { COLOR_THEMES, type ColorTheme } from "../types/colorTheme";
import { AIRSPACE_CATEGORIES, type AirspaceCategory, type AirspaceSettings } from "../types/airspace";
import type { AirportColorMode, AirportAssignment } from "../types/airportColors";
import { StyleSelector } from "./StyleSelector";
import { DeepAnalysisPanel } from "./DeepAnalysisPanel";
import type { AnalysisColorBy } from "../data/analysisColors";
import type { FlightFilters } from "../data/classify";
import type { AirportManifestEntry } from "../data/flightLoader";
import type { AirportMeta } from "../data/airportMeta";
import { CAMERA_PRESETS, getAirportInfo } from "../map/cameraPresets";
import type { AtlasColorMode } from "../map/atlasGlowLayer";
import {
  getDepArrCount,
  computeTopRoutes,
  getAirlineStats,
  getFleetMix,
  getFlightDurationDistribution,
  computeHourlyStats,
  computeDailyStats,
  computeAirportComparison,
  getUniqueDays,
} from "../data/flightStats";

/* ── Scene Presets ─────────────────────────────────────── */

export interface ScenePreset {
  id: string;
  name: string;
  desc: string;
  camera: { center: [number, number]; zoom: number; pitch: number; bearing: number };
  dataSource: DataSource;
  scope: Scope;
  rangeDays: number;
  /** 起始日期 YYYY-MM-DD */
  date: string;
  /** 該日期內的 seek 時間 "HH:MM" (台灣時間) */
  time: string;
  opacity?: number;
  /** 航線軌跡 airport scope 時要選的機場 */
  airport?: string;
  /** 機型篩選 */
  aircraftFilter?: AircraftFilterKey;
  /** 場景所屬 region（用於篩選顯示） */
  region?: Region;
}

export const SCENE_PRESETS: ScenePreset[] = [
  // Taiwan
  {
    id: "tw-air-corridor",
    name: "台灣空中走廊",
    desc: "空域快照 · All TW · 1d",
    camera: { center: [121.0116, 24.5589], zoom: 9, pitch: 69, bearing: 69 },
    dataSource: "fused",
    scope: "region",
    rangeDays: 1,
    date: "2026-03-06",
    time: "02:18",
    opacity: 0.04,
    region: "TW",
  },
  {
    id: "china-active",
    name: "活躍中國境內班機",
    desc: "空域快照 · All TW · 1d",
    camera: { center: [118.286, 25.68], zoom: 8.2, pitch: 56, bearing: 23 },
    dataSource: "fused",
    scope: "region",
    rangeDays: 1,
    date: "2026-03-06",
    time: "08:17",
    opacity: 0.04,
    region: "TW",
  },
  {
    id: "taoyuan-closeup",
    name: "桃園機場起降",
    desc: "航線軌跡 · This Airport · 1d",
    camera: { center: [121.23, 25.08], zoom: 10.8, pitch: 65, bearing: 30 },
    dataSource: "api",
    scope: "airport",
    rangeDays: 1,
    date: "2026-02-19",
    time: "07:52",
    opacity: 0.1,
    airport: "RCTP",
    region: "TW",
  },
  {
    id: "all-taiwan-overview",
    name: "全台航線總覽",
    desc: "航線軌跡 · All TW · 1d",
    camera: { center: [120.6818, 23.4015], zoom: 7.5, pitch: 50, bearing: 0 },
    dataSource: "api",
    scope: "region",
    rangeDays: 1,
    date: "2026-02-19",
    time: "11:16",
    opacity: 0.06,
    region: "TW",
  },
  {
    id: "p8-patrol",
    name: "P-8 反潛機巡邏路徑",
    desc: "空域快照 · Military · 1d",
    camera: { center: [120.8183, 22.5421], zoom: 7, pitch: 28, bearing: -10 },
    dataSource: "fused",
    scope: "region",
    rangeDays: 1,
    date: "2026-03-06",
    time: "12:27",
    opacity: 0.36,
    aircraftFilter: "cat:military",
    region: "TW",
  },
  // Japan
  {
    id: "komaki-c130",
    name: "小牧基地 C-130",
    desc: "航線軌跡 · This Airport · 1d",
    camera: { center: [137.1058, 35.0844], zoom: 10, pitch: 55, bearing: 0 },
    dataSource: "api",
    scope: "airport",
    rangeDays: 1,
    date: "2026-02-18",
    time: "08:10",
    opacity: 0.1,
    airport: "RJNA",
    region: "JP",
  },
  {
    id: "tokyo-heli",
    name: "東京觀光直升機",
    desc: "航線軌跡 · This Airport · 1d",
    camera: { center: [139.7432, 35.632], zoom: 12.3, pitch: 38, bearing: 128 },
    dataSource: "api",
    scope: "airport",
    rangeDays: 1,
    date: "2026-02-18",
    time: "08:34",
    opacity: 0.1,
    airport: "RJTT",
    region: "JP",
  },
];

/* ── Style constants ─────────────────────────────────────── */

const RAIL_WIDTH = 56;
const PANEL_WIDTH = 240;

interface ThemeColors {
  ACCENT: string;
  BG_RAIL: string;
  BG_PANEL: string;
  BORDER: string;
  DIM: string;
  ACTIVE_TEXT: string;
  ACTIVE_BG: string;
  ACTIVE_BORDER: string;
  ACTIVE_BTN_BG: string;
  HOVER_BG: string;
  SLIDER_TRACK: string;
  ACCENT_BLUE: string;
  SCENE_BAR: string;
  CLOSE_BG: string;
  CLOSE_BORDER: string;
  DISABLED_TEXT: string;
  NO_DATA_TEXT: string;
  SELECT_BG: string;
}

function getThemeColors(isDark: boolean): ThemeColors {
  if (isDark) {
    return {
      ACCENT: "#E5E7EB",
      BG_RAIL: "#0D0E10",
      BG_PANEL: "rgba(0, 0, 0, 0.45)",
      BORDER: "#2A2D32",
      DIM: "#6B7280",
      ACTIVE_TEXT: "#fff",
      ACTIVE_BG: "rgba(100,170,255,0.2)",
      ACTIVE_BORDER: "#64aaff",
      ACTIVE_BTN_BG: "rgba(100,170,255,0.15)",
      HOVER_BG: "rgba(255,255,255,0.05)",
      SLIDER_TRACK: "#333",
      ACCENT_BLUE: "#64aaff",
      SCENE_BAR: "#f59e0b",
      CLOSE_BG: "rgba(255,255,255,0.06)",
      CLOSE_BORDER: "rgba(255,255,255,0.1)",
      DISABLED_TEXT: "#444",
      NO_DATA_TEXT: "#444",
      SELECT_BG: "rgba(0,0,0,0.4)",
    };
  }
  return {
    ACCENT: "#333333",
    BG_RAIL: "#F8F9FA",
    BG_PANEL: "rgba(255, 255, 255, 0.85)",
    BORDER: "#E0E0E0",
    DIM: "#888888",
    ACTIVE_TEXT: "#1a1a1a",
    ACTIVE_BG: "rgba(59, 130, 246, 0.15)",
    ACTIVE_BORDER: "#3B82F6",
    ACTIVE_BTN_BG: "rgba(59, 130, 246, 0.1)",
    HOVER_BG: "rgba(0,0,0,0.04)",
    SLIDER_TRACK: "#d1d5db",
    ACCENT_BLUE: "#3B82F6",
    SCENE_BAR: "#E8A308",
    CLOSE_BG: "rgba(0,0,0,0.06)",
    CLOSE_BORDER: "rgba(0,0,0,0.1)",
    DISABLED_TEXT: "#bbb",
    NO_DATA_TEXT: "#ccc",
    SELECT_BG: "rgba(0,0,0,0.06)",
  };
}

/* ── Types ───────────────────────────────────────────────── */

type PanelId = "settings" | "locations" | "sets" | "calendar" | "colors" | "airspace" | "summary" | "analysis" | "atlas";

export interface IconRailSidebarProps {
  // Theme
  isDarkTheme: boolean;
  // Settings panel controls
  displayMode: DisplayMode;
  renderMode: RenderMode;
  mapStyleId: string;
  // Slider values
  altExaggeration: number;
  altOffset: number;
  staticOpacity: number;
  orbScale: number;
  airportOpacity: number;
  airportGlow: number;
  trailLineWidth: number;
  // Callbacks
  onDisplayModeChange: (mode: DisplayMode) => void;
  onRenderModeChange: (mode: RenderMode) => void;
  onMapStyleChange: (id: string) => void;
  onAltExaggerationChange: (v: number) => void;
  onAltOffsetChange: (v: number) => void;
  onStaticOpacityChange: (v: number) => void;
  onOrbScaleChange: (v: number) => void;
  onAirportOpacityChange: (v: number) => void;
  onAirportGlowChange: (v: number) => void;
  onTrailLineWidthChange: (v: number) => void;
  viewshedOpacity: number;
  onViewshedOpacityChange: (v: number) => void;
  viewshedSharpness: number;
  onViewshedSharpnessChange: (v: number) => void;
  // Scope & Track mode
  scope: Scope;
  region: Region;
  trackMode: TrackMode;
  timeWindow: boolean;
  pickableFlights: Flight[];
  selectedFlightId: string | null;
  onScopeChange: (scope: Scope) => void;
  onTrackModeChange: (mode: TrackMode) => void;
  onTimeWindowChange: (v: boolean) => void;
  onFlightSelect: (id: string | null) => void;
  // Locations
  airports: string[];
  /** manifest 機場目錄（isCore / dates / fullDates / flights），key = ICAO */
  airportCatalog: Record<string, AirportManifestEntry>;
  /** 機場 metadata（座標/名稱/國家），含無 preset 的長尾機場，key = ICAO */
  airportMeta: Record<string, AirportMeta>;
  selectedAirport: string;
  onAirportChange: (icao: string) => void;
  onLocationJump: (icao: string) => void;
  onSceneSelect: (scene: ScenePreset) => void;
  // Calendar
  availableDates: string[];
  /** 完整資料的日期（實心標記） */
  fullDates: string[];
  /** 各日期的軌跡筆數（單一機場模式才有，tooltip 顯示用） */
  dateCounts?: Record<string, number>;
  selectedDate: string | null;
  onDateSelect: (date: string | null) => void;
  // Flights data (for summary panel — already filtered by time window)
  summaryFlights: Flight[];
  /** 時間範圍天數（1d / 3d / 7d）影響顯示內容 */
  rangeDays: number;
  // Stats
  onStatsClick: () => void;
  // Info
  onInfoClick: () => void;
  // Day/Night
  showTerminator: boolean;
  onTerminatorChange: (v: boolean) => void;
  // Color Theme
  colorThemeKey: string;
  onColorThemeChange: (key: string) => void;
  colorThemeOverride: ColorTheme | null;
  onColorThemeOverride: (theme: ColorTheme) => void;
  // Airspace
  airspaceSettings: AirspaceSettings;
  onAirspaceSettingsChange: (s: AirspaceSettings) => void;
  // Per-airport color
  colorBy: AirportColorMode;
  onColorByChange: (m: AirportColorMode) => void;
  airportAssignment: AirportAssignment | null;
  airportColorOverrides: Record<string, string>;
  onAirportColorOverride: (icao: string, hex: string | null) => void;
  onAirportColorReset: () => void;
  compareModeActive: boolean;
  // 多機場組合（Sets 模式）
  airportSet: string[] | null;
  setName: string | null;
  savedSets: SavedAirportSet[];
  onApplySet: (set: SavedAirportSet) => void;
  onToggleAirportInSet: (icao: string) => void;
  onClearSet: () => void;
  onExitSetMode: () => void;
  // Deep Analysis (🔬)
  analysisFilteredFlights: Flight[];
  analysisPreFilterFlights: Flight[];
  analysisColorBy: AnalysisColorBy;
  onAnalysisColorByChange: (v: AnalysisColorBy) => void;
  flightFilters: FlightFilters;
  onFlightFiltersChange: (f: FlightFilters) => void;
  scaleByAircraftSize: boolean;
  onScaleByAircraftSizeChange: (v: boolean) => void;
  // Atlas 機場總覽（🗺️）
  atlasVisible: boolean;
  onAtlasVisibleChange: (v: boolean) => void;
  atlasGlowVisible: boolean;
  onAtlasGlowVisibleChange: (v: boolean) => void;
  atlasColorMode: AtlasColorMode;
  onAtlasColorModeChange: (m: AtlasColorMode) => void;
  atlasGlowSize: number;
  onAtlasGlowSizeChange: (v: number) => void;
}

/* ── Helpers ─────────────────────────────────────────────── */

const FADE_KEYFRAMES = `
@keyframes iconRailFadeIn {
  from { opacity: 0; transform: translateX(-12px); }
  to   { opacity: 1; transform: translateX(0); }
}
`;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ── Sub-components ──────────────────────────────────────── */

function RailIcon({
  active,
  onClick,
  children,
  title,
  theme,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
  theme: ThemeColors;
}) {
  return (
    <button
      title={title}
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

function SectionHeader({ children, theme }: { children: string; theme: ThemeColors }) {
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

function ToggleButtons<T extends string>({
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
              fontFamily: "monospace",
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

function SliderRow({
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
          fontFamily: "monospace",
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

function IconActivity() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function IconMapPin() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconBarChart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

/* ── Panel contents ──────────────────────────────────────── */

function SettingsPanel(props: IconRailSidebarProps & { theme: ThemeColors }) {
  const { theme } = props;
  return (
    <>
      <SectionHeader theme={theme}>Scope</SectionHeader>
      <ToggleButtons<Scope>
        options={[
          { value: "airport", label: "This Airport" },
          { value: "region", label: props.region === "all" ? "All Regions" : props.region === "world" ? "All World" : `All ${REGION_LABELS[props.region] ?? props.region}` },
        ]}
        value={props.scope}
        onChange={props.onScopeChange}
        theme={theme}
      />
      <ToggleButtons<TrackMode>
        options={[
          { value: "stack", label: "Stack All" },
          { value: "single", label: "Track Single" },
        ]}
        value={props.trackMode}
        onChange={(m) => {
          props.onTrackModeChange(m);
          if (m !== "single") props.onFlightSelect(null);
        }}
        theme={theme}
      />
      {props.trackMode === "single" && props.pickableFlights.length > 0 && (
        <select
          value={props.selectedFlightId ?? ""}
          onChange={(e) => props.onFlightSelect(e.target.value || null)}
          style={{
            width: "100%",
            background: theme.SELECT_BG,
            color: theme.ACTIVE_TEXT,
            border: `1px solid ${theme.BORDER}`,
            borderRadius: 4,
            padding: "5px 6px",
            fontSize: 11,
            fontFamily: "monospace",
            cursor: "pointer",
            marginBottom: 8,
          }}
        >
          <option value="">Select flight...</option>
          {props.pickableFlights.map((f) => (
            <option key={f.fr24_id} value={f.fr24_id}>
              {f.callsign} ({f.origin_iata}→{f.dest_iata})
            </option>
          ))}
        </select>
      )}

      <SectionHeader theme={theme}>Display</SectionHeader>
      <ToggleButtons<DisplayMode>
        options={[
          { value: "trails", label: "Flight Trails" },
          { value: "status", label: "Live Status" },
        ]}
        value={props.displayMode}
        onChange={props.onDisplayModeChange}
        theme={theme}
      />
      {/* ±12h Window：僅在 Flight Trails 模式下顯示 */}
      {props.displayMode === "trails" && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            fontFamily: "monospace",
            color: props.timeWindow ? theme.ACTIVE_TEXT : theme.ACCENT,
            cursor: "pointer",
            marginBottom: 8,
            marginLeft: 4,
          }}
        >
          <input
            type="checkbox"
            checked={props.timeWindow}
            onChange={(e) => props.onTimeWindowChange(e.target.checked)}
            style={{ accentColor: theme.ACCENT_BLUE, width: 14, height: 14, cursor: "pointer" }}
          />
          ±12h Window
        </label>
      )}
      <ToggleButtons<RenderMode>
        options={[
          { value: "3d", label: "3D Altitude" },
          { value: "2d", label: "2D Flat" },
        ]}
        value={props.renderMode}
        onChange={props.onRenderModeChange}
        theme={theme}
      />

      <SectionHeader theme={theme}>Map</SectionHeader>
      <div style={{ marginBottom: 8 }}>
        <StyleSelector
          selected={props.mapStyleId}
          isDarkTheme={props.isDarkTheme}
          onChange={props.onMapStyleChange}
        />
      </div>
      {props.mapStyleId === "satellite" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: "monospace", color: theme.DIM, cursor: "pointer", marginBottom: 8 }}>
          <input type="checkbox" checked={props.showTerminator} onChange={(e) => props.onTerminatorChange(e.target.checked)} />
          Day/Night
        </label>
      )}

      <SectionHeader theme={theme}>Visual</SectionHeader>
      <SliderRow
        label="Alt"
        value={props.altExaggeration}
        min={1} max={5} step={0.5}
        format={(v) => `\u00d7${v}`}
        onChange={props.onAltExaggerationChange}
        theme={theme}
      />
      <SliderRow
        label="Z"
        value={props.altOffset}
        min={0} max={1000} step={50}
        format={(v) => `+${v}m`}
        onChange={props.onAltOffsetChange}
        theme={theme}
      />
      <SliderRow
        label="Opacity"
        value={props.staticOpacity}
        min={0.02} max={0.5} step={0.02}
        format={(v) => v.toFixed(2)}
        onChange={props.onStaticOpacityChange}
        theme={theme}
      />
      <SliderRow
        label="Width"
        value={props.trailLineWidth}
        min={0.1} max={6} step={0.1}
        format={(v) => `×${v.toFixed(1)}`}
        onChange={props.onTrailLineWidthChange}
        theme={theme}
      />
      <SliderRow
        label="Orb"
        value={props.orbScale}
        min={0.000001} max={0.00001} step={0.000001}
        format={(v) => v.toFixed(6)}
        onChange={props.onOrbScaleChange}
        theme={theme}
      />
      <SliderRow
        label="APT"
        value={props.airportOpacity}
        min={0} max={0.3} step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={props.onAirportOpacityChange}
        theme={theme}
      />
      <SliderRow
        label="Glow"
        value={props.airportGlow}
        min={0} max={2} step={0.1}
        format={(v) => v.toFixed(1)}
        onChange={props.onAirportGlowChange}
        theme={theme}
      />
      {props.trackMode === "single" && (
        <>
          <SliderRow
            label="View"
            value={props.viewshedOpacity}
            min={0} max={2} step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={props.onViewshedOpacityChange}
            theme={theme}
          />
          <SliderRow
            label="Edge"
            value={props.viewshedSharpness}
            min={0} max={1} step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={props.onViewshedSharpnessChange}
            theme={theme}
          />
        </>
      )}
    </>
  );
}

function AirportButton({ preset, isActive, onAirportChange, onLocationJump, theme, meta, metaInfo }: {
  preset: { icao: string; name: string };
  isActive: boolean;
  onAirportChange: (icao: string) => void;
  onLocationJump: (icao: string) => void;
  theme: ThemeColors;
  /** manifest 目錄資訊：有給才顯示完整度標記（◐ = 被動收集，資料不完整） */
  meta?: AirportManifestEntry;
  /** metadata（IATA fallback：無 AIRPORT_INFO 覆寫的長尾機場才用得到） */
  metaInfo?: AirportMeta;
}) {
  const info = getAirportInfo(preset.icao);
  const iata = info?.iata ?? metaInfo?.iata ?? preset.icao;
  const isPartial = meta ? !meta.isCore : false;
  return (
    <button
      onClick={() => { onAirportChange(preset.icao); onLocationJump(preset.icao); }}
      title={meta ? (isPartial ? `${meta.flights} flights · 被動收集，資料不完整` : `${meta.flights} flights`) : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        background: isActive ? theme.ACTIVE_BTN_BG : "transparent",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.15s",
        width: "100%",
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = theme.HOVER_BG; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ width: 3, height: 24, borderRadius: 2, background: isActive ? theme.ACCENT_BLUE : theme.BORDER, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: isActive ? theme.ACTIVE_TEXT : theme.ACCENT, lineHeight: 1.3 }}>
          {info?.name ?? preset.name}
        </div>
        <div style={{ fontSize: 10, color: theme.DIM, fontFamily: "monospace" }}>
          {iata} / {preset.icao}
        </div>
      </div>
      {meta && (
        <span style={{ fontSize: 9, color: theme.DIM, fontFamily: "monospace", flexShrink: 0 }}>
          {isPartial ? "◐ " : ""}{meta.flights}
        </span>
      )}
    </button>
  );
}

const KNOWN_PREFIXES = ["RC", "RJ", "RO", "VH", "RK", "VT", "K", "EG"];
// 中國大陸：ICAO 開頭 Z，排除北韓 ZK、蒙古 ZM（照抄 split-tracks.ts getRegion）
const isCnIcao = (icao: string) =>
  icao.startsWith("Z") && !icao.startsWith("ZK") && !icao.startsWith("ZM");
const REGION_ICAO_MATCH: Record<string, (icao: string) => boolean> = {
  TW: (icao) => icao.startsWith("RC"),
  JP: (icao) => icao.startsWith("RJ") || icao.startsWith("RO"),
  HK: (icao) => icao.startsWith("VH"),
  KR: (icao) => icao.startsWith("RK"),
  TH: (icao) => icao.startsWith("VT"),
  US: (icao) => icao.startsWith("K"),
  UK: (icao) => icao.startsWith("EG"),
  CN: (icao) => isCnIcao(icao),
  world: (icao) => !KNOWN_PREFIXES.some((p) => icao.startsWith(p)) && !isCnIcao(icao),
  all: () => true,
};

const REGION_LABELS: Record<string, string> = {
  TW: "台灣 Taiwan",
  JP: "日本 Japan",
  HK: "香港 Hong Kong",
  KR: "韓國 Korea",
  TH: "泰國 Thailand",
  US: "United States",
  UK: "United Kingdom",
  CN: "中國 China",
  world: "World",
};

function LocationsPanel({
  airports,
  airportCatalog,
  airportMeta,
  selectedAirport,
  onAirportChange,
  onLocationJump,
  onSceneSelect,
  region,
  theme,
}: Pick<IconRailSidebarProps, "airports" | "airportCatalog" | "airportMeta" | "selectedAirport" | "onAirportChange" | "onLocationJump" | "onSceneSelect" | "region"> & { theme: ThemeColors }) {
  const [search, setSearch] = useState("");
  const [showTail, setShowTail] = useState(false);

  // Use CAMERA_PRESETS order, filtered by available airports + region
  const available = new Set(airports);
  const matchRegion = REGION_ICAO_MATCH[region] || (() => true);
  const ordered = CAMERA_PRESETS.filter((p) => available.has(p.icao) && matchRegion(p.icao));

  // 搜尋：涵蓋 manifest 全部機場（不限 camera presets），core 優先
  // 名稱/IATA 比對先查 AIRPORT_INFO（中文覆寫），再 fallback 到 metadata（涵蓋無 preset 的長尾機場）
  const q = search.trim().toUpperCase();
  const searchResults = useMemo(() => {
    if (!q) return null;
    const matched = Object.keys(airportCatalog).filter((icao) => {
      if (icao.includes(q)) return true;
      const info = getAirportInfo(icao);
      if (info && (info.iata.toUpperCase().includes(q) || info.name.toUpperCase().includes(q))) return true;
      const m = airportMeta[icao];
      if (m && (m.iata.toUpperCase().includes(q) || m.name.toUpperCase().includes(q))) return true;
      return false;
    });
    matched.sort((a, b) => (airportCatalog[b]?.flights ?? 0) - (airportCatalog[a]?.flights ?? 0));
    return {
      core: matched.filter((i) => airportCatalog[i]?.isCore),
      tail: matched.filter((i) => !airportCatalog[i]?.isCore),
    };
  }, [q, airportCatalog, airportMeta]);

  const selectedMeta = airportCatalog[selectedAirport];
  const renderIcao = (icao: string) => (
    <AirportButton
      key={icao}
      preset={{ icao, name: getAirportInfo(icao)?.name ?? airportMeta[icao]?.name ?? icao }}
      isActive={icao === selectedAirport}
      onAirportChange={onAirportChange}
      onLocationJump={onLocationJump}
      theme={theme}
      meta={airportCatalog[icao]}
      metaInfo={airportMeta[icao]}
    />
  );

  // 「其他機場」：manifest 有資料、屬於本 region、但沒 curated preset 的機場（依 flights 降冪）
  const OTHER_CAP = 30;
  const presetIcaos = useMemo(() => new Set(CAMERA_PRESETS.map((p) => p.icao)), []);
  const otherAirports = (matchFn: (icao: string) => boolean) =>
    Object.keys(airportCatalog)
      .filter((icao) => available.has(icao) && matchFn(icao) && !presetIcaos.has(icao))
      .sort((a, b) => (airportCatalog[b]?.flights ?? 0) - (airportCatalog[a]?.flights ?? 0));

  const renderOtherBlock = (others: string[]) => {
    if (others.length === 0) return null;
    return (
      <>
        <div style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2, textTransform: "uppercase", padding: "6px 8px 2px" }}>
          其他機場 Other ({others.length})
        </div>
        {others.slice(0, OTHER_CAP).map(renderIcao)}
        {others.length > OTHER_CAP && (
          <div style={{ fontSize: 10, color: theme.DIM, padding: "2px 8px 6px" }}>
            共 {others.length} 座，可用搜尋
          </div>
        )}
      </>
    );
  };

  // Group by region when "all"
  const groupedByRegion = region === "all"
    ? (["TW", "JP", "HK", "KR", "TH", "US", "UK", "CN", "world"] as const).map((r) => {
        const match = REGION_ICAO_MATCH[r]!;
        return {
          key: r,
          label: REGION_LABELS[r],
          presets: CAMERA_PRESETS.filter((p) => available.has(p.icao) && match(p.icao)),
          others: otherAirports(match),
        };
      }).filter((g) => g.presets.length > 0 || g.others.length > 0)
    : null;

  // 場景依 region 篩選
  const filteredScenes = SCENE_PRESETS.filter(
    (s) => !s.region || s.region === region || region === "all",
  );

  // JP 機場分組（依起降次數排名）
  const JP_MAJOR: Set<string> = new Set([
    "RJTT", "RJAA", "RJBB", "ROAH", "RJFF", "RJCC", "RJOO", "RJGG", "RJFK", "RJSS",
  ]);
  const JP_MEDIUM: Set<string> = new Set([
    "RJFT", "RJFM", "RJBE", "RJFU", "RJOM", "ROIG", "RJOT", "RJOA", "ROMY",
    "RJFO", "RJCH", "RJFR", "RJOB", "RJCB", "RJOK",
  ]);
  const JP_SPECIAL: Set<string> = new Set(["RJNA"]);

  const isJPGrouped = region === "JP";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* 場景預設 */}
      {filteredScenes.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2, textTransform: "uppercase", padding: "4px 8px 2px", marginTop: 2 }}>
            場景 Scene
          </div>
          {filteredScenes.map((scene) => (
            <button
              key={scene.id}
              onClick={() => onSceneSelect(scene)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = theme.HOVER_BG; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ width: 3, height: 24, borderRadius: 2, background: theme.SCENE_BAR, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: theme.ACCENT, lineHeight: 1.3 }}>{scene.name}</div>
                <div style={{ fontSize: 10, color: theme.DIM, fontFamily: "monospace" }}>{scene.desc}</div>
              </div>
            </button>
          ))}
          <div style={{ height: 1, background: theme.BORDER, margin: "6px 8px" }} />
        </>
      )}

      {/* 機場搜尋（涵蓋 manifest 全部機場，含未在下方清單的長尾機場） */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜尋機場 ICAO / IATA / 名稱"
        style={{
          margin: "0 8px 6px",
          padding: "6px 8px",
          fontSize: 11,
          fontFamily: "monospace",
          background: "transparent",
          border: `1px solid ${theme.BORDER}`,
          borderRadius: 6,
          color: theme.ACTIVE_TEXT,
          outline: "none",
        }}
      />

      {/* 選中機場為被動收集時的資料品質提示 */}
      {selectedMeta && !selectedMeta.isCore && (
        <div
          style={{
            margin: "0 8px 6px",
            padding: "6px 8px",
            fontSize: 10,
            lineHeight: 1.5,
            borderRadius: 6,
            border: "1px solid rgba(255,166,0,0.35)",
            background: "rgba(255,166,0,0.08)",
            color: theme.ACCENT,
          }}
        >
          ◐ {selectedAirport} 為被動收集資料：僅含與主動抓取機場之間的航班，非該機場完整流量
        </div>
      )}

      {/* 機場列表 */}
      {searchResults ? (
        /* 搜尋結果：core 優先，長尾收合 */
        <>
          <div style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2, textTransform: "uppercase", padding: "6px 8px 2px" }}>
            核心機場 ({searchResults.core.length})
          </div>
          {searchResults.core.slice(0, 30).map(renderIcao)}
          {searchResults.core.length === 0 && (
            <div style={{ fontSize: 11, color: theme.DIM, padding: "2px 8px 6px" }}>無符合的核心機場</div>
          )}
          {searchResults.tail.length > 0 && (
            <>
              <button
                onClick={() => setShowTail((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 8px 2px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 10,
                  color: theme.DIM,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
              >
                {showTail ? "▾" : "▸"} 更多機場（資料不完整）({searchResults.tail.length})
              </button>
              {showTail && searchResults.tail.slice(0, 30).map(renderIcao)}
              {showTail && searchResults.tail.length > 30 && (
                <div style={{ fontSize: 10, color: theme.DIM, padding: "2px 8px 6px" }}>
                  僅顯示前 30 筆，請輸入更精確的關鍵字
                </div>
              )}
            </>
          )}
        </>
      ) : groupedByRegion ? (
        /* All regions: grouped */
        groupedByRegion.map((group) => (
          <div key={group.key}>
            <div style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2, textTransform: "uppercase", padding: "6px 8px 2px" }}>
              {group.label} ({group.presets.length})
            </div>
            {group.presets.map((preset) => (
              <AirportButton key={preset.icao} preset={preset} isActive={preset.icao === selectedAirport} onAirportChange={onAirportChange} onLocationJump={onLocationJump} theme={theme} meta={airportCatalog[preset.icao]} />
            ))}
            {renderOtherBlock(group.others)}
          </div>
        ))
      ) : isJPGrouped ? (
        /* Japan: tiered by flight volume */
        <>
          {([
            { label: "主要空港 Major", filter: (icao: string) => JP_MAJOR.has(icao) },
            { label: "中型空港 Regional", filter: (icao: string) => JP_MEDIUM.has(icao) },
            { label: "小型空港 Local", filter: (icao: string) => !JP_MAJOR.has(icao) && !JP_MEDIUM.has(icao) && !JP_SPECIAL.has(icao) },
            { label: "特別 Special", filter: (icao: string) => JP_SPECIAL.has(icao) },
          ] as const).map(({ label, filter }) => {
            const group = ordered.filter((p) => filter(p.icao));
            if (group.length === 0) return null;
            return (
              <div key={label}>
                <div style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2, textTransform: "uppercase", padding: "6px 8px 2px" }}>
                  {label} ({group.length})
                </div>
                {group.map((preset) => (
                  <AirportButton key={preset.icao} preset={preset} isActive={preset.icao === selectedAirport} onAirportChange={onAirportChange} onLocationJump={onLocationJump} theme={theme} meta={airportCatalog[preset.icao]} />
                ))}
              </div>
            );
          })}
          {renderOtherBlock(otherAirports(matchRegion))}
        </>
      ) : (
        /* Other single region */
        <>
          {ordered.length > 0 && (
            <div style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2, textTransform: "uppercase", padding: "2px 8px 2px" }}>
              機場 Airport ({ordered.length})
            </div>
          )}
          {ordered.map((preset) => (
            <AirportButton key={preset.icao} preset={preset} isActive={preset.icao === selectedAirport} onAirportChange={onAirportChange} onLocationJump={onLocationJump} theme={theme} meta={airportCatalog[preset.icao]} />
          ))}
          {renderOtherBlock(otherAirports(matchRegion))}
        </>
      )}
    </div>
  );
}

/* ── SetsPanel: 多機場組合檢視 ─────────────────────────────── */

function SetChip({ icao, onRemove, theme }: {
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
        fontFamily: "monospace",
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

function AirportCheckboxRow({ icao, name, checked, onToggle, theme }: {
  icao: string;
  name: string;
  checked: boolean;
  onToggle: () => void;
  theme: ThemeColors;
}) {
  const info = getAirportInfo(icao);
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 8px",
        background: checked ? theme.ACTIVE_BTN_BG : "transparent",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => { if (!checked) e.currentTarget.style.background = theme.HOVER_BG; }}
      onMouseLeave={(e) => { if (!checked) e.currentTarget.style.background = "transparent"; }}
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
        <div style={{ fontSize: 10, color: theme.DIM, fontFamily: "monospace" }}>
          {info?.iata ?? icao} / {icao}
        </div>
      </div>
    </button>
  );
}

function SetsPanel({
  airports,
  region,
  airportSet,
  setName,
  savedSets,
  onApplySet,
  onToggleAirport,
  onClearSet,
  onExitSetMode,
  theme,
}: {
  airports: string[];
  region: Region;
  airportSet: string[];
  setName: string | null;
  savedSets: SavedAirportSet[];
  onApplySet: (set: SavedAirportSet) => void;
  onToggleAirport: (icao: string) => void;
  onClearSet: () => void;
  onExitSetMode: () => void;
  theme: ThemeColors;
}) {
  const available = new Set(airports);
  const selectedSet = new Set(airportSet);
  const defaultRegionKey = region === "all" || region === "world" ? "world" : region;
  const [openRegions, setOpenRegions] = useState<Set<string>>(new Set([defaultRegionKey]));

  const groupedByRegion = (["TW", "JP", "HK", "KR", "TH", "US", "UK", "world"] as const).map((r) => ({
    key: r as string,
    label: REGION_LABELS[r] ?? r,
    presets: CAMERA_PRESETS.filter((p) => available.has(p.icao) && REGION_ICAO_MATCH[r]!(p.icao)),
  })).filter((g) => g.presets.length > 0);

  const toggleRegion = (key: string) => {
    setOpenRegions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const matchedSavedSetId = setName
    ? savedSets.find((s) => s.shortName === setName)?.id ?? null
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Header: 已選 + 動作 */}
      <div style={{ padding: "4px 8px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 11, color: theme.ACCENT, lineHeight: 1.3 }}>
          已選 <strong style={{ color: theme.ACTIVE_TEXT }}>{airportSet.length}</strong> 座
          {setName && (
            <span style={{ marginLeft: 6, fontSize: 10, color: theme.DIM, fontFamily: "monospace" }}>· {setName}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={onClearSet}
            disabled={airportSet.length === 0}
            style={{
              padding: "2px 8px", fontSize: 10, borderRadius: 4,
              background: "transparent", border: `1px solid ${theme.BORDER}`,
              color: airportSet.length === 0 ? theme.DISABLED_TEXT : theme.DIM,
              cursor: airportSet.length === 0 ? "default" : "pointer",
            }}
          >
            清空
          </button>
          <button
            onClick={onExitSetMode}
            style={{
              padding: "2px 8px", fontSize: 10, borderRadius: 4,
              background: "transparent", border: `1px solid ${theme.BORDER}`,
              color: theme.DIM, cursor: "pointer",
            }}
            title="退出組合模式（回到單一機場）"
          >
            退出
          </button>
        </div>
      </div>

      {/* Selected chips */}
      {airportSet.length > 0 && (
        <div style={{ padding: "4px 8px 8px", display: "flex", flexWrap: "wrap", gap: 4 }}>
          {airportSet.map((icao) => (
            <SetChip key={icao} icao={icao} onRemove={() => onToggleAirport(icao)} theme={theme} />
          ))}
        </div>
      )}

      <div style={{ height: 1, background: theme.BORDER, margin: "2px 8px 6px" }} />

      {/* Saved Sets */}
      <div style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2, textTransform: "uppercase", padding: "2px 8px 4px" }}>
        預設組合 Saved Sets
      </div>
      {savedSets.map((s) => {
        const isActive = s.id === matchedSavedSetId;
        return (
          <button
            key={s.id}
            onClick={() => onApplySet(s)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 8px",
              background: isActive ? theme.ACTIVE_BTN_BG : "transparent",
              border: "none", borderRadius: 6,
              cursor: "pointer", textAlign: "left", width: "100%",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = theme.HOVER_BG; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ width: 3, height: 24, borderRadius: 2, background: isActive ? theme.ACCENT_BLUE : theme.SCENE_BAR, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: isActive ? theme.ACTIVE_TEXT : theme.ACCENT, lineHeight: 1.3 }}>
                {s.name}
              </div>
              <div style={{ fontSize: 10, color: theme.DIM, fontFamily: "monospace" }}>
                {s.icaos.length} 座 · {s.icaos.slice(0, 4).join(" · ")}{s.icaos.length > 4 ? " …" : ""}
              </div>
            </div>
          </button>
        );
      })}

      <div style={{ height: 1, background: theme.BORDER, margin: "8px 8px 6px" }} />

      {/* All airports (collapsible by region) */}
      <div style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2, textTransform: "uppercase", padding: "2px 8px 4px" }}>
        全部機場 All Airports
      </div>
      {groupedByRegion.map((g) => {
        const open = openRegions.has(g.key);
        const selectedInGroup = g.presets.filter((p) => selectedSet.has(p.icao)).length;
        return (
          <div key={g.key}>
            <button
              onClick={() => toggleRegion(g.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 8px", width: "100%",
                background: "transparent", border: "none",
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = theme.HOVER_BG; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 9, color: theme.DIM, width: 8, display: "inline-block" }}>
                {open ? "▼" : "▶"}
              </span>
              <span style={{ fontSize: 11, color: theme.ACCENT, flex: 1 }}>
                {g.label}
              </span>
              <span style={{ fontSize: 10, color: theme.DIM, fontFamily: "monospace" }}>
                {selectedInGroup > 0 ? `${selectedInGroup}/` : ""}{g.presets.length}
              </span>
            </button>
            {open && g.presets.map((p) => (
              <AirportCheckboxRow
                key={p.icao}
                icao={p.icao}
                name={p.name}
                checked={selectedSet.has(p.icao)}
                onToggle={() => onToggleAirport(p.icao)}
                theme={theme}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function CalendarPanel({
  availableDates,
  fullDates,
  dateCounts,
  selectedDate,
  onDateSelect,
  theme,
}: Pick<IconRailSidebarProps, "availableDates" | "fullDates" | "dateCounts" | "selectedDate" | "onDateSelect"> & { theme: ThemeColors }) {
  const availableSet = new Set(availableDates);
  const fullSet = new Set(fullDates);

  // Determine initial month from selectedDate or first available date or current month
  const initDate = selectedDate
    ? new Date(selectedDate)
    : availableDates.length > 0
      ? new Date(availableDates[0]!)
      : new Date();

  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const cellBase: CSSProperties = {
    width: 30,
    height: 30,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontFamily: "monospace",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    background: "transparent",
    color: theme.ACCENT,
    position: "relative",
  };

  return (
    <>
      {/* All Dates button */}
      <button
        onClick={() => onDateSelect(null)}
        style={{
          width: "100%",
          padding: "6px 0",
          marginBottom: 8,
          fontSize: 11,
          fontFamily: "monospace",
          border: `1px solid ${selectedDate === null ? theme.ACTIVE_BORDER : theme.BORDER}`,
          borderRadius: 4,
          background: selectedDate === null ? theme.ACTIVE_BG : "transparent",
          color: selectedDate === null ? theme.ACTIVE_TEXT : theme.ACCENT,
          cursor: "pointer",
        }}
      >
        All Dates
      </button>

      {/* Month navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <button
          onClick={prevMonth}
          style={{ background: "none", border: "none", color: theme.ACCENT, cursor: "pointer", fontSize: 14, padding: "2px 6px" }}
        >
          &lt;
        </button>
        <span style={{ fontSize: 12, color: theme.ACTIVE_TEXT, fontWeight: 500 }}>
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          style={{ background: "none", border: "none", color: theme.ACCENT, cursor: "pointer", fontSize: 14, padding: "2px 6px" }}
        >
          &gt;
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 30px)", gap: 1, justifyContent: "center", marginBottom: 2 }}>
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            style={{
              width: 30,
              textAlign: "center",
              fontSize: 10,
              color: theme.DIM,
              fontFamily: "monospace",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 30px)", gap: 1, justifyContent: "center" }}>
        {/* Empty cells before first day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} style={{ width: 30, height: 30 }} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = formatDate(viewYear, viewMonth, day);
          const hasData = availableSet.has(dateStr);
          const isFull = fullSet.has(dateStr);
          const isSelected = selectedDate === dateStr;
          const count = dateCounts?.[dateStr];
          // 有 fullDates 資訊時，部分資料的日期文字調暗以區分
          const isPartial = hasData && !isFull && fullSet.size > 0;
          const tooltip = hasData
            ? count !== undefined
              ? `${count} flights${isFull ? "（完整）" : "（部分）"}`
              : isFull ? "完整資料" : undefined
            : undefined;
          return (
            <button
              key={day}
              title={tooltip}
              onClick={() => {
                if (isSelected) onDateSelect(null);
                else if (hasData) onDateSelect(dateStr);
              }}
              style={{
                ...cellBase,
                background: isSelected ? theme.ACTIVE_BG : "transparent",
                color: hasData ? (isPartial ? theme.ACCENT : theme.ACTIVE_TEXT) : theme.NO_DATA_TEXT,
                cursor: hasData ? "pointer" : "default",
                fontWeight: isSelected ? 700 : 400,
              }}
            >
              {day}
              {hasData && !isSelected && (
                <span
                  style={{
                    position: "absolute",
                    bottom: 2,
                    width: isFull ? 4 : 4,
                    height: isFull ? 4 : 4,
                    borderRadius: "50%",
                    background: isFull ? theme.ACCENT_BLUE : "transparent",
                    border: isFull ? "none" : `1px solid ${theme.ACCENT_BLUE}80`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ── Color Theme Panel ────────────────────────────────────── */

type ColorThemePanelProps = Pick<IconRailSidebarProps,
  | "colorThemeKey" | "onColorThemeChange"
  | "colorThemeOverride" | "onColorThemeOverride"
  | "colorBy" | "onColorByChange"
  | "airportAssignment" | "airportColorOverrides"
  | "onAirportColorOverride" | "onAirportColorReset"
  | "compareModeActive"
> & { theme: ThemeColors };

function ColorThemePanel(props: ColorThemePanelProps) {
  const {
    colorThemeKey, onColorThemeChange, colorThemeOverride, onColorThemeOverride,
    colorBy, onColorByChange, airportAssignment, airportColorOverrides,
    onAirportColorOverride, onAirportColorReset, compareModeActive,
    theme,
  } = props;

  const entries = Object.entries(COLOR_THEMES);
  const ct: ColorTheme = colorThemeOverride ?? COLOR_THEMES[colorThemeKey] ?? COLOR_THEMES["default"]!;

  const update = (patch: Partial<ColorTheme>) => {
    onColorThemeOverride({ ...ct, ...patch });
  };

  const pickerStyle: React.CSSProperties = {
    width: 24, height: 24, padding: 0, border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 4, cursor: "pointer", background: "transparent",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: theme.DIM, fontFamily: "monospace", minWidth: 55,
  };

  return (
    <>
      <SectionHeader theme={theme}>Preset</SectionHeader>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {entries.map(([key, preset]) => {
          const active = key === colorThemeKey && !colorThemeOverride;
          return (
            <button
              key={key}
              onClick={() => onColorThemeChange(key)}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                border: `1px solid ${active ? theme.ACCENT_BLUE : theme.BORDER}`,
                background: active ? "rgba(100,160,255,0.15)" : "rgba(255,255,255,0.05)",
                color: active ? theme.ACCENT_BLUE : theme.DIM,
                fontSize: 11,
                fontFamily: "monospace",
                cursor: "pointer",
              }}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      <SectionHeader theme={theme}>Adjust</SectionHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Trail colors */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={labelStyle}>Trails</span>
          {ct.trailColors.map((c, i) => (
            <input key={i} type="color" value={c} style={pickerStyle}
              onChange={(e) => {
                const newColors = [...ct.trailColors] as [string, string, string, string, string];
                newColors[i] = e.target.value;
                update({ trailColors: newColors });
              }} />
          ))}
        </div>

        {/* Static gradient (multi-stop) */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={labelStyle}>Static</span>
          {ct.staticGradient.map((c, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
              {i > 0 && <span style={{ fontSize: 9, color: theme.DIM }}>→</span>}
              <input type="color" value={c} style={pickerStyle}
                onChange={(e) => {
                  const g = [...ct.staticGradient];
                  g[i] = e.target.value;
                  update({ staticGradient: g });
                }} />
            </span>
          ))}
          {ct.staticGradient.length < 5 && (
            <button onClick={() => update({ staticGradient: [...ct.staticGradient, ct.staticGradient[ct.staticGradient.length - 1]!] })}
              style={{ ...pickerStyle, width: 20, height: 20, fontSize: 14, color: theme.DIM, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          )}
          {ct.staticGradient.length > 2 && (
            <button onClick={() => update({ staticGradient: ct.staticGradient.slice(0, -1) })}
              style={{ ...pickerStyle, width: 20, height: 20, fontSize: 14, color: theme.DIM, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
          )}
        </div>
        <div style={{ marginLeft: 59, height: 12, borderRadius: 3, background: `linear-gradient(90deg, ${ct.staticGradient.join(", ")})`, border: "1px solid rgba(255,255,255,0.1)", marginTop: -4, marginBottom: 4 }} />

        {/* Orb glow */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={labelStyle}>Orb</span>
          <input type="color" value={ct.orbGlow} style={pickerStyle}
            onChange={(e) => update({ orbGlow: e.target.value })} />
        </div>

        {/* 2D Map trail */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={labelStyle}>2D Map</span>
          <input type="color" value={ct.mapTrailA} style={pickerStyle}
            onChange={(e) => update({ mapTrailA: e.target.value })} />
          <span style={{ fontSize: 9, color: theme.DIM }}>→</span>
          <input type="color" value={ct.mapTrailB} style={pickerStyle}
            onChange={(e) => update({ mapTrailB: e.target.value })} />
          <div style={{ flex: 1, height: 16, borderRadius: 3, background: `linear-gradient(90deg, ${ct.mapTrailA}, ${ct.mapTrailB})`, border: "1px solid rgba(255,255,255,0.1)" }} />
        </div>
      </div>

      {/* ── Compare Airports（opt-in 比較模式）─────────────── */}
      <SectionHeader theme={theme}>Compare Airports</SectionHeader>
      {compareModeActive && (
        <div style={{ fontSize: 10, color: theme.DIM, marginBottom: 6, lineHeight: 1.4 }}>
          日期 Compare 啟用時自動關閉
        </div>
      )}

      {/* 主開關（ON/OFF toggle）*/}
      <div
        onClick={() => {
          if (compareModeActive) return;
          onColorByChange(colorBy === "theme" ? "local" : "theme");
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          marginBottom: 6,
          borderRadius: 6,
          border: `1px solid ${colorBy !== "theme" ? theme.ACTIVE_BORDER : theme.BORDER}`,
          background: colorBy !== "theme" ? theme.ACTIVE_BG : "transparent",
          cursor: compareModeActive ? "not-allowed" : "pointer",
          opacity: compareModeActive ? 0.4 : 1,
          transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: 12, fontFamily: "monospace", color: theme.ACCENT }}>
          {colorBy === "theme" ? "Off" : "On"}
        </span>
        <span
          style={{
            width: 28, height: 14, borderRadius: 7,
            background: colorBy !== "theme" ? theme.ACCENT_BLUE : theme.SLIDER_TRACK,
            position: "relative", transition: "background 0.15s",
          }}
        >
          <span
            style={{
              position: "absolute", top: 1,
              left: colorBy !== "theme" ? 15 : 1,
              width: 12, height: 12, borderRadius: "50%",
              background: "#fff", transition: "left 0.15s",
              boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
            }}
          />
        </span>
      </div>

      {/* On 時才顯示維度切換 */}
      {colorBy !== "theme" && !compareModeActive && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {(["local", "origin", "dest"] as AirportColorMode[]).map((m) => {
            const label = m === "local" ? "Local" : m === "origin" ? "Origin" : "Dest";
            const active = colorBy === m;
            return (
              <button
                key={m}
                onClick={() => onColorByChange(m)}
                title={
                  m === "local" ? "區域內機場（自動挑 region 端）"
                  : m === "origin" ? "起飛機場"
                  : "目的地機場"
                }
                style={{
                  flex: 1,
                  padding: "4px 0",
                  fontSize: 10,
                  fontFamily: "monospace",
                  border: `1px solid ${active ? theme.ACTIVE_BORDER : theme.BORDER}`,
                  borderRadius: 4,
                  background: active ? theme.ACTIVE_BG : "transparent",
                  color: active ? theme.ACTIVE_TEXT : theme.DIM,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {colorBy !== "theme" && !compareModeActive && airportAssignment && (
        <>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 10, color: theme.DIM, marginBottom: 6,
          }}>
            <span>
              {airportAssignment.airports.length} airport{airportAssignment.airports.length !== 1 ? "s" : ""}
              {" · "}
              {colorBy === "local" ? "in region"
                : colorBy === "origin" ? "by departure"
                : "by arrival"}
            </span>
            {Object.keys(airportColorOverrides).length > 0 && (
              <button
                onClick={onAirportColorReset}
                style={{
                  fontSize: 10, color: theme.ACCENT_BLUE, background: "none",
                  border: "none", cursor: "pointer", padding: 0,
                  fontFamily: "monospace",
                }}
              >
                reset
              </button>
            )}
          </div>
          <div style={{
            display: "flex", flexDirection: "column", gap: 3,
            maxHeight: 220, overflowY: "auto",
            paddingRight: 2,
          }}>
            {airportAssignment.airports.map((ap) => (
              <div
                key={ap.icao}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 6px",
                  borderRadius: 4,
                  background: ap.isCustom ? theme.HOVER_BG : "transparent",
                  border: `1px solid ${ap.isCustom ? theme.BORDER : "transparent"}`,
                }}
              >
                <label
                  style={{
                    position: "relative", width: 18, height: 18, flexShrink: 0,
                    borderRadius: "50%", cursor: "pointer",
                    background: ap.palette.primary,
                    boxShadow: `0 0 6px ${ap.palette.primary}88`,
                    border: "1px solid rgba(255,255,255,0.25)",
                  }}
                  title="點擊改色"
                >
                  <input
                    type="color"
                    value={ap.palette.primary}
                    onChange={(e) => onAirportColorOverride(ap.icao, e.target.value)}
                    style={{
                      position: "absolute", inset: 0, opacity: 0,
                      width: "100%", height: "100%", cursor: "pointer",
                    }}
                  />
                </label>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: theme.ACCENT, minWidth: 42 }}>
                  {ap.icao}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: theme.DIM, fontFamily: "monospace" }}>
                  {ap.count}
                </span>
                {ap.isCustom && (
                  <button
                    onClick={() => onAirportColorOverride(ap.icao, null)}
                    style={{
                      fontSize: 10, color: theme.DIM, background: "none",
                      border: "none", cursor: "pointer", padding: "0 2px",
                    }}
                    title="恢復預設色"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {airportAssignment.airports.length === 0 && (
              <div style={{ fontSize: 10, color: theme.DIM, padding: "6px 0" }}>
                尚無航班資料
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

/* ── Summary Panel ──────────────────────────────────────── */

function StatRow({ label, value, sub, theme }: { label: string; value: string | number; sub?: string; theme: ThemeColors }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0" }}>
      <span style={{ fontSize: 11, color: theme.DIM, fontFamily: "monospace" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: theme.ACCENT, fontFamily: "monospace" }}>
        {value}
        {sub && <span style={{ fontSize: 10, color: theme.DIM, marginLeft: 4, fontWeight: 400 }}>{sub}</span>}
      </span>
    </div>
  );
}

function MiniBar({ items, theme }: { items: { label: string; value: number; color?: string }[]; theme: ThemeColors }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: theme.DIM, fontFamily: "monospace", width: 32, textAlign: "right", flexShrink: 0 }}>
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
          <span style={{ fontSize: 10, color: theme.ACCENT, fontFamily: "monospace", width: 28, textAlign: "right", flexShrink: 0 }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 24h 迷你熱力條 */
function HourlyHeatmap({ hourly, theme }: { hourly: { hour: number; count: number }[]; theme: ThemeColors }) {
  const max = Math.max(...hourly.map((h) => h.count), 1);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 1, height: 20 }}>
        {hourly.map((h) => {
          const intensity = h.count / max;
          const r = Math.round(100 + 155 * intensity);
          const g = Math.round(170 * (1 - intensity * 0.6));
          const b = 255;
          return (
            <div
              key={h.hour}
              title={`${String(h.hour).padStart(2, "0")}:00 — ${h.count} flights`}
              style={{
                flex: 1,
                borderRadius: 2,
                background: h.count > 0 ? `rgba(${r},${g},${b},${0.2 + intensity * 0.8})` : theme.SLIDER_TRACK,
                transition: "background 0.3s",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: theme.DIM, fontFamily: "monospace", marginTop: 2 }}>
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </div>
  );
}

/** 每日趨勢 SVG 折線圖 */
function DailyTrendChart({ daily, theme }: { daily: { date: string; departures: number; arrivals: number; total: number }[]; theme: ThemeColors }) {
  if (daily.length < 2) return null;
  const W = 210;
  const H = 50;
  const PAD = 2;
  const maxVal = Math.max(...daily.map((d) => d.total), 1);
  const stepX = (W - PAD * 2) / (daily.length - 1);

  const toPoints = (getValue: (d: typeof daily[0]) => number) =>
    daily.map((d, i) => `${PAD + i * stepX},${H - PAD - ((getValue(d) / maxVal) * (H - PAD * 2))}`).join(" ");

  const depPoints = toPoints((d) => d.departures);
  const arrPoints = toPoints((d) => d.arrivals);

  return (
    <div style={{ marginBottom: 8 }}>
      <svg width={W} height={H} style={{ display: "block" }}>
        <polyline points={depPoints} fill="none" stroke={theme.ACCENT_BLUE} strokeWidth="1.5" strokeLinejoin="round" />
        <polyline points={arrPoints} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="3,2" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: theme.DIM, fontFamily: "monospace", marginTop: 1 }}>
        <span>{daily[0]!.date.slice(5)}</span>
        <span style={{ display: "flex", gap: 8 }}>
          <span style={{ color: theme.ACCENT_BLUE }}>— Dep</span>
          <span style={{ color: "#f59e0b" }}>┈ Arr</span>
        </span>
        <span>{daily[daily.length - 1]!.date.slice(5)}</span>
      </div>
    </div>
  );
}

function SummaryPanel({ flights, selectedAirport, scope, region, rangeDays, theme }: {
  flights: Flight[];
  selectedAirport: string;
  scope: Scope;
  region: Region;
  rangeDays: number;
  theme: ThemeColors;
}) {
  const airportInfo = getAirportInfo(selectedAirport);
  const isAirportScope = scope === "airport";

  // Airport-level stats
  const airportStats = useMemo(() => {
    if (!isAirportScope || flights.length === 0) return null;
    const depArr = getDepArrCount(flights, selectedAirport);
    const topRoutes = computeTopRoutes(flights, selectedAirport, 5);
    const airlines = getAirlineStats(flights, selectedAirport);
    const fleetMix = getFleetMix(flights, selectedAirport);
    const durations = getFlightDurationDistribution(flights, selectedAirport);
    const hourly = computeHourlyStats(flights, selectedAirport);
    const daily = computeDailyStats(flights, selectedAirport);
    const days = getUniqueDays(flights, selectedAirport);
    const peakHour = hourly.reduce((a, b) => (b.count > a.count ? b : a), { hour: 0, count: 0 });
    const total = depArr.departures + depArr.arrivals;

    return { depArr, topRoutes, airlines, fleetMix, durations, hourly, daily, peakHour, days, total };
  }, [flights, selectedAirport, isAirportScope]);

  // Region-level stats
  const regionStats = useMemo(() => {
    if (isAirportScope || flights.length === 0) return null;
    const comparison = computeAirportComparison(flights);
    const totalFlights = flights.length;
    const domestic = flights.filter((f) => f.origin_icao.startsWith("RC") && f.dest_icao.startsWith("RC")).length;
    const international = totalFlights - domestic;
    const uniqueAirports = new Set([...flights.map((f) => f.origin_icao), ...flights.map((f) => f.dest_icao)]).size;

    return { comparison, totalFlights, domestic, international, uniqueAirports };
  }, [flights, isAirportScope]);

  if (flights.length === 0) {
    return (
      <>
        <SectionHeader theme={theme}>Summary</SectionHeader>
        <div style={{ fontSize: 11, color: theme.NO_DATA_TEXT, fontFamily: "monospace", textAlign: "center", padding: "20px 0" }}>
          No flight data loaded
        </div>
      </>
    );
  }

  // ── Airport Scope ──
  if (isAirportScope && airportStats) {
    const { depArr, topRoutes, airlines, fleetMix, durations, peakHour, days, total, hourly, daily } = airportStats;
    return (
      <>
        <SectionHeader theme={theme}>
          {airportInfo ? `${airportInfo.iata} — ${airportInfo.name}` : selectedAirport}
        </SectionHeader>

        {/* Key metrics */}
        <div style={{ marginBottom: 10, padding: "6px 8px", background: theme.HOVER_BG, borderRadius: 8 }}>
          <StatRow label="Total" value={total} sub={`${days}d`} theme={theme} />
          <StatRow label="Dep" value={depArr.departures} theme={theme} />
          <StatRow label="Arr" value={depArr.arrivals} theme={theme} />
          <StatRow label="Peak" value={`${String(peakHour.hour).padStart(2, "0")}:00`} sub={`${peakHour.count} flights`} theme={theme} />
        </div>

        {/* Hourly Heatmap */}
        <SectionHeader theme={theme}>Hourly Activity</SectionHeader>
        <HourlyHeatmap hourly={hourly} theme={theme} />

        {/* Daily Trend (only for multi-day ranges) */}
        {rangeDays > 1 && daily.length > 1 && (
          <>
            <SectionHeader theme={theme}>Daily Trend</SectionHeader>
            <DailyTrendChart daily={daily} theme={theme} />
          </>
        )}

        {/* Top Routes */}
        {topRoutes.length > 0 && (
          <>
            <SectionHeader theme={theme}>Top Routes</SectionHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 10 }}>
              {topRoutes.map((r) => (
                <div key={r.destIcao} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "monospace", padding: "2px 0" }}>
                  <span style={{ color: theme.ACCENT }}>
                    {r.originIata}→{r.destIata}
                    <span style={{ color: theme.DIM, marginLeft: 4, fontSize: 10 }}>{r.airlines.join("/")}</span>
                  </span>
                  <span style={{ color: theme.ACCENT_BLUE, fontWeight: 600 }}>{r.count}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Top Airlines */}
        {airlines.length > 0 && (
          <>
            <SectionHeader theme={theme}>Airlines</SectionHeader>
            <MiniBar
              items={airlines.slice(0, 5).map((a) => ({ label: a.code, value: a.count }))}
              theme={theme}
            />
            <div style={{ height: 8 }} />
          </>
        )}

        {/* Fleet Mix */}
        {fleetMix.length > 0 && (
          <>
            <SectionHeader theme={theme}>Fleet Mix</SectionHeader>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {fleetMix.filter((f) => f.count > 0).map((f) => (
                <div key={f.category} style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "4px 0",
                  borderRadius: 6,
                  background: theme.HOVER_BG,
                  border: `1px solid ${theme.BORDER}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.ACCENT, fontFamily: "monospace" }}>{f.percentage}%</div>
                  <div style={{ fontSize: 9, color: theme.DIM }}>{f.category}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Duration Distribution */}
        {durations.some((d) => d.count > 0) && (
          <>
            <SectionHeader theme={theme}>Duration</SectionHeader>
            <MiniBar
              items={durations.filter((d) => d.count > 0).map((d) => ({ label: d.label, value: d.count }))}
              theme={theme}
            />
          </>
        )}
      </>
    );
  }

  // ── Region Scope ──
  if (!isAirportScope && regionStats) {
    const { comparison, totalFlights, domestic, international, uniqueAirports } = regionStats;
    const regionLabel = region === "all" ? "All Regions" : region.toUpperCase();

    return (
      <>
        <SectionHeader theme={theme}>{`${regionLabel} Overview`}</SectionHeader>

        <div style={{ marginBottom: 10, padding: "6px 8px", background: theme.HOVER_BG, borderRadius: 8 }}>
          <StatRow label="Total" value={totalFlights.toLocaleString()} theme={theme} />
          <StatRow label="Airports" value={uniqueAirports} theme={theme} />
          <StatRow label="Domestic" value={domestic.toLocaleString()} theme={theme} />
          <StatRow label="Int'l" value={international.toLocaleString()} theme={theme} />
        </div>

        {/* Airport Ranking */}
        {comparison.length > 0 && (
          <>
            <SectionHeader theme={theme}>Airport Ranking</SectionHeader>
            <MiniBar
              items={comparison.slice(0, 8).map((a) => ({
                label: a.iata,
                value: a.count,
              }))}
              theme={theme}
            />
          </>
        )}
      </>
    );
  }

  return null;
}

/* ── Airspace Panel ─────────────────────────────────────── */

function AtlasPanel({
  atlasVisible,
  onAtlasVisibleChange,
  atlasGlowVisible,
  onAtlasGlowVisibleChange,
  atlasColorMode,
  onAtlasColorModeChange,
  atlasGlowSize,
  onAtlasGlowSizeChange,
  airportCatalog,
  theme,
}: {
  atlasVisible: boolean;
  onAtlasVisibleChange: (v: boolean) => void;
  atlasGlowVisible: boolean;
  onAtlasGlowVisibleChange: (v: boolean) => void;
  atlasColorMode: AtlasColorMode;
  onAtlasColorModeChange: (m: AtlasColorMode) => void;
  atlasGlowSize: number;
  onAtlasGlowSizeChange: (v: number) => void;
  airportCatalog: Record<string, AirportManifestEntry>;
  theme: ThemeColors;
}) {
  const stats = useMemo(() => {
    let complete = 0;
    let corePartial = 0;
    let partial = 0;
    for (const e of Object.values(airportCatalog)) {
      if ((e.fullDates?.length ?? 0) > 0) complete++;
      else if (e.isCore) corePartial++;
      else partial++;
    }
    return { complete, corePartial, partial };
  }, [airportCatalog]);

  const legend = [
    { color: "#2ecc71", label: "完整資料", desc: `整天完整捕捉（${stats.complete}）` },
    { color: "#f1c40f", label: "核心（部分）", desc: `主動抓但未滿整天（${stats.corePartial}）` },
    { color: "#4a90d9", label: "部分（附帶）", desc: `因航線連到而附帶（${stats.partial}）` },
    { color: "#8894a3", label: "僅規劃（未抓）", desc: "前 1000 目標、尚未抓" },
  ];

  return (
    <div>
      <SectionHeader theme={theme}>機場總覽 Atlas</SectionHeader>
      <div style={{ fontSize: 11, color: theme.DIM, lineHeight: 1.6, marginBottom: 10 }}>
        全球機場點位：圓圈大小＝單日流量、顏色＝資料完整度。點圓圈看該機場基本資料。
      </div>

      <button
        onClick={() => onAtlasVisibleChange(!atlasVisible)}
        style={{
          width: "100%",
          padding: "8px 12px",
          marginBottom: 14,
          borderRadius: 8,
          cursor: "pointer",
          border: `1px solid ${atlasVisible ? theme.ACTIVE_BORDER : theme.BORDER}`,
          background: atlasVisible ? theme.ACTIVE_BTN_BG : theme.HOVER_BG,
          color: atlasVisible ? theme.ACTIVE_TEXT : theme.DIM,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {atlasVisible ? "● 已顯示在地圖上" : "○ 在地圖上顯示機場點"}
      </button>

      <div style={{ fontSize: 11, color: theme.DIM, marginBottom: 8, fontWeight: 600 }}>顏色 = 資料完整度</div>
      {legend.map((l) => (
        <div key={l.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: l.color, marginTop: 2, flexShrink: 0, border: `1px solid ${theme.BORDER}` }} />
          <div>
            <div style={{ fontSize: 12, color: theme.ACTIVE_TEXT, fontWeight: 600 }}>{l.label}</div>
            <div style={{ fontSize: 10.5, color: theme.DIM }}>{l.desc}</div>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: theme.DIM, marginTop: 12, marginBottom: 6, fontWeight: 600 }}>大小 = 單日流量</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, paddingLeft: 2 }}>
        {[3, 8, 16].map((r, i) => (
          <div key={r} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ width: r * 2, height: r * 2, borderRadius: "50%", background: theme.DIM, opacity: 0.5 }} />
            <span style={{ fontSize: 9, color: theme.DIM }}>{["少", "中", "多"][i]}</span>
          </div>
        ))}
      </div>

      {/* ── 夜空 Bloom 星圖（與上方 circle 點並存的獨立開關）── */}
      <div style={{ borderTop: `1px solid ${theme.BORDER}`, marginTop: 18, paddingTop: 14 }}>
        <div style={{ fontSize: 12.5, color: theme.ACTIVE_TEXT, fontWeight: 700, marginBottom: 4 }}>
          ✦ 夜空 Bloom 星圖
        </div>
        <div style={{ fontSize: 11, color: theme.DIM, lineHeight: 1.6, marginBottom: 10 }}>
          把機場畫成夜空中發光的星點：越大＝流量越高。可與上方圓點並存。
        </div>

        <button
          onClick={() => onAtlasGlowVisibleChange(!atlasGlowVisible)}
          style={{
            width: "100%",
            padding: "8px 12px",
            marginBottom: 12,
            borderRadius: 8,
            cursor: "pointer",
            border: `1px solid ${atlasGlowVisible ? theme.ACTIVE_BORDER : theme.BORDER}`,
            background: atlasGlowVisible ? theme.ACTIVE_BTN_BG : theme.HOVER_BG,
            color: atlasGlowVisible ? theme.ACTIVE_TEXT : theme.DIM,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {atlasGlowVisible ? "✦ Bloom 已開啟" : "✧ 開啟 Bloom 星圖"}
        </button>

        {/* 星點大小滑桿 */}
        <div style={{ marginBottom: 12 }}>
          <SliderRow
            label="星點大小"
            value={atlasGlowSize}
            min={0.3}
            max={4}
            step={0.1}
            format={(v) => `${v.toFixed(1)}×`}
            onChange={onAtlasGlowSizeChange}
            theme={theme}
          />
        </div>

        {/* 顏色維度切換 */}
        <div style={{ fontSize: 11, color: theme.DIM, marginBottom: 6, fontWeight: 600 }}>顏色維度</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {([
            { key: "flow", label: "流量 白→橘→紅" },
            { key: "completeness", label: "資料完整度" },
          ] as const).map((opt) => {
            const active = atlasColorMode === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => onAtlasColorModeChange(opt.key)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 7,
                  cursor: "pointer",
                  border: `1px solid ${active ? theme.ACTIVE_BORDER : theme.BORDER}`,
                  background: active ? theme.ACTIVE_BTN_BG : theme.HOVER_BG,
                  color: active ? theme.ACTIVE_TEXT : theme.DIM,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* 動態圖例 */}
        {atlasColorMode === "flow" ? (
          <div>
            <div
              style={{
                height: 12,
                borderRadius: 6,
                marginBottom: 5,
                background: "linear-gradient(90deg, #ffffff 0%, #ff8c1a 50%, #ff1e1e 100%)",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: theme.DIM }}>
              <span>流量低 · 白</span>
              <span>中 · 橘</span>
              <span>樞紐 · 紅</span>
            </div>
          </div>
        ) : (
          legend.map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 11, height: 11, borderRadius: "50%", background: l.color, marginTop: 2, flexShrink: 0, border: `1px solid ${theme.BORDER}` }} />
              <div>
                <div style={{ fontSize: 12, color: theme.ACTIVE_TEXT, fontWeight: 600 }}>{l.label}</div>
                <div style={{ fontSize: 10.5, color: theme.DIM }}>{l.desc}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AirspacePanel({
  settings,
  onChange,
  theme,
}: {
  settings: AirspaceSettings;
  onChange: (s: AirspaceSettings) => void;
  theme: ThemeColors;
}) {
  const update = (patch: Partial<AirspaceSettings>) => onChange({ ...settings, ...patch });
  const toggleCategory = (cat: AirspaceCategory) => {
    onChange({
      ...settings,
      visibility: { ...settings.visibility, [cat]: !settings.visibility[cat] },
    });
  };

  // 分類色點（依主題）
  const getSwatchColor = (cat: AirspaceCategory) => {
    const conf = AIRSPACE_CATEGORIES.find((c) => c.id === cat)!;
    const rgb = conf.colorDark;
    return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
  };

  return (
    <>
      <SectionHeader theme={theme}>Airspace</SectionHeader>

      {/* 總開關 */}
      <div
        onClick={() => update({ enabled: !settings.enabled })}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          marginBottom: 8,
          borderRadius: 6,
          border: `1px solid ${settings.enabled ? theme.ACTIVE_BORDER : theme.BORDER}`,
          background: settings.enabled ? theme.ACTIVE_BG : "transparent",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: 12, fontFamily: "monospace", color: theme.ACCENT }}>
          Show Airspace
        </span>
        <span
          style={{
            width: 28,
            height: 14,
            borderRadius: 7,
            background: settings.enabled ? theme.ACCENT_BLUE : theme.SLIDER_TRACK,
            position: "relative",
            transition: "background 0.15s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 1,
              left: settings.enabled ? 15 : 1,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.15s",
              boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
            }}
          />
        </span>
      </div>

      {/* 分類 */}
      <SectionHeader theme={theme}>Layers</SectionHeader>
      {AIRSPACE_CATEGORIES.map((conf) => {
        const isOn = settings.visibility[conf.id];
        return (
          <div
            key={conf.id}
            onClick={() => toggleCategory(conf.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              marginBottom: 4,
              borderRadius: 4,
              cursor: settings.enabled ? "pointer" : "not-allowed",
              opacity: settings.enabled ? 1 : 0.4,
              background: isOn ? theme.HOVER_BG : "transparent",
              border: `1px solid ${isOn ? theme.BORDER : "transparent"}`,
              transition: "background 0.15s",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: getSwatchColor(conf.id),
                boxShadow: isOn ? `0 0 6px ${getSwatchColor(conf.id)}` : "none",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                flex: 1,
                fontSize: 11,
                fontFamily: "monospace",
                color: isOn ? theme.ACTIVE_TEXT : theme.DIM,
              }}
            >
              {conf.label}
            </span>
            <span style={{ fontSize: 10, color: theme.DIM }}>{isOn ? "●" : "○"}</span>
          </div>
        );
      })}

      {/* Overlays */}
      <SectionHeader theme={theme}>Overlays</SectionHeader>
      <div
        onClick={() => settings.enabled && update({ showMedianLine: !settings.showMedianLine })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          marginBottom: 8,
          borderRadius: 4,
          cursor: settings.enabled ? "pointer" : "not-allowed",
          opacity: settings.enabled ? 1 : 0.4,
          background: settings.showMedianLine ? theme.HOVER_BG : "transparent",
          border: `1px solid ${settings.showMedianLine ? theme.BORDER : "transparent"}`,
          transition: "background 0.15s",
        }}
      >
        <span
          style={{
            width: 18,
            height: 2,
            background: settings.showMedianLine ? "#ffffff" : theme.DIM,
            boxShadow: settings.showMedianLine ? "0 0 6px rgba(255,255,255,0.6)" : "none",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontFamily: "monospace",
            color: settings.showMedianLine ? theme.ACTIVE_TEXT : theme.DIM,
          }}
        >
          海峽中線 Median Line
        </span>
        <span style={{ fontSize: 10, color: theme.DIM }}>{settings.showMedianLine ? "●" : "○"}</span>
      </div>

      {/* Style */}
      <SectionHeader theme={theme}>Style</SectionHeader>
      <SliderRow
        label="Opacity"
        value={settings.opacity}
        min={0}
        max={1}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => update({ opacity: v })}
        theme={theme}
      />
      <SliderRow
        label="Height Scale"
        value={settings.heightScale}
        min={0.5}
        max={5}
        step={0.1}
        format={(v) => `${v.toFixed(1)}×`}
        onChange={(v) => update({ heightScale: v })}
        theme={theme}
      />
      <SliderRow
        label="Edge Glow"
        value={settings.edgeGlow}
        min={0}
        max={2}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(v) => update({ edgeGlow: v })}
        theme={theme}
      />
    </>
  );
}

function IconAirspace() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 3 20 8 20 16 12 21 4 16 4 8 12 3" />
      <path d="M12 3v18" opacity="0.5" />
      <path d="M4 8l16 8" opacity="0.3" />
      <path d="M20 8L4 16" opacity="0.3" />
    </svg>
  );
}

/* ── Main Component ──────────────────────────────────────── */

export function IconRailSidebar(props: IconRailSidebarProps) {
  const [activePanel, setActivePanel] = useState<PanelId | null>("settings");
  const theme = getThemeColors(props.isDarkTheme);

  const togglePanel = (id: PanelId) => {
    setActivePanel((prev) => (prev === id ? null : id));
  };

  const panelStyle: CSSProperties = {
    position: "absolute",
    left: RAIL_WIDTH + 8,
    top: 116,
    zIndex: 20,
    width: PANEL_WIDTH,
    maxHeight: "70vh",
    overflowY: "auto",
    background: theme.BG_PANEL,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: `1px solid ${theme.BORDER}`,
    borderRadius: 12,
    padding: "12px 14px",
    color: theme.ACCENT,
    animation: "iconRailFadeIn 0.25s ease-out",
  };

  return (
    <>
      <style>{FADE_KEYFRAMES}</style>

      {/* Icon Rail (top icons) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: RAIL_WIDTH,
          zIndex: 20,
          background: theme.BG_RAIL,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 36,
          paddingBottom: 8,
          borderRight: `1px solid ${theme.BORDER}`,
          borderBottom: `1px solid ${theme.BORDER}`,
          borderRadius: "0 0 8px 0",
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.ACCENT_BLUE,
          }}
        >
          <IconActivity />
        </div>

        {/* Separator */}
        <div
          style={{
            width: 28,
            height: 1,
            background: theme.BORDER,
            margin: "8px 0",
          }}
        />

        {/* Settings */}
        <RailIcon
          active={activePanel === "settings"}
          onClick={() => togglePanel("settings")}
          title="Settings"
          theme={theme}
        >
          <IconSettings />
        </RailIcon>

        {/* Locations */}
        <RailIcon
          active={activePanel === "locations"}
          onClick={() => togglePanel("locations")}
          title="Locations"
          theme={theme}
        >
          <IconMapPin />
        </RailIcon>

        {/* Sets (multi-airport view) */}
        <RailIcon
          active={activePanel === "sets" || props.airportSet !== null}
          onClick={() => togglePanel("sets")}
          title="Multi-Airport Sets"
          theme={theme}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </RailIcon>

        {/* Calendar */}
        <RailIcon
          active={activePanel === "calendar"}
          onClick={() => togglePanel("calendar")}
          title="Calendar"
          theme={theme}
        >
          <IconCalendar />
        </RailIcon>

        {/* Colors */}
        <RailIcon
          active={activePanel === "colors"}
          onClick={() => togglePanel("colors")}
          title="Color Theme"
          theme={theme}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="13.5" r="2.5"/><circle cx="6.5" cy="10.5" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>
        </RailIcon>

        {/* Airspace */}
        <RailIcon
          active={activePanel === "airspace"}
          onClick={() => togglePanel("airspace")}
          title="Airspace"
          theme={theme}
        >
          <IconAirspace />
        </RailIcon>

        {/* Summary */}
        <RailIcon
          active={activePanel === "summary"}
          onClick={() => togglePanel("summary")}
          title="Summary"
          theme={theme}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </RailIcon>

        {/* Deep Analysis (🔬) */}
        <RailIcon
          active={activePanel === "analysis" || props.analysisColorBy !== "none"}
          onClick={() => togglePanel("analysis")}
          title="Deep Analysis"
          theme={theme}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </RailIcon>

        {/* Atlas 機場總覽 (🗺️) */}
        <RailIcon
          active={activePanel === "atlas" || props.atlasVisible}
          onClick={() => togglePanel("atlas")}
          title="Airport Atlas"
          theme={theme}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="4" ry="9" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="4.5" y1="7" x2="19.5" y2="7" />
            <line x1="4.5" y1="17" x2="19.5" y2="17" />
          </svg>
        </RailIcon>

        {/* Stats */}
        <RailIcon
          active={false}
          onClick={props.onStatsClick}
          title="Statistics"
          theme={theme}
        >
          <IconBarChart />
        </RailIcon>
      </div>

      {/* Floating Panel */}
      {activePanel !== null && (
        <div style={panelStyle}>
          {/* Close button */}
          <button
            onClick={() => setActivePanel(null)}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: theme.CLOSE_BG,
              border: `1px solid ${theme.CLOSE_BORDER}`,
              color: theme.DIM,
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1,
            }}
          >
            ✕
          </button>
          {activePanel === "settings" && <SettingsPanel {...props} theme={theme} />}
          {activePanel === "locations" && (
            <LocationsPanel
              airports={props.airports}
              airportCatalog={props.airportCatalog}
              airportMeta={props.airportMeta}
              selectedAirport={props.selectedAirport}
              onAirportChange={props.onAirportChange}
              onLocationJump={props.onLocationJump}
              onSceneSelect={props.onSceneSelect}
              region={props.region}
              theme={theme}
            />
          )}
          {activePanel === "sets" && (
            <SetsPanel
              airports={props.airports}
              region={props.region}
              airportSet={props.airportSet ?? []}
              setName={props.setName}
              savedSets={props.savedSets}
              onApplySet={props.onApplySet}
              onToggleAirport={props.onToggleAirportInSet}
              onClearSet={props.onClearSet}
              onExitSetMode={props.onExitSetMode}
              theme={theme}
            />
          )}
          {activePanel === "calendar" && (
            <CalendarPanel
              availableDates={props.availableDates}
              fullDates={props.fullDates}
              dateCounts={props.dateCounts}
              selectedDate={props.selectedDate}
              onDateSelect={props.onDateSelect}
              theme={theme}
            />
          )}
          {activePanel === "colors" && (
            <ColorThemePanel
              colorThemeKey={props.colorThemeKey}
              onColorThemeChange={props.onColorThemeChange}
              colorThemeOverride={props.colorThemeOverride}
              onColorThemeOverride={props.onColorThemeOverride}
              colorBy={props.colorBy}
              onColorByChange={props.onColorByChange}
              airportAssignment={props.airportAssignment}
              airportColorOverrides={props.airportColorOverrides}
              onAirportColorOverride={props.onAirportColorOverride}
              onAirportColorReset={props.onAirportColorReset}
              compareModeActive={props.compareModeActive}
              theme={theme}
            />
          )}
          {activePanel === "airspace" && (
            <AirspacePanel
              settings={props.airspaceSettings}
              onChange={props.onAirspaceSettingsChange}
              theme={theme}
            />
          )}
          {activePanel === "summary" && (
            <SummaryPanel
              flights={props.summaryFlights}
              selectedAirport={props.selectedAirport}
              scope={props.scope}
              region={props.region}
              rangeDays={props.rangeDays}
              theme={theme}
            />
          )}
          {activePanel === "analysis" && (
            <DeepAnalysisPanel
              filteredFlights={props.analysisFilteredFlights}
              preFilterFlights={props.analysisPreFilterFlights}
              colorBy={props.analysisColorBy}
              onColorByChange={props.onAnalysisColorByChange}
              filters={props.flightFilters}
              onFiltersChange={props.onFlightFiltersChange}
              scaleByAircraftSize={props.scaleByAircraftSize}
              onScaleByAircraftSizeChange={props.onScaleByAircraftSizeChange}
              isDarkTheme={props.isDarkTheme}
              theme={theme}
            />
          )}
          {activePanel === "atlas" && (
            <AtlasPanel
              atlasVisible={props.atlasVisible}
              onAtlasVisibleChange={props.onAtlasVisibleChange}
              atlasGlowVisible={props.atlasGlowVisible}
              onAtlasGlowVisibleChange={props.onAtlasGlowVisibleChange}
              atlasColorMode={props.atlasColorMode}
              onAtlasColorModeChange={props.onAtlasColorModeChange}
              atlasGlowSize={props.atlasGlowSize}
              onAtlasGlowSizeChange={props.onAtlasGlowSizeChange}
              airportCatalog={props.airportCatalog}
              theme={theme}
            />
          )}
        </div>
      )}
    </>
  );
}
