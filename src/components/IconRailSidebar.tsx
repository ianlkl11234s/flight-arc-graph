import { useState, type CSSProperties, type ReactNode } from "react";
import type { DisplayMode, RenderMode, DataSource } from "../types";
import type { AircraftFilterKey, AircraftCategory } from "../data/aircraftCategories";
import { AIRCRAFT_CATEGORIES } from "../data/aircraftCategories";
import { StyleSelector } from "./StyleSelector";
import { CAMERA_PRESETS, getAirportInfo } from "../map/cameraPresets";

/* ── Style constants ─────────────────────────────────────── */

const RAIL_WIDTH = 56;
const PANEL_WIDTH = 240;
const ACCENT = "#E5E7EB";
const BG_RAIL = "#0D0E10";
const BG_PANEL = "rgba(0, 0, 0, 0.45)";
const BORDER = "#2A2D32";
const DIM = "#6B7280";

const CATEGORY_ORDER: AircraftCategory[] = [
  "military",
  "business-jet",
  "helicopter",
  "training",
  "china-domestic",
];

const ALL_SPECIAL = new Set(
  Object.values(AIRCRAFT_CATEGORIES).flatMap((c) => c.types),
);

/* ── Types ───────────────────────────────────────────────── */

type PanelId = "settings" | "locations" | "calendar";

export interface IconRailSidebarProps {
  // Settings panel controls
  displayMode: DisplayMode;
  renderMode: RenderMode;
  dataSource: DataSource;
  aircraftFilter: AircraftFilterKey;
  hasFused: boolean;
  availableTypes: string[];
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
  onDataSourceChange: (source: DataSource) => void;
  onAircraftFilterChange: (filter: AircraftFilterKey) => void;
  onMapStyleChange: (id: string) => void;
  onAltExaggerationChange: (v: number) => void;
  onAltOffsetChange: (v: number) => void;
  onStaticOpacityChange: (v: number) => void;
  onOrbScaleChange: (v: number) => void;
  onAirportOpacityChange: (v: number) => void;
  onAirportGlowChange: (v: number) => void;
  // Locations
  airports: string[];
  selectedAirport: string;
  onAirportChange: (icao: string) => void;
  onLocationJump: (icao: string) => void;
  // Calendar
  availableDates: string[];
  selectedDate: string | null;
  onDateSelect: (date: string | null) => void;
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
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
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
        color: active ? "#fff" : DIM,
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
            background: "#64aaff",
          }}
        />
      )}
      {children}
    </button>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: DIM,
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
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabledValues?: Set<T>;
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
              border: `1px solid ${isActive ? "#64aaff" : BORDER}`,
              borderRadius: 4,
              background: isActive ? "rgba(100,170,255,0.2)" : "transparent",
              color: isDisabled ? "#444" : isActive ? "#fff" : ACCENT,
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
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
          color: ACCENT,
          marginBottom: 2,
        }}
      >
        <span>{label}</span>
        <span style={{ color: DIM }}>{display}</span>
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
          background: "#333",
          borderRadius: 2,
          outline: "none",
          cursor: "pointer",
          accentColor: "#64aaff",
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

function IconInfo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

/* ── Panel contents ──────────────────────────────────────── */

