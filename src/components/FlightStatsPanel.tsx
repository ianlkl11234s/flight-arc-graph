import { useEffect, useMemo, useState } from "react";
import type { Flight, StatsTab, StatsDrillDown } from "../types";
import { AIRPORT_INFO } from "../map/cameraPresets";
import { ICAO_TO_IATA } from "../data/flightLoader";
import {
  computeHourlyStats,
  computeDestinationStats,
  groupByCountry,
  computeAirportComparison,
  getAircraftTypeStats,
  getAirlineStats,
  getFlightDurationDistribution,
  getRouteFlights,
  computeReachableDestinations,
  computeDomesticRoutes,
  getUniqueDays,
  getCountryCode,
  computeTopRoutes,
  getFleetMix,
  getDepArrCount,
  getAvailableDates,
  filterFlightsByDates,
  computeTimelineDepArr,
} from "../data/flightStats";
import type { TimelineSlot } from "../data/flightStats";

interface Props {
  allFlights: Flight[];
  selectedAirport: string;
  isDarkTheme: boolean;
  onClose: () => void;
  onSelectAirport: (icao: string) => void;
  onSelectFlight: (flightId: string) => void;
}

/* ── Color tokens (matching Pencil design) ── */

const C = {
  bg: "#0C0C0C",
  cardBg: "#141414",
  divider: "#2f2f2f",
  textWhite: "#FFFFFF",
  textGray: "#888888",
  textDim: "#8a8a8a",
  textMuted: "#6a6a6a",
  barFull: "#888888",
  bar80: "#88888880",
  bar60: "#88888860",
  bar40: "#88888840",
  tabActiveBg: "#88888820",
  depLine: "#aaaaaa",
  arrLine: "#666666",
};

/* ── Light theme overrides ── */

const CL = {
  bg: "rgba(245,245,250,0.95)",
  cardBg: "rgba(0,0,0,0.04)",
  divider: "rgba(0,0,0,0.08)",
  textWhite: "#1a1a1a",
  textGray: "#666666",
  textDim: "#777777",
  textMuted: "#999999",
  barFull: "#888888",
  bar80: "#88888880",
  bar60: "#88888860",
  bar40: "#88888840",
  tabActiveBg: "rgba(0,0,0,0.08)",
  depLine: "#555555",
  arrLine: "#999999",
};

function t(dark: boolean) { return dark ? C : CL; }

const font = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";

/* ── Reusable: Divider ── */

function Divider({ dark }: { dark: boolean }) {
  return <div style={{ height: 1, background: t(dark).divider, width: "100%" }} />;
}

/* ── Reusable: Collapsible Section ── */

