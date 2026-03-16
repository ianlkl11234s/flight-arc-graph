import { useState, type CSSProperties, type ReactNode } from "react";
import type { DataSource, DisplayMode, Region, RenderMode, Scope, TrackMode, Flight } from "../types";
import type { AircraftFilterKey } from "../data/aircraftCategories";
import { StyleSelector } from "./StyleSelector";
import { CAMERA_PRESETS, getAirportInfo } from "../map/cameraPresets";

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

type PanelId = "settings" | "locations" | "calendar";

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
  viewshedOpacity: number;
  onViewshedOpacityChange: (v: number) => void;
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
  selectedAirport: string;
  onAirportChange: (icao: string) => void;
  onLocationJump: (icao: string) => void;
  onSceneSelect: (scene: ScenePreset) => void;
  // Calendar
  availableDates: string[];
  /** 完整資料的日期（實心標記） */
  fullDates: string[];
  selectedDate: string | null;
  onDateSelect: (date: string | null) => void;
  // Stats
  onStatsClick: () => void;
  // Info
  onInfoClick: () => void;
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
          { value: "region", label: props.region === "all" ? "All Regions" : props.region === "world" ? "All World" : `All ${props.region === "TW" ? "Taiwan" : props.region === "JP" ? "Japan" : "Hong Kong"}` },
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
        min={0} max={200} step={50}
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
        <SliderRow
          label="View"
          value={props.viewshedOpacity}
          min={0} max={1} step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={props.onViewshedOpacityChange}
          theme={theme}
        />
      )}
    </>
  );
}

function AirportButton({ preset, isActive, onAirportChange, onLocationJump, theme }: {
  preset: { icao: string; name: string };
  isActive: boolean;
  onAirportChange: (icao: string) => void;
  onLocationJump: (icao: string) => void;
  theme: ThemeColors;
}) {
  const info = getAirportInfo(preset.icao);
  return (
    <button
      onClick={() => { onAirportChange(preset.icao); onLocationJump(preset.icao); }}
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
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: isActive ? theme.ACTIVE_TEXT : theme.ACCENT, lineHeight: 1.3 }}>
          {info?.name ?? preset.name}
        </div>
        <div style={{ fontSize: 10, color: theme.DIM, fontFamily: "monospace" }}>
          {info?.iata ?? preset.icao} / {preset.icao}
        </div>
      </div>
    </button>
  );
}

const KNOWN_PREFIXES = ["RC", "RJ", "RO", "VH"];
const REGION_ICAO_MATCH: Record<string, (icao: string) => boolean> = {
  TW: (icao) => icao.startsWith("RC"),
  JP: (icao) => icao.startsWith("RJ") || icao.startsWith("RO"),
  HK: (icao) => icao.startsWith("VH"),
  world: (icao) => !KNOWN_PREFIXES.some((p) => icao.startsWith(p)),
  all: () => true,
};

const REGION_LABELS: Record<string, string> = {
  TW: "台灣 Taiwan",
  JP: "日本 Japan",
  HK: "香港 Hong Kong",
  world: "World",
};

function LocationsPanel({
  airports,
  selectedAirport,
  onAirportChange,
  onLocationJump,
  onSceneSelect,
  region,
  theme,
}: Pick<IconRailSidebarProps, "airports" | "selectedAirport" | "onAirportChange" | "onLocationJump" | "onSceneSelect" | "region"> & { theme: ThemeColors }) {
  // Use CAMERA_PRESETS order, filtered by available airports + region
  const available = new Set(airports);
  const matchRegion = REGION_ICAO_MATCH[region] || (() => true);
  const ordered = CAMERA_PRESETS.filter((p) => available.has(p.icao) && matchRegion(p.icao));

  // Group by region when "all"
  const groupedByRegion = region === "all"
    ? (["TW", "JP", "HK", "world"] as const).map((r) => ({
        key: r,
        label: REGION_LABELS[r],
        presets: CAMERA_PRESETS.filter((p) => available.has(p.icao) && REGION_ICAO_MATCH[r]!(p.icao)),
      })).filter((g) => g.presets.length > 0)
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

      {/* 機場列表 */}
      {groupedByRegion ? (
        /* All regions: grouped */
        groupedByRegion.map((group) => (
          <div key={group.key}>
            <div style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2, textTransform: "uppercase", padding: "6px 8px 2px" }}>
              {group.label} ({group.presets.length})
            </div>
            {group.presets.map((preset) => (
              <AirportButton key={preset.icao} preset={preset} isActive={preset.icao === selectedAirport} onAirportChange={onAirportChange} onLocationJump={onLocationJump} theme={theme} />
            ))}
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
                  <AirportButton key={preset.icao} preset={preset} isActive={preset.icao === selectedAirport} onAirportChange={onAirportChange} onLocationJump={onLocationJump} theme={theme} />
                ))}
              </div>
            );
          })}
        </>
      ) : (
        /* Other single region */
        <>
          <div style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2, textTransform: "uppercase", padding: "2px 8px 2px" }}>
            機場 Airport ({ordered.length})
          </div>
          {ordered.map((preset) => (
            <AirportButton key={preset.icao} preset={preset} isActive={preset.icao === selectedAirport} onAirportChange={onAirportChange} onLocationJump={onLocationJump} theme={theme} />
          ))}
        </>
      )}
    </div>
  );
}

function CalendarPanel({
  availableDates,
  fullDates,
  selectedDate,
  onDateSelect,
  theme,
}: Pick<IconRailSidebarProps, "availableDates" | "fullDates" | "selectedDate" | "onDateSelect"> & { theme: ThemeColors }) {
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
          return (
            <button
              key={day}
              onClick={() => {
                if (isSelected) onDateSelect(null);
                else if (hasData) onDateSelect(dateStr);
              }}
              style={{
                ...cellBase,
                background: isSelected ? theme.ACTIVE_BG : "transparent",
                color: hasData ? theme.ACTIVE_TEXT : theme.NO_DATA_TEXT,
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

        {/* Calendar */}
        <RailIcon
          active={activePanel === "calendar"}
          onClick={() => togglePanel("calendar")}
          title="Calendar"
          theme={theme}
        >
          <IconCalendar />
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
              selectedAirport={props.selectedAirport}
              onAirportChange={props.onAirportChange}
              onLocationJump={props.onLocationJump}
              onSceneSelect={props.onSceneSelect}
              region={props.region}
              theme={theme}
            />
          )}
          {activePanel === "calendar" && (
            <CalendarPanel
              availableDates={props.availableDates}
              fullDates={props.fullDates}
              selectedDate={props.selectedDate}
              onDateSelect={props.onDateSelect}
              theme={theme}
            />
          )}
        </div>
      )}
    </>
  );
}