function SettingsPanel(props: IconRailSidebarProps) {
  const specialInData = props.availableTypes.filter((t) => ALL_SPECIAL.has(t));
  const categoriesInData = CATEGORY_ORDER.filter((cat) =>
    AIRCRAFT_CATEGORIES[cat].types.some((t) => props.availableTypes.includes(t)),
  );
  const hasSpecial = specialInData.length > 0;

  const disabledSources = new Set<DataSource>();
  if (!props.hasFused) disabledSources.add("fused");

  return (
    <>
      <SectionHeader>Display</SectionHeader>
      <ToggleButtons<DisplayMode>
        options={[
          { value: "trails", label: "Flight Trails" },
          { value: "status", label: "Live Status" },
        ]}
        value={props.displayMode}
        onChange={props.onDisplayModeChange}
      />
      <ToggleButtons<RenderMode>
        options={[
          { value: "3d", label: "3D Altitude" },
          { value: "2d", label: "2D Flat" },
        ]}
        value={props.renderMode}
        onChange={props.onRenderModeChange}
      />

      <SectionHeader>Data</SectionHeader>
      <ToggleButtons<DataSource>
        options={[
          { value: "api", label: "API Tracks" },
          { value: "fused", label: "Fused Snapshot" },
        ]}
        value={props.dataSource}
        onChange={props.onDataSourceChange}
        disabledValues={disabledSources}
      />
      <select
        value={props.aircraftFilter}
        onChange={(e) => props.onAircraftFilterChange(e.target.value as AircraftFilterKey)}
        style={{
          width: "100%",
          background: props.aircraftFilter !== "all" ? "rgba(100,170,255,0.2)" : "rgba(0,0,0,0.4)",
          color: "#fff",
          border: `1px solid ${props.aircraftFilter !== "all" ? "rgba(100,170,255,0.5)" : BORDER}`,
          borderRadius: 4,
          padding: "5px 6px",
          fontSize: 11,
          fontFamily: "monospace",
          cursor: "pointer",
          marginBottom: 8,
        }}
      >
        <option value="all">All Types</option>
        {hasSpecial && (
          <>
            <option disabled>──────────</option>
            <option value="all-special">All Special</option>
            {categoriesInData.map((cat) => (
              <option key={cat} value={`cat:${cat}`}>
                {AIRCRAFT_CATEGORIES[cat].label}
              </option>
            ))}
          </>
        )}
        {specialInData.length > 0 && (
          <>
            <option disabled>──────────</option>
            {specialInData.sort().map((t) => (
              <option key={t} value={`type:${t}`}>
                {t}
              </option>
            ))}
          </>
        )}
      </select>

      <SectionHeader>Map</SectionHeader>
      <div style={{ marginBottom: 8 }}>
        <StyleSelector
          selected={props.mapStyleId}
          isDarkTheme
          onChange={props.onMapStyleChange}
        />
      </div>

      <SectionHeader>Visual</SectionHeader>
      <SliderRow
        label="Alt"
        value={props.altExaggeration}
        min={1} max={5} step={0.5}
        format={(v) => `\u00d7${v}`}
        onChange={props.onAltExaggerationChange}
      />
      <SliderRow
        label="Z"
        value={props.altOffset}
        min={0} max={200} step={50}
        format={(v) => `+${v}m`}
        onChange={props.onAltOffsetChange}
      />
      <SliderRow
        label="Opacity"
        value={props.staticOpacity}
        min={0.02} max={0.5} step={0.02}
        format={(v) => v.toFixed(2)}
        onChange={props.onStaticOpacityChange}
      />
      <SliderRow
        label="Orb"
        value={props.orbScale}
        min={0.000001} max={0.00001} step={0.000001}
        format={(v) => v.toFixed(6)}
        onChange={props.onOrbScaleChange}
      />
      <SliderRow
        label="APT"
        value={props.airportOpacity}
        min={0} max={0.3} step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={props.onAirportOpacityChange}
      />
      <SliderRow
        label="Glow"
        value={props.airportGlow}
        min={0} max={2} step={0.1}
        format={(v) => v.toFixed(1)}
        onChange={props.onAirportGlowChange}
      />
    </>
  );
}

