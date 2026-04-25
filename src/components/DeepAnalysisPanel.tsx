/**
 * Deep Analysis Panel（🔬）
 *
 * Phase 2c：colorBy dropdown + legend
 * Phase 2d：filter chips（機型/航司/用途/航線）+ duration slider + quick toggles
 */

import { useMemo, useState, type CSSProperties } from "react";
import type { Flight } from "../types";
import {
  COLOR_BY_OPTIONS,
  getAnalysisLegend,
  type AnalysisColorBy,
} from "../data/analysisColors";
import {
  type FlightFilters,
  type FlightPurpose,
  type RouteScope,
  PURPOSE_LABELS,
  ROUTE_SCOPE_LABELS,
  EMPTY_FILTERS,
} from "../data/classify";
import { AIRLINE_DB } from "../data/airlineDatabase";
import { getAircraftInfo } from "../data/aircraftDatabase";

interface ThemeColors {
  ACCENT: string;
  BORDER: string;
  DIM: string;
  ACTIVE_TEXT: string;
  ACTIVE_BG: string;
  ACTIVE_BORDER: string;
  HOVER_BG: string;
  SELECT_BG: string;
}

export interface DeepAnalysisPanelProps {
  /** 已套用 filter 的 flights（給 legend / count） */
  filteredFlights: Flight[];
  /** 套 filter 之前的 flights（給 "可選" 列表 + total count） */
  preFilterFlights: Flight[];
  // colorBy
  colorBy: AnalysisColorBy;
  onColorByChange: (v: AnalysisColorBy) => void;
  // filters
  filters: FlightFilters;
  onFiltersChange: (f: FlightFilters) => void;
  isDarkTheme: boolean;
  theme: ThemeColors;
}

// ─── 通用：toggle 一個 Set 的元素 ─────────────────────────
function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// ─── 子元件：折疊 Section ───────────────────────────────
function Section({
  title,
  badge,
  expanded,
  onToggle,
  theme,
  children,
}: {
  title: string;
  badge?: number;
  expanded: boolean;
  onToggle: () => void;
  theme: ThemeColors;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 6px",
          background: "transparent",
          border: `1px solid ${theme.BORDER}`,
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 11,
          fontFamily: "monospace",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: theme.ACCENT,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, color: theme.DIM }}>
            {expanded ? "▼" : "▶"}
          </span>
          {title}
        </span>
        {badge !== undefined && badge > 0 && (
          <span
            style={{
              fontSize: 10,
              background: theme.ACTIVE_BG,
              color: theme.ACTIVE_BORDER,
              border: `1px solid ${theme.ACTIVE_BORDER}`,
              borderRadius: 8,
              padding: "1px 6px",
              fontWeight: 600,
            }}
          >
            {badge}
          </span>
        )}
      </button>
      {expanded && <div style={{ marginTop: 4, paddingLeft: 4 }}>{children}</div>}
    </div>
  );
}

// ─── 子元件：Multi-checkbox 列表 ────────────────────────
function MultiCheckList({
  items,
  selected,
  onToggle,
  theme,
  maxHeight = 200,
}: {
  items: Array<{ key: string; label: string; count: number; sub?: string }>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  theme: ThemeColors;
  maxHeight?: number;
}) {
  if (items.length === 0) {
    return <div style={{ fontSize: 10, color: theme.DIM, padding: "4px 0" }}>(no data)</div>;
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        maxHeight,
        overflowY: "auto",
        gap: 1,
      }}
    >
      {items.map((it) => {
        const on = selected.has(it.key);
        return (
          <label
            key={it.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 4px",
              fontSize: 11,
              fontFamily: "monospace",
              cursor: "pointer",
              color: on ? theme.ACTIVE_TEXT : theme.ACCENT,
              background: on ? theme.ACTIVE_BG : "transparent",
              borderRadius: 2,
            }}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggle(it.key)}
              style={{ margin: 0, cursor: "pointer", accentColor: theme.ACTIVE_BORDER }}
            />
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={`${it.label}${it.sub ? " · " + it.sub : ""}`}
            >
              {it.label}
              {it.sub && <span style={{ color: theme.DIM, marginLeft: 4 }}>· {it.sub}</span>}
            </span>
            <span style={{ color: theme.DIM, fontSize: 10 }}>{it.count}</span>
          </label>
        );
      })}
    </div>
  );
}