function Section({
  title, dark, right, children, defaultOpen = true,
}: {
  title: string; dark: boolean; right?: React.ReactNode;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = t(dark);
  return (
    <div style={{ padding: "10px 20px", display: "flex", flexDirection: "column", gap: open ? 8 : 0 }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.textGray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s ease" }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: colors.textWhite, fontFamily: font }}>
            {title}
          </span>
        </div>
        {right}
      </div>
      {open && children}
    </div>
  );
}

/* ── Reusable: Dep/Arr Line Chart (supports single-day & multi-day timeline) ── */

function DepArrLineChart({
  data, dark,
}: {
  data: TimelineSlot[];
  dark: boolean;
}) {
  const colors = t(dark);
  const [hover, setHover] = useState<number | null>(null);

  const N = data.length;
  if (N === 0) return null;

  const multiDay = (() => {
    const firstDate = data[0]!.date;
    return data.some((d) => d.date !== firstDate);
  })();

  const W = 300, H = multiDay ? 110 : 100;
  const padL = 24, padR = 4, padT = 8, padB = multiDay ? 24 : 16;
  const cW = W - padL - padR;
  const cH = H - padT - padB;
  const maxVal = Math.max(...data.map((d) => Math.max(d.departures, d.arrivals)), 1);
  const x = (i: number) => padL + (i / Math.max(N - 1, 1)) * cW;
  const y = (v: number) => padT + cH - (v / maxVal) * cH;

  const line = (key: "departures" | "arrivals") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");

  // Day boundaries for multi-day x-axis
  const dayBounds: { idx: number; label: string }[] = [];
  if (multiDay) {
    let prev = "";
    data.forEach((d, i) => {
      if (d.date !== prev) {
        dayBounds.push({ idx: i, label: d.date.slice(5).replace("-", "/") });
        prev = d.date;
      }
    });
  }

  const hd = hover !== null ? data[hover] : null;
  const flipTooltip = hover !== null && hover > N * 0.7;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%" }}>
        {/* Grid */}
        {[0, 0.5, 1].map((r) => (
          <line key={r} x1={padL} x2={W - padR}
            y1={padT + cH * (1 - r)} y2={padT + cH * (1 - r)}
            stroke={colors.divider} strokeWidth={0.5} />
        ))}
        {/* Y labels */}
        <text x={padL - 3} y={padT + 4} textAnchor="end" fill={colors.textMuted} fontSize={7} fontFamily={font}>{maxVal}</text>
        <text x={padL - 3} y={padT + cH + 3} textAnchor="end" fill={colors.textMuted} fontSize={7} fontFamily={font}>0</text>

        {/* Day boundary separators (multi-day) */}
        {dayBounds.map(({ idx, label }, bi) => (
          <g key={idx}>
            {idx > 0 && (
              <line x1={x(idx)} x2={x(idx)} y1={padT} y2={padT + cH}
                stroke={colors.textMuted} strokeWidth={0.3} strokeDasharray="3,3" />
            )}
            <text x={x(idx + 12)} y={H - 4} textAnchor="middle"
              fill={bi === 0 ? colors.textGray : colors.textMuted} fontSize={7} fontFamily={font} fontWeight={bi === 0 ? 600 : 400}>
              {label}
            </text>
          </g>
        ))}

        {/* Single-day x labels */}
        {!multiDay && [0, 6, 12, 18, 23].map((h) => (
          <text key={h} x={x(h)} y={H - 2} textAnchor="middle" fill={colors.textMuted} fontSize={7} fontFamily={font}>
            {String(h).padStart(2, "0")}
          </text>
        ))}

        {/* Dep line (solid) */}
        <path d={line("departures")} fill="none" stroke={colors.depLine} strokeWidth={1.5} />
        {/* Arr line (dashed) */}
        <path d={line("arrivals")} fill="none" stroke={colors.arrLine} strokeWidth={1.5} strokeDasharray="4,3" />

        {/* Hover hitboxes */}
        {data.map((_, i) => (
          <rect key={i} x={x(i) - cW / (N * 2)} y={padT} width={cW / N} height={cH}
            fill="transparent" style={{ cursor: "crosshair" }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}

        {/* Hover indicator */}
        {hover !== null && hd && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + cH}
              stroke={colors.textMuted} strokeWidth={0.5} strokeDasharray="2,2" />
            <circle cx={x(hover)} cy={y(hd.departures)} r={multiDay ? 2.5 : 3} fill={colors.depLine} />
            <circle cx={x(hover)} cy={y(hd.arrivals)} r={multiDay ? 2.5 : 3} fill={colors.arrLine} />
          </>
        )}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginTop: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 1.5, background: colors.depLine }} />
          <span style={{ fontSize: 8, color: colors.textDim, fontFamily: font }}>Dep</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width={14} height={3}><line x1={0} y1={1.5} x2={14} y2={1.5} stroke={colors.arrLine} strokeWidth={1.5} strokeDasharray="3,2" /></svg>
          <span style={{ fontSize: 8, color: colors.textDim, fontFamily: font }}>Arr</span>
        </div>
      </div>

      {/* Tooltip */}
      {hover !== null && hd && (
        <div style={{
          position: "absolute", top: 0,
          ...(flipTooltip
            ? { right: `${((W - x(hover)) / W * 100 + 3)}%` }
            : { left: `${(x(hover) / W * 100 + 3)}%` }),
          background: colors.bg, border: `1px solid ${colors.divider}`, borderRadius: 4,
          padding: "3px 8px", fontSize: 9, fontFamily: font, pointerEvents: "none", zIndex: 10,
          whiteSpace: "nowrap",
        }}>
          <div style={{ color: colors.textWhite, fontWeight: 600 }}>
            {multiDay ? `${hd.date.slice(5).replace("-", "/")} ` : ""}{String(hd.hour).padStart(2, "0")}:00
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: colors.depLine }}>↑ {hd.departures}</span>
            <span style={{ color: colors.arrLine }}>↓ {hd.arrivals}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reusable: Show More / Show All buttons ── */

function ShowMoreButton({
  total, dark, expanded, onShowMore, onShowAll,
}: {
  total: number; dark: boolean; expanded: boolean;
  onShowMore: () => void; onShowAll: () => void;
}) {
  const colors = t(dark);
  if (total <= 5) return null;

  if (expanded) {
    // Already showing 15 — offer "Show all" as drill-down
    if (total > 15) {
      return (
        <button onClick={onShowAll} style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: font,
          fontSize: 10, fontWeight: 500, color: colors.textMuted, padding: "4px 0",
          width: "100%", textAlign: "center",
        }}>
          Show all ({total}) →
        </button>
      );
    }
    return null;
  }

  // Showing initial 5 — offer "Show more"
  const remaining = Math.min(total - 5, 10);
  return (
    <button onClick={onShowMore} style={{
      background: "none", border: "none", cursor: "pointer", fontFamily: font,
      fontSize: 10, fontWeight: 500, color: colors.textMuted, padding: "4px 0",
      width: "100%", textAlign: "center",
    }}>
      ▼ Show more (+{remaining})
    </button>
  );
}