function LocationsPanel({
  airports,
  selectedAirport,
  onAirportChange,
  onLocationJump,
}: Pick<IconRailSidebarProps, "airports" | "selectedAirport" | "onAirportChange" | "onLocationJump">) {
  // Use CAMERA_PRESETS order, filtered by available airports
  const available = new Set(airports);
  const ordered = CAMERA_PRESETS.filter((p) => available.has(p.icao));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {ordered.map((preset) => {
        const info = getAirportInfo(preset.icao);
        const isActive = preset.icao === selectedAirport;
        return (
          <button
            key={preset.icao}
            onClick={() => {
              onAirportChange(preset.icao);
              onLocationJump(preset.icao);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              background: isActive ? "rgba(100,170,255,0.15)" : "transparent",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              textAlign: "left",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = "transparent";
            }}
          >
            <span
              style={{
                width: 3,
                height: 24,
                borderRadius: 2,
                background: isActive ? "#64aaff" : BORDER,
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: isActive ? "#fff" : ACCENT, lineHeight: 1.3 }}>
                {info?.name ?? preset.name}
              </div>
              <div style={{ fontSize: 10, color: DIM, fontFamily: "monospace" }}>
                {info?.iata ?? preset.icao} / {preset.icao}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CalendarPanel({
  availableDates,
  selectedDate,
  onDateSelect,
}: Pick<IconRailSidebarProps, "availableDates" | "selectedDate" | "onDateSelect">) {
  const availableSet = new Set(availableDates);

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
    color: ACCENT,
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
          border: `1px solid ${selectedDate === null ? "#64aaff" : BORDER}`,
          borderRadius: 4,
          background: selectedDate === null ? "rgba(100,170,255,0.2)" : "transparent",
          color: selectedDate === null ? "#fff" : ACCENT,
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
          style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 14, padding: "2px 6px" }}
        >
          &lt;
        </button>
        <span style={{ fontSize: 12, color: "#fff", fontWeight: 500 }}>
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 14, padding: "2px 6px" }}
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
              color: DIM,
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
                background: isSelected ? "rgba(100,170,255,0.35)" : "transparent",
                color: hasData ? "#fff" : "#444",
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
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "#64aaff",
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

  const togglePanel = (id: PanelId) => {
    setActivePanel((prev) => (prev === id ? null : id));
  };

  const panelStyle: CSSProperties = {
    position: "absolute",
    left: RAIL_WIDTH + 8,
    top: 92,
    zIndex: 20,
    width: PANEL_WIDTH,
    maxHeight: "70vh",
    overflowY: "auto",
    background: BG_PANEL,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: "12px 14px",
    color: ACCENT,
    animation: "iconRailFadeIn 0.25s ease-out",
  };

  return (
    <>
      <style>{FADE_KEYFRAMES}</style>

      {/* Icon Rail */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: RAIL_WIDTH,
          zIndex: 20,
          background: BG_RAIL,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 12,
          paddingBottom: 12,
          borderRight: `1px solid ${BORDER}`,
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
            color: "#64aaff",
          }}
        >
          <IconActivity />
        </div>

        {/* Separator */}
        <div
          style={{
            width: 28,
            height: 1,
            background: BORDER,
            margin: "8px 0",
          }}
        />

        {/* Settings */}
        <RailIcon
          active={activePanel === "settings"}
          onClick={() => togglePanel("settings")}
          title="Settings"
        >
          <IconSettings />
        </RailIcon>

        {/* Locations */}
        <RailIcon
          active={activePanel === "locations"}
          onClick={() => togglePanel("locations")}
          title="Locations"
        >
          <IconMapPin />
        </RailIcon>

        {/* Calendar */}
        <RailIcon
          active={activePanel === "calendar"}
          onClick={() => togglePanel("calendar")}
          title="Calendar"
        >
          <IconCalendar />
        </RailIcon>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Info */}
        <RailIcon
          active={false}
          onClick={props.onInfoClick}
          title="Info"
        >
          <IconInfo />
        </RailIcon>
      </div>

      {/* Floating Panel */}
      {activePanel !== null && (
        <div style={panelStyle}>
          {activePanel === "settings" && <SettingsPanel {...props} />}
          {activePanel === "locations" && (
            <LocationsPanel
              airports={props.airports}
              selectedAirport={props.selectedAirport}
              onAirportChange={props.onAirportChange}
              onLocationJump={props.onLocationJump}
            />
          )}
          {activePanel === "calendar" && (
            <CalendarPanel
              availableDates={props.availableDates}
              selectedDate={props.selectedDate}
              onDateSelect={props.onDateSelect}
            />
          )}
        </div>
      )}
    </>
  );
}