// ─── 子元件：toggleable 小 chip 群組 ───────────────────
function ChipGroup<T extends string>({
  options,
  selected,
  onToggle,
  theme,
}: {
  options: Array<{ key: T; label: string }>;
  selected: Set<T>;
  onToggle: (key: T) => void;
  theme: ThemeColors;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {options.map((o) => {
        const on = selected.has(o.key);
        return (
          <button
            key={o.key}
            onClick={() => onToggle(o.key)}
            style={{
              padding: "3px 8px",
              fontSize: 10,
              fontFamily: "monospace",
              borderRadius: 12,
              border: `1px solid ${on ? theme.ACTIVE_BORDER : theme.BORDER}`,
              background: on ? theme.ACTIVE_BG : "transparent",
              color: on ? theme.ACTIVE_TEXT : theme.ACCENT,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── 子元件：雙 thumb range slider（兩個 input 疊放） ──
function DurationRange({
  range,
  onChange,
  theme,
}: {
  range: [number, number];
  onChange: (r: [number, number]) => void;
  theme: ThemeColors;
}) {
  const [min, max] = range;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: theme.DIM,
          fontFamily: "monospace",
          marginBottom: 2,
        }}
      >
        <span>{min}h</span>
        <span>{max}h</span>
      </div>
      <input
        type="range"
        min={0}
        max={24}
        step={0.5}
        value={min}
        onChange={(e) => {
          const v = Math.min(Number(e.target.value), max);
          onChange([v, max]);
        }}
        style={{ width: "100%", accentColor: theme.ACTIVE_BORDER }}
      />
      <input
        type="range"
        min={0}
        max={24}
        step={0.5}
        value={max}
        onChange={(e) => {
          const v = Math.max(Number(e.target.value), min);
          onChange([min, v]);
        }}
        style={{ width: "100%", accentColor: theme.ACTIVE_BORDER }}
      />
    </div>
  );
}

// ─── 子元件：Toggle Row ─────────────────────────────────
function ToggleRow({
  label,
  checked,
  onChange,
  theme,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  theme: ThemeColors;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 4px",
        fontSize: 11,
        fontFamily: "monospace",
        cursor: "pointer",
        color: checked ? theme.ACTIVE_TEXT : theme.ACCENT,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ margin: 0, cursor: "pointer", accentColor: theme.ACTIVE_BORDER }}
      />
      <span>{label}</span>
    </label>
  );
}

// ═════════════════════════════════════════════════════════
// 主元件
// ═════════════════════════════════════════════════════════

export function DeepAnalysisPanel({
  filteredFlights,
  preFilterFlights,
  colorBy,
  onColorByChange,
  filters,
  onFiltersChange,
  isDarkTheme,
  theme,
}: DeepAnalysisPanelProps) {
  const [aircraftExpanded, setAircraftExpanded] = useState(false);
  const [airlineExpanded, setAirlineExpanded] = useState(false);

  const legend = getAnalysisLegend(filteredFlights, colorBy);
  const totalInLegend = legend.reduce((s, it) => s + it.count, 0);

  // ─── 從 preFilterFlights 計算「可選」列表 ─────────────
  const availableAircraftTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of preFilterFlights) {
      const t = f.aircraft_type;
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => {
        const info = getAircraftInfo(key);
        return {
          key,
          label: key,
          count,
          sub: info.category !== "other" ? info.category : info.name,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [preFilterFlights]);

  const availableAirlines = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of preFilterFlights) {
      const op = f.operating_as ?? "";
      if (!op) continue;
      counts.set(op, (counts.get(op) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => {
        const info = AIRLINE_DB[key];
        return {
          key,
          label: key,
          count,
          sub: info?.name,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [preFilterFlights]);

  // ─── filter handlers ─────────────────────────────────
  const updateFilter = <K extends keyof FlightFilters>(k: K, v: FlightFilters[K]) =>
    onFiltersChange({ ...filters, [k]: v });

  const resetFilters = () => onFiltersChange(EMPTY_FILTERS);

  // ─── filter active counts ────────────────────────────
  const aircraftCount = filters.aircraftTypes.size;
  const airlineCount = filters.airlines.size;
  const purposeCount = filters.purposes.size;
  const routeCount = filters.routeScopes.size;
  const durationActive =
    filters.durationRangeHours[0] !== 0 || filters.durationRangeHours[1] !== 24;
  const togglesActive = filters.onlyDiverted || filters.onlyWetLease;

  const totalActiveFilters =
    aircraftCount +
    airlineCount +
    purposeCount +
    routeCount +
    (durationActive ? 1 : 0) +
    (filters.onlyDiverted ? 1 : 0) +
    (filters.onlyWetLease ? 1 : 0);

  const sectionHeader: CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: theme.DIM,
    marginTop: 10,
    marginBottom: 4,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* ═════════════════════════════════════════════════════ */}
      {/* COLOR BY                                              */}
      {/* ═════════════════════════════════════════════════════ */}
      <div style={sectionHeader}>Color By</div>
      <select
        value={colorBy}
        onChange={(e) => onColorByChange(e.target.value as AnalysisColorBy)}
        style={{
          width: "100%",
          padding: "5px 8px",
          fontSize: 11,
          fontFamily: "monospace",
          background: theme.SELECT_BG,
          color: theme.ACCENT,
          border: `1px solid ${theme.BORDER}`,
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        {COLOR_BY_OPTIONS.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{
              background: isDarkTheme ? "#1a1a1a" : "#fff",
              color: isDarkTheme ? "#fff" : "#000",
            }}
          >
            {opt.label}
          </option>
        ))}
      </select>

      {colorBy !== "none" && legend.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: theme.DIM, fontFamily: "monospace" }}>
            {totalInLegend.toLocaleString()} flights · {legend.length} groups
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              maxHeight: 180,
              overflowY: "auto",
            }}
          >
            {legend.map((item) => {
              const pct = totalInLegend > 0 ? (item.count / totalInLegend) * 100 : 0;
              return (
                <div
                  key={item.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 4px",
                    borderRadius: 2,
                    background: theme.HOVER_BG,
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                      border: `1px solid ${theme.BORDER}`,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      color: theme.ACCENT,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={item.label}
                  >
                    {item.label}
                  </span>
                  <span style={{ color: theme.DIM, flexShrink: 0 }}>
                    {item.count.toLocaleString()}
                  </span>
                  <span style={{ color: theme.DIM, minWidth: 32, textAlign: "right" }}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ height: 1, background: theme.BORDER, marginTop: 8 }} />

      {/* ═════════════════════════════════════════════════════ */}
      {/* FILTERS                                                */}
      {/* ═════════════════════════════════════════════════════ */}
      <div
        style={{
          ...sectionHeader,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>Filters</span>
        {totalActiveFilters > 0 && (
          <button
            onClick={resetFilters}
            style={{
              fontSize: 10,
              background: "transparent",
              border: `1px solid ${theme.BORDER}`,
              color: theme.DIM,
              borderRadius: 3,
              padding: "1px 6px",
              cursor: "pointer",
              fontFamily: "monospace",
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            Reset all
          </button>
        )}
      </div>

      {/* Aircraft Type */}
      <Section
        title="Aircraft Type"
        badge={aircraftCount}
        expanded={aircraftExpanded}
        onToggle={() => setAircraftExpanded((v) => !v)}
        theme={theme}
      >
        <MultiCheckList
          items={availableAircraftTypes}
          selected={filters.aircraftTypes}
          onToggle={(k) => updateFilter("aircraftTypes", toggleSet(filters.aircraftTypes, k))}
          theme={theme}
          maxHeight={220}
        />
      </Section>

      {/* Airline */}
      <Section
        title="Airline"
        badge={airlineCount}
        expanded={airlineExpanded}
        onToggle={() => setAirlineExpanded((v) => !v)}
        theme={theme}
      >
        <MultiCheckList
          items={availableAirlines}
          selected={filters.airlines}
          onToggle={(k) => updateFilter("airlines", toggleSet(filters.airlines, k))}
          theme={theme}
          maxHeight={220}
        />
      </Section>

      {/* Purpose（小，全顯示 chips） */}
      <div>
        <div style={sectionHeader}>
          Purpose {purposeCount > 0 && <span style={{ color: theme.ACTIVE_BORDER }}>({purposeCount})</span>}
        </div>
        <ChipGroup
          options={(Object.keys(PURPOSE_LABELS) as FlightPurpose[])
            .filter((p) => p !== "diverted" && p !== "other")
            .map((p) => ({ key: p, label: PURPOSE_LABELS[p].en }))}
          selected={filters.purposes}
          onToggle={(k) => updateFilter("purposes", toggleSet(filters.purposes, k))}
          theme={theme}
        />
      </div>

      {/* Route Scope（4 個） */}
      <div>
        <div style={sectionHeader}>
          Route {routeCount > 0 && <span style={{ color: theme.ACTIVE_BORDER }}>({routeCount})</span>}
        </div>
        <ChipGroup
          options={(["domestic", "regional", "intercontinental"] as RouteScope[]).map((r) => ({
            key: r,
            label: ROUTE_SCOPE_LABELS[r].en,
          }))}
          selected={filters.routeScopes}
          onToggle={(k) => updateFilter("routeScopes", toggleSet(filters.routeScopes, k))}
          theme={theme}
        />
      </div>

      {/* Duration */}
      <div>
        <div style={sectionHeader}>
          Duration {durationActive && <span style={{ color: theme.ACTIVE_BORDER }}>(set)</span>}
        </div>
        <DurationRange
          range={filters.durationRangeHours}
          onChange={(r) => updateFilter("durationRangeHours", r)}
          theme={theme}
        />
      </div>

      {/* Quick toggles */}
      <div>
        <div style={sectionHeader}>
          Quick {togglesActive && <span style={{ color: theme.ACTIVE_BORDER }}>•</span>}
        </div>
        <ToggleRow
          label="Only Diverted (transfer)"
          checked={filters.onlyDiverted}
          onChange={(v) => updateFilter("onlyDiverted", v)}
          theme={theme}
        />
        <ToggleRow
          label="Only Wet Lease / Codeshare"
          checked={filters.onlyWetLease}
          onChange={(v) => updateFilter("onlyWetLease", v)}
          theme={theme}
        />
      </div>

      {/* ═════════════════════════════════════════════════════ */}
      {/* FOOTER: 計數                                          */}
      {/* ═════════════════════════════════════════════════════ */}
      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: `1px solid ${theme.BORDER}`,
          fontSize: 10,
          fontFamily: "monospace",
          color: theme.DIM,
          textAlign: "center",
        }}
      >
        Showing{" "}
        <span style={{ color: theme.ACCENT, fontWeight: 600 }}>
          {filteredFlights.length.toLocaleString()}
        </span>{" "}
        / {preFilterFlights.length.toLocaleString()} flights
      </div>
    </div>
  );
}