/* ── Reusable: Horizontal Bar with label + percentage ── */

function HBar({
  label, percentage, barWidth, dark, labelWidth = 38, opacity,
}: {
  label: string; percentage: string; barWidth: number; dark: boolean; labelWidth?: number; opacity?: number;
}) {
  const colors = t(dark);
  const fill = opacity ? `${colors.barFull}${Math.round(opacity * 255).toString(16).padStart(2, "0")}` : colors.barFull;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
      <span style={{ width: labelWidth, fontSize: 12, fontWeight: 600, color: colors.textWhite, fontFamily: font, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 8, background: colors.cardBg, position: "relative" }}>
        <div style={{ width: `${barWidth}%`, height: "100%", background: fill }} />
      </div>
      <span style={{ width: 30, fontSize: 10, fontWeight: 500, color: colors.textDim, fontFamily: font, textAlign: "right", flexShrink: 0 }}>
        {percentage}
      </span>
    </div>
  );
}

/* ── Airport Tab ── */

function AirportTab({
  flights, icao, dark, drillDown, setDrillDown, onSelectFlight,
}: {
  flights: Flight[]; icao: string; dark: boolean;
  drillDown: StatsDrillDown | null; setDrillDown: (d: StatsDrillDown | null) => void;
  onSelectFlight: (id: string) => void;
}) {
  const colors = t(dark);
  const info = AIRPORT_INFO[icao];

  // Date filter (multi-select: empty = ALL)
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  useEffect(() => { setSelectedDates([]); }, [icao]);
  const availableDates = useMemo(() => getAvailableDates(flights, icao), [flights, icao]);
  const activeFlights = useMemo(
    () => selectedDates.length > 0 ? filterFlightsByDates(flights, selectedDates) : flights,
    [flights, selectedDates],
  );

  // Timeline chart data (passes selected dates, or all if empty)
  const depArrTimeline = useMemo(
    () => computeTimelineDepArr(flights, icao, selectedDates.length > 0 ? selectedDates : undefined),
    [flights, icao, selectedDates],
  );

  // Expansion states for list sections (false = 5 items, true = 15 items)
  const [routesMore, setRoutesMore] = useState(false);
  const [destMore, setDestMore] = useState(false);
  const [aircraftMore, setAircraftMore] = useState(false);

  // Reset expansion when airport changes
  useEffect(() => {
    setRoutesMore(false);
    setDestMore(false);
    setAircraftMore(false);
  }, [icao]);

  const depArr = useMemo(() => getDepArrCount(activeFlights, icao), [activeFlights, icao]);
  const totalFlights = depArr.departures + depArr.arrivals;
  const days = useMemo(() => getUniqueDays(activeFlights, icao), [activeFlights, icao]);
  const hourly = useMemo(() => computeHourlyStats(activeFlights, icao), [activeFlights, icao]);
  const airlines = useMemo(() => getAirlineStats(activeFlights, icao), [activeFlights, icao]);
  const topRoutes = useMemo(() => computeTopRoutes(activeFlights, icao), [activeFlights, icao]);
  const destStats = useMemo(() => computeDestinationStats(activeFlights, icao), [activeFlights, icao]);
  const countries = useMemo(() => groupByCountry(destStats), [destStats]);
  const aircraft = useMemo(() => getAircraftTypeStats(activeFlights, icao), [activeFlights, icao]);
  const fleetMix = useMemo(() => getFleetMix(activeFlights, icao), [activeFlights, icao]);
  const duration = useMemo(() => getFlightDurationDistribution(activeFlights, icao), [activeFlights, icao]);

  const maxHourly = Math.max(...hourly.map((h) => h.count), 1);
  const peakHour = hourly.reduce((a, b) => (b.count > a.count ? b : a), hourly[0]!);
  const peakEnd = Math.min(peakHour.hour + 2, 23);
  const totalAirlines = airlines.reduce((s, a) => s + a.count, 0) || 1;
  const totalAircraft = aircraft.reduce((s, a) => s + a.count, 0) || 1;
  const totalDuration = duration.reduce((s, b) => s + b.count, 0) || 1;

  // Drill-down: route flights
  if (drillDown?.type === "route") {
    const [originIcao, destIcao] = drillDown.key.split("|") as [string, string];
    const routeFlights = getRouteFlights(flights, originIcao, destIcao);
    return (
      <div style={{ padding: "10px 20px" }}>
        <button onClick={() => setDrillDown(null)} style={{
          background: "none", border: "none", color: colors.textGray, fontSize: 11,
          fontFamily: font, cursor: "pointer", padding: 0, marginBottom: 8,
        }}>
          {"< Back"}
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>{drillDown.label}</div>
        <div style={{ fontSize: 11, color: colors.textDim, fontFamily: font, marginBottom: 12 }}>
          {routeFlights.length} flights
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {routeFlights.map((f) => (
            <div key={f.fr24_id} className="fp-card" onClick={() => onSelectFlight(f.fr24_id)} style={{
              display: "flex", gap: 8, padding: "5px 8px", borderRadius: 4,
              cursor: "pointer", fontFamily: font, fontSize: 11, background: colors.cardBg,
            }}>
              <span style={{ color: colors.textWhite, fontWeight: 600, minWidth: 55 }}>{f.callsign}</span>
              <span style={{ color: colors.textDim }}>
                {f.dep_time > 0 ? new Date(f.dep_time * 1000).toLocaleString("zh-TW", {
                  timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
                }) : "--"}
              </span>
              <span style={{ color: colors.textMuted }}>{f.aircraft_type}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Drill-down: country airports
  if (drillDown?.type === "country") {
    const group = countries.find((c) => c.country === drillDown.key);
    if (!group) return null;
    return (
      <div style={{ padding: "10px 20px" }}>
        <button onClick={() => setDrillDown(null)} style={{
          background: "none", border: "none", color: colors.textGray, fontSize: 11,
          fontFamily: font, cursor: "pointer", padding: 0, marginBottom: 8,
        }}>
          {"< Back"}
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>
          {info?.iata ?? icao} → {group.country}
        </div>
        <div style={{ fontSize: 11, color: colors.textDim, fontFamily: font, marginBottom: 12 }}>
          {group.totalFlights} flights · {group.airports.length} airports
        </div>
        {group.airports.map((a) => (
          <div key={a.icao} className="fp-card" onClick={() => setDrillDown({
            type: "route", key: `${icao}|${a.icao}`,
            label: `${info?.iata ?? icao} → ${ICAO_TO_IATA[a.icao] ?? a.icao}`,
          })} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 8px", background: colors.cardBg, marginBottom: 4,
            cursor: "pointer", fontFamily: font,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textWhite }}>{a.iata}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: colors.textDim }}>{a.count}</span>
          </div>
        ))}
      </div>
    );
  }

  // Drill-down: all routes
  if (drillDown?.type === "all-routes") {
    return (
      <div style={{ padding: "10px 20px" }}>
        <button onClick={() => setDrillDown(null)} style={{
          background: "none", border: "none", color: colors.textGray, fontSize: 11,
          fontFamily: font, cursor: "pointer", padding: 0, marginBottom: 8,
        }}>
          {"< Back"}
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>All Routes</div>
        <div style={{ fontSize: 11, color: colors.textDim, fontFamily: font, marginBottom: 12 }}>
          {topRoutes.length} routes from {info?.iata ?? icao}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {topRoutes.map((r) => (
            <div key={r.destIcao} className="fp-card" onClick={() => setDrillDown({
              type: "route", key: `${r.originIcao}|${r.destIcao}`,
              label: `${r.originIata} → ${r.destIata}`,
            })} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 8px", background: colors.cardBg, cursor: "pointer",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: colors.textGray, fontFamily: font }}>{r.originIata}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
                <span style={{ fontSize: 12, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>{r.destIata}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: colors.textDim, fontFamily: font }}>{r.airlines.join("/")}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>{r.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Drill-down: all destinations
  if (drillDown?.type === "all-destinations") {
    return (
      <div style={{ padding: "10px 20px" }}>
        <button onClick={() => setDrillDown(null)} style={{
          background: "none", border: "none", color: colors.textGray, fontSize: 11,
          fontFamily: font, cursor: "pointer", padding: 0, marginBottom: 8,
        }}>
          {"< Back"}
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>All Destinations</div>
        <div style={{ fontSize: 11, color: colors.textDim, fontFamily: font, marginBottom: 12 }}>
          {countries.length} regions from {info?.iata ?? icao}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {countries.map((g) => (
            <div key={g.country} className="fp-row" onClick={() => setDrillDown({ type: "country", key: g.country, label: g.country })}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", width: "100%", padding: "6px 8px", borderRadius: 2, background: colors.cardBg }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: colors.textGray, fontFamily: font, width: 20 }}>
                  {getCountryCode(g.country)}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, color: colors.textWhite, fontFamily: font }}>{g.country}</span>
                <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: font }}>{g.airports.length} apt</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: colors.textDim, fontFamily: font }}>{g.totalFlights}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Drill-down: all aircraft types
  if (drillDown?.type === "all-aircraft") {
    return (
      <div style={{ padding: "10px 20px" }}>
        <button onClick={() => setDrillDown(null)} style={{
          background: "none", border: "none", color: colors.textGray, fontSize: 11,
          fontFamily: font, cursor: "pointer", padding: 0, marginBottom: 8,
        }}>
          {"< Back"}
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>All Aircraft Types</div>
        <div style={{ fontSize: 11, color: colors.textDim, fontFamily: font, marginBottom: 12 }}>
          {aircraft.length} types at {info?.iata ?? icao}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {aircraft.map((a) => {
            const pct = Math.round((a.count / totalAircraft) * 100);
            return <HBar key={a.type} label={a.type} percentage={`${pct}%`}
              barWidth={(a.count / aircraft[0]!.count) * 100} dark={dark}
              opacity={Math.max(a.count / aircraft[0]!.count, 0.15)} />;
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Summary */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>
            {icao} {info?.name ?? ""}
          </div>
          <div style={{ fontSize: 11, fontWeight: 500, color: colors.textDim, fontFamily: font, marginTop: 2 }}>
            {totalFlights} flights · {days > 0 ? `${Math.round(totalFlights / days)}/day` : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.textGray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 22h20" /><path d="M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l3-1 4 4.5 5-2.5a2.5 2.5 0 0 1 3.12 3.37L17 14.5 8 18" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>{depArr.departures}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 22h20" /><path d="m3 9 2.5-.5a2.5 2.5 0 0 1 3.12 1.37L12 16l6-4-4-4.5 5-2.5a2.5 2.5 0 0 1 3.12 3.37l-9.74 6.5L7 18" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500, color: colors.textDim, fontFamily: font }}>{depArr.arrivals}</span>
          </div>
        </div>
      </div>

      {/* Date Selector */}
      <div style={{ padding: "0 20px 6px", display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button onClick={() => setSelectedDates([])} style={{
          padding: "3px 10px", fontSize: 10, fontWeight: selectedDates.length === 0 ? 700 : 500,
          fontFamily: font, cursor: "pointer", border: "none", borderRadius: 2,
          color: selectedDates.length === 0 ? colors.textWhite : colors.textMuted,
          background: selectedDates.length === 0 ? colors.tabActiveBg : "transparent",
          transition: "all 0.15s ease",
        }}>ALL</button>
        {availableDates.map((d) => {
          const active = selectedDates.includes(d);
          return (
            <button key={d} onClick={() => {
              setSelectedDates((prev) =>
                prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
              );
            }} style={{
              padding: "3px 8px", fontSize: 10, fontWeight: active ? 700 : 500,
              fontFamily: font, cursor: "pointer", border: "none", borderRadius: 2,
              color: active ? colors.textWhite : colors.textMuted,
              background: active ? colors.tabActiveBg : "transparent",
              transition: "all 0.15s ease",
            }}>{d.slice(5).replace("-", "/")}</button>
          );
        })}
      </div>

      <Divider dark={dark} />

      {/* Dep/Arr Timeline Chart */}
      <Section title="DEPARTURES & ARRIVALS" dark={dark}
        right={<span style={{ fontSize: 9, fontWeight: 500, color: colors.textDim, fontFamily: font }}>
          {depArr.departures}↑ {depArr.arrivals}↓
        </span>}
      >
        <DepArrLineChart data={depArrTimeline} dark={dark} />
      </Section>

      <Divider dark={dark} />

      {/* Hourly Pattern — vertical bar chart */}
      <Section title="HOURLY PATTERN" dark={dark}
        right={<span style={{ fontSize: 9, fontWeight: 500, color: colors.textGray, fontFamily: font }}>
          Peak {String(peakHour.hour).padStart(2, "0")}-{String(peakEnd).padStart(2, "0")}
        </span>}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 48, width: "100%" }}>
          {hourly.map((h) => {
            const ratio = maxHourly > 0 ? h.count / maxHourly : 0;
            const barH = Math.max(ratio * 48, 2);
            let fill: string;
            if (ratio > 0.75) fill = colors.barFull;
            else if (ratio > 0.5) fill = colors.bar80;
            else if (ratio > 0.25) fill = colors.bar60;
            else if (ratio > 0) fill = colors.bar40;
            else fill = colors.divider;
            return <div key={h.hour} className="fp-bar" style={{ flex: 1, height: barH, background: fill }} />;
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
          {[0, 6, 12, 18, 23].map((h) => (
            <span key={h} style={{ fontSize: 8, fontWeight: 500, color: colors.textMuted, fontFamily: font }}>
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
      </Section>

      <Divider dark={dark} />

      {/* Airlines Share — stacked horizontal bar */}
      <Section title="AIRLINES SHARE" dark={dark}>
        <div style={{ display: "flex", gap: 2, height: 24, width: "100%" }}>
          {airlines.slice(0, 4).map((a, i) => {
            const pct = Math.round((a.count / totalAirlines) * 100);
            const widthPx = Math.max((a.count / totalAirlines) * 100, 8);
            const fills = [colors.barFull, colors.bar80, colors.bar60, colors.bar40];
            const textColors = [C.bg, C.bg, C.bg, colors.textWhite];
            return (
              <div key={a.code} style={{
                width: `${widthPx}%`, height: "100%", background: fills[i],
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: textColors[i], fontFamily: font, whiteSpace: "nowrap", overflow: "hidden" }}>
                  {widthPx > 12 ? `${a.code} ${pct}%` : a.code}
                </span>
              </div>
            );
          })}
          {airlines.length > 4 && (
            <div style={{
              flex: 1, height: "100%", background: colors.cardBg,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 9, fontWeight: 500, color: colors.textDim, fontFamily: font }}>Others</span>
            </div>
          )}
        </div>
      </Section>

      <Divider dark={dark} />

      {/* Top Routes — card style */}
      <Section title="TOP ROUTES" dark={dark}
        right={<span style={{ fontSize: 9, fontWeight: 600, color: colors.textDim, fontFamily: font, background: colors.cardBg, padding: "2px 6px" }}>
          {topRoutes.length}
        </span>}
      >
        {topRoutes.slice(0, routesMore ? 15 : 5).map((r) => (
          <div key={r.destIcao} className="fp-card" onClick={() => setDrillDown({
            type: "route", key: `${r.originIcao}|${r.destIcao}`,
            label: `${r.originIata} → ${r.destIata}`,
          })} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 8px", background: colors.cardBg, cursor: "pointer",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: colors.textGray, fontFamily: font }}>{r.originIata}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>{r.destIata}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: colors.textDim, fontFamily: font }}>{r.airlines.join("/")}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>{r.count}</span>
            </div>
          </div>
        ))}
        <ShowMoreButton total={topRoutes.length} dark={dark} expanded={routesMore}
          onShowMore={() => setRoutesMore(true)}
          onShowAll={() => setDrillDown({ type: "all-routes", key: icao, label: "All Routes" })} />
      </Section>

      <Divider dark={dark} />

      {/* Top Destinations — country list */}
      <Section title="TOP DESTINATIONS" dark={dark}
        right={<span style={{ fontSize: 9, fontWeight: 600, color: colors.textDim, fontFamily: font, background: colors.cardBg, padding: "2px 6px" }}>
          {countries.length}
        </span>}
      >
        {countries.slice(0, destMore ? 15 : 5).map((g) => (
          <div key={g.country} className="fp-row" onClick={() => setDrillDown({ type: "country", key: g.country, label: g.country })}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", width: "100%", padding: "4px 4px", borderRadius: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: colors.textGray, fontFamily: font, width: 20 }}>
                {getCountryCode(g.country)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: colors.textWhite, fontFamily: font }}>{g.country}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: colors.textDim, fontFamily: font }}>{g.totalFlights}</span>
          </div>
        ))}
        <ShowMoreButton total={countries.length} dark={dark} expanded={destMore}
          onShowMore={() => setDestMore(true)}
          onShowAll={() => setDrillDown({ type: "all-destinations", key: icao, label: "All Destinations" })} />
      </Section>

      <Divider dark={dark} />

      {/* Aircraft Types — horizontal bars */}
      <Section title="AIRCRAFT TYPES" dark={dark}
        right={<span style={{ fontSize: 9, fontWeight: 600, color: colors.textDim, fontFamily: font, background: colors.cardBg, padding: "2px 6px" }}>
          {aircraft.length}
        </span>}
      >
        {aircraft.slice(0, aircraftMore ? 15 : 5).map((a, i) => {
          const pct = Math.round((a.count / totalAircraft) * 100);
          const opacity = i < 4 ? [1, 0.5, 0.37, 0.25][i]! : 0.2;
          return <HBar key={a.type} label={a.type} percentage={`${pct}%`}
            barWidth={(a.count / aircraft[0]!.count) * 100} dark={dark} opacity={opacity} />;
        })}
        <ShowMoreButton total={aircraft.length} dark={dark} expanded={aircraftMore}
          onShowMore={() => setAircraftMore(true)}
          onShowAll={() => setDrillDown({ type: "all-aircraft", key: icao, label: "All Aircraft Types" })} />
      </Section>

      <Divider dark={dark} />

      {/* Fleet Mix */}
      <Section title="FLEET MIX" dark={dark}>
        {fleetMix.map((fm, i) => {
          const opacities = [1, 0.5, 0.25];
          return <HBar key={fm.category} label={fm.category} percentage={`${fm.percentage}%`}
            barWidth={fm.count > 0 ? (fm.count / fleetMix[0]!.count) * 100 : 0}
            dark={dark} labelWidth={80} opacity={opacities[i]} />;
        })}
      </Section>

      <Divider dark={dark} />

      {/* Flight Duration */}
      <Section title="FLIGHT DURATION" dark={dark}>
        {duration.map((b) => {
          const pct = Math.round((b.count / totalDuration) * 100);
          const maxCount = Math.max(...duration.map((d) => d.count), 1);
          const ratio = b.count / maxCount;
          const opacity = ratio > 0.7 ? 1 : ratio > 0.4 ? 0.5 : 0.25;
          return <HBar key={b.label} label={b.label} percentage={`${pct}%`}
            barWidth={(b.count / maxCount) * 100} dark={dark} labelWidth={36} opacity={opacity} />;
        })}
      </Section>
    </>
  );
}

/* ── All Taiwan Tab ── */

function AllTaiwanTab({
  flights, dark, onSelectAirport,
}: {
  flights: Flight[]; dark: boolean; onSelectAirport: (icao: string) => void;
}) {
  const colors = t(dark);
  const comparison = useMemo(() => computeAirportComparison(flights), [flights]);
  const reachable = useMemo(() => computeReachableDestinations(flights), [flights]);
  const domestic = useMemo(() => computeDomesticRoutes(flights), [flights]);

  return (
    <>
      {/* Airport Comparison */}
      <Section title="AIRPORT COMPARISON" dark={dark}>
        {comparison.map((a) => {
          const barW = (a.count / (comparison[0]?.count ?? 1)) * 100;
          return (
            <div key={a.icao} className="fp-row" onClick={() => onSelectAirport(a.icao)} style={{
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer", width: "100%",
              padding: "4px 4px", borderRadius: 2,
            }}>
              <span style={{ width: 32, fontSize: 12, fontWeight: 600, color: colors.textWhite, fontFamily: font, flexShrink: 0 }}>
                {a.iata}
              </span>
              <div style={{ flex: 1, height: 8, background: colors.cardBg }}>
                <div style={{ width: `${barW}%`, height: "100%", background: colors.barFull }} />
              </div>
              <span style={{ width: 32, fontSize: 12, fontWeight: 500, color: colors.textDim, fontFamily: font, textAlign: "right", flexShrink: 0 }}>
                {a.count}
              </span>
            </div>
          );
        })}
      </Section>

      <Divider dark={dark} />

      {/* Reachable Destinations */}
      <Section title="REACHABLE DESTINATIONS" dark={dark}>
        {reachable.slice(0, 8).map((g) => (
          <div key={g.country} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: colors.textGray, fontFamily: font, width: 20 }}>
                {getCountryCode(g.country)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: colors.textWhite, fontFamily: font }}>{g.country}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: font }}>{g.airports.length} apt</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: colors.textDim, fontFamily: font }}>{g.totalFlights}</span>
            </div>
          </div>
        ))}
      </Section>

      <Divider dark={dark} />

      {/* Domestic Routes */}
      <Section title="DOMESTIC ROUTES" dark={dark}>
        {domestic.length === 0 ? (
          <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: font }}>No domestic routes</span>
        ) : domestic.slice(0, 8).map((r) => (
          <div key={`${r.from}-${r.to}`} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 8px", background: colors.cardBg,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: colors.textGray, fontFamily: font }}>{r.fromIata}</span>
              <span style={{ fontSize: 10, color: colors.textMuted }}>↔</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>{r.toIata}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textWhite, fontFamily: font }}>{r.count}</span>
          </div>
        ))}
      </Section>
    </>
  );
}

/* ── Main Panel ── */

export function FlightStatsPanel({
  allFlights, selectedAirport, isDarkTheme: dark, onClose, onSelectAirport, onSelectFlight,
}: Props) {
  const colors = t(dark);
  const [tab, setTab] = useState<StatsTab>("airport");
  const [drillDown, setDrillDown] = useState<StatsDrillDown | null>(null);
  const [visible, setVisible] = useState(true);
  const [panelWidth, setPanelWidth] = useState(340);

  const handleClose = () => { setVisible(false); setTimeout(onClose, 300); };
  const handleSelectAirport = (icao: string) => { onSelectAirport(icao); setTab("airport"); setDrillDown(null); };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      setPanelWidth(Math.min(Math.max(startW + (startX - ev.clientX), 280), 720));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: panelWidth, zIndex: 50,
      background: colors.bg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      borderLeft: `1px solid ${colors.divider}`,
      display: "flex", flexDirection: "column", fontFamily: font,
      transform: visible ? "translateX(0)" : "translateX(100%)",
      transition: visible ? "transform 0.3s ease" : "transform 0.3s ease",
    }}>
      {/* Hover + drag styles */}
      <style>{`
        .fp-row { transition: background 0.12s ease; }
        .fp-row:hover { background: ${dark ? "rgba(136,136,136,0.08)" : "rgba(0,0,0,0.04)"} !important; }
        .fp-card { transition: filter 0.12s ease; }
        .fp-card:hover { filter: brightness(${dark ? 1.4 : 0.95}); }
        .fp-bar { transition: filter 0.12s ease; }
        .fp-bar:hover { filter: brightness(1.5); }
        .fp-drag { opacity: 0; transition: opacity 0.2s ease; }
        .fp-drag:hover, .fp-drag:active { opacity: 1; }
      `}</style>

      {/* Drag handle */}
      <div className="fp-drag" onMouseDown={handleDragStart} style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 6,
        cursor: "col-resize", zIndex: 51, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ width: 3, height: 48, borderRadius: 2, background: colors.textMuted }} />
      </div>

      {/* Header */}
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: colors.textWhite }}>{`Flight Statistics`}</span>
          <button onClick={handleClose} style={{
            width: 28, height: 28, borderRadius: "50%", background: "transparent",
            border: "none", color: colors.textGray, fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            ✕
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, width: "100%" }}>
          {(["airport", "all-taiwan"] as const).map((id) => {
            const active = tab === id;
            const label = id === "airport" ? "AIRPORT" : "ALL TAIWAN";
            return (
              <button key={id} onClick={() => { setTab(id); setDrillDown(null); }} style={{
                padding: "4px 10px", fontSize: 11, fontWeight: active ? 700 : 500,
                letterSpacing: 0.5, fontFamily: font, cursor: "pointer", border: "none",
                color: active ? colors.textGray : colors.textMuted,
                background: active ? colors.tabActiveBg : "transparent",
              }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <Divider dark={dark} />

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "airport" ? (
          <AirportTab flights={allFlights} icao={selectedAirport} dark={dark}
            drillDown={drillDown} setDrillDown={setDrillDown} onSelectFlight={onSelectFlight} />
        ) : (
          <AllTaiwanTab flights={allFlights} dark={dark} onSelectAirport={handleSelectAirport} />
        )}
      </div>
    </div>
  );
}
