/**
 * Deep Analysis Panel（🔬）
 *
 * Phase 2c：colorBy dropdown + legend
 * Phase 2d：filter chips（機型/航司/用途/航線）+ duration slider + quick toggles
 */

import { useMemo, useState } from "react";
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
import { AIRLINE_DB, getAirlineDisplayName } from "../data/airlineDatabase";
import { getAircraftInfo } from "../data/aircraftDatabase";
import { useTheme } from "../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { Button, ChipGroup, Section, Select, Slider, Toggle } from "../ui";
import { themeVars } from "../ui/vars";

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
  // 點位大小依機型縮放
  scaleByAircraftSize: boolean;
  onScaleByAircraftSizeChange: (v: boolean) => void;
}

// ─── 通用：toggle 一個 Set 的元素 ─────────────────────────
function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// ─── 子元件：Multi-checkbox 列表 ────────────────────────
function MultiCheckList({
  items,
  selected,
  onToggle,
  maxHeight = 200,
}: {
  items: Array<{ key: string; label: string; count: number; sub?: string }>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  maxHeight?: number;
}) {
  const { tokens } = useTheme();
  if (items.length === 0) {
    return <div style={{ fontSize: SIZE.minor, color: tokens.fg3, padding: `${SPACE.s4}px 0` }}>(no data)</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", maxHeight, overflowY: "auto", gap: 1 }}>
      {items.map((it) => {
        const on = selected.has(it.key);
        return (
          <button
            key={it.key}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onToggle(it.key)}
            className="fa-focus fa-hover"
            style={{
              ...themeVars(tokens),
              display: "flex",
              alignItems: "center",
              gap: SPACE.s6,
              padding: `${SPACE.s4}px ${SPACE.s4}px`,
              fontSize: SIZE.body,
              fontFamily: FONT.ui,
              cursor: "pointer",
              textAlign: "left",
              border: "none",
              width: "100%",
              color: on ? tokens.fg1 : tokens.fg2,
              background: on ? tokens.accentSoft : "transparent",
              borderRadius: RADIUS.base,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 12, height: 12, flexShrink: 0, boxSizing: "border-box",
                borderRadius: RADIUS.base,
                border: `1px solid ${on ? tokens.accent : tokens.border}`,
                background: on ? tokens.accent : "transparent",
                color: tokens.accentInk,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {on && (
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
                  <path d="M2 5.2l2.2 2.2L8 3" />
                </svg>
              )}
            </span>
            <span
              style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={`${it.label}${it.sub ? " · " + it.sub : ""}`}
            >
              {it.label}
              {it.sub && <span style={{ color: tokens.fg3, marginLeft: SPACE.s4 }}>· {it.sub}</span>}
            </span>
            <span style={{ color: tokens.fg3, fontSize: SIZE.minor, fontFamily: FONT.data, fontVariantNumeric: "tabular-nums" }}>{it.count}</span>
          </button>
        );
      })}
    </div>
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
  scaleByAircraftSize,
  onScaleByAircraftSizeChange,
}: DeepAnalysisPanelProps) {
  const { tokens } = useTheme();
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
        // label = 中/英文航司名為主，sub = ICAO 代碼
        return {
          key,
          label: info ? getAirlineDisplayName(key) : key,
          count,
          sub: info ? key : undefined,
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

  const purposeOptions = (Object.keys(PURPOSE_LABELS) as FlightPurpose[])
    .filter((p) => p !== "diverted" && p !== "other")
    .map((p) => ({ value: p, label: PURPOSE_LABELS[p].en }));
  const routeOptions = (["domestic", "regional", "intercontinental"] as RouteScope[]).map((r) => ({
    value: r,
    label: ROUTE_SCOPE_LABELS[r].en,
  }));

  return (
    <>
      {/* ═════════════════════════════════════════════════════ */}
      {/* COLOR BY                                              */}
      {/* ═════════════════════════════════════════════════════ */}
      <Section title="COLOR BY · 分色">
        <Select<AnalysisColorBy>
          fullWidth
          ariaLabel="Color By"
          value={colorBy}
          onChange={onColorByChange}
          options={COLOR_BY_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
        />

        {colorBy !== "none" && legend.length > 0 && (
          <>
            <div style={{ fontSize: SIZE.minor, color: tokens.fg3, fontFamily: FONT.data }}>
              {totalInLegend.toLocaleString()} flights · {legend.length} groups
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s2, maxHeight: 180, overflowY: "auto" }}>
              {legend.map((item) => {
                const pct = totalInLegend > 0 ? (item.count / totalInLegend) * 100 : 0;
                return (
                  <div
                    key={item.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: SPACE.s6,
                      padding: `${SPACE.s2}px ${SPACE.s4}px`,
                      borderRadius: RADIUS.base,
                      background: tokens.ctl,
                      fontSize: SIZE.minor,
                      fontFamily: FONT.ui,
                    }}
                  >
                    {/* 色塊是資料色（分析染色本身），保留 */}
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: RADIUS.base,
                        background: item.color,
                        border: `1px solid ${tokens.border}`,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{ flex: 1, color: tokens.fg1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={item.label}
                    >
                      {item.label}
                    </span>
                    <span style={{ color: tokens.fg3, flexShrink: 0, fontFamily: FONT.data, fontVariantNumeric: "tabular-nums" }}>
                      {item.count.toLocaleString()}
                    </span>
                    <span style={{ color: tokens.fg3, minWidth: 32, textAlign: "right", fontFamily: FONT.data, fontVariantNumeric: "tabular-nums" }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Section>

      {/* ═════════════════════════════════════════════════════ */}
      {/* FILTERS                                                */}
      {/* ═════════════════════════════════════════════════════ */}
      <Section
        title="FILTERS · 篩選"
        right={
          totalActiveFilters > 0 ? (
            <Button variant="ghost" onClick={resetFilters} style={{ height: 20, padding: `0 ${SPACE.s6}px`, textTransform: "none", letterSpacing: 0 }}>
              Reset all
            </Button>
          ) : undefined
        }
      />

      {/* Aircraft Type */}
      <Section
        title="Aircraft Type"
        collapsible
        badge={aircraftCount}
        open={aircraftExpanded}
        onToggle={setAircraftExpanded}
      >
        <MultiCheckList
          items={availableAircraftTypes}
          selected={filters.aircraftTypes}
          onToggle={(k) => updateFilter("aircraftTypes", toggleSet(filters.aircraftTypes, k))}
          maxHeight={220}
        />
      </Section>

      {/* Airline */}
      <Section
        title="Airline"
        collapsible
        badge={airlineCount}
        open={airlineExpanded}
        onToggle={setAirlineExpanded}
      >
        <MultiCheckList
          items={availableAirlines}
          selected={filters.airlines}
          onToggle={(k) => updateFilter("airlines", toggleSet(filters.airlines, k))}
          maxHeight={220}
        />
      </Section>

      {/* Purpose（小，全顯示 chips） */}
      <Section title="Purpose" badge={purposeCount}>
        <ChipGroup
          mono={false}
          ariaLabel="Purpose"
          options={purposeOptions}
          selected={filters.purposes}
          onToggle={(k) => updateFilter("purposes", toggleSet(filters.purposes, k))}
        />
      </Section>

      {/* Route Scope */}
      <Section title="Route" badge={routeCount}>
        <ChipGroup
          mono={false}
          ariaLabel="Route"
          options={routeOptions}
          selected={filters.routeScopes}
          onToggle={(k) => updateFilter("routeScopes", toggleSet(filters.routeScopes, k))}
        />
      </Section>

      {/* Duration */}
      <Section title="Duration" badge={durationActive ? 1 : undefined}>
        <Slider
          range
          ariaLabel="Duration range (hours)"
          min={0}
          max={24}
          step={0.5}
          value={filters.durationRangeHours}
          onChange={(r) => updateFilter("durationRangeHours", r)}
          format={(v) => `${v}h`}
        />
      </Section>

      {/* Quick toggles */}
      <Section title="Quick" badge={togglesActive ? (filters.onlyDiverted ? 1 : 0) + (filters.onlyWetLease ? 1 : 0) : undefined}>
        <Toggle
          label="Only Diverted (transfer)"
          checked={filters.onlyDiverted}
          onChange={(v) => updateFilter("onlyDiverted", v)}
        />
        <Toggle
          label="Only Wet Lease / Codeshare"
          checked={filters.onlyWetLease}
          onChange={(v) => updateFilter("onlyWetLease", v)}
        />
      </Section>

      {/* 視覺化：點位大小 */}
      <Section title="Visual">
        <Toggle
          label="Scale points by aircraft size"
          checked={scaleByAircraftSize}
          onChange={onScaleByAircraftSizeChange}
        />
      </Section>

      {/* ═════════════════════════════════════════════════════ */}
      {/* FOOTER: 計數                                          */}
      {/* ═════════════════════════════════════════════════════ */}
      <div
        style={{
          paddingTop: SPACE.s6,
          borderTop: `1px solid ${tokens.border}`,
          fontSize: SIZE.minor,
          fontFamily: FONT.data,
          color: tokens.fg3,
          textAlign: "center",
        }}
      >
        Showing{" "}
        <span style={{ color: tokens.fg1, fontWeight: 500 }}>
          {filteredFlights.length.toLocaleString()}
        </span>{" "}
        / {preFilterFlights.length.toLocaleString()} flights
      </div>
    </>
  );
}
