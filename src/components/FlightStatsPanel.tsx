import { useMemo, useState } from "react";
import type {
  Flight,
  StatsTab,
  StatsDrillDown,
  DailyStat,
  HourlyStat,
  CountryGroup,
  AircraftTypeStat,
  AirlineStat,
  DurationBucket,
  AirportComparison,
  DomesticRoute,
} from "../types";
import { AIRPORT_INFO } from "../map/cameraPresets";
import { ICAO_TO_IATA } from "../data/flightLoader";
import {
  computeDailyStats,
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
} from "../data/flightStats";

interface Props {
  allFlights: Flight[];
  selectedAirport: string;
  isDarkTheme: boolean;
  onClose: () => void;
  onSelectAirport: (icao: string) => void;
  onSelectFlight: (flightId: string) => void;
}

/* ── Style helpers ── */

const glass = (dark: boolean): React.CSSProperties => ({
  background: dark ? "rgba(15,15,25,0.92)" : "rgba(245,245,250,0.92)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
});

const sectionTitle = (dark: boolean): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1.5,
  color: dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
  margin: "16px 0 8px",
  fontFamily: "monospace",
});

const textPrimary = (dark: boolean) =>
  dark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)";
const textSecondary = (dark: boolean) =>
  dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
const textMuted = (dark: boolean) =>
  dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)";
const barColor = (dark: boolean) =>
  dark ? "rgba(100,170,255,0.6)" : "rgba(60,130,230,0.5)";
const barBg = (dark: boolean) =>
  dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
const accentColor = "rgba(100,170,255,0.8)";

/* ── Bar Chart ── */

function BarChart({
  items,
  maxValue,
  dark,
  labelWidth,
  onClickItem,
  renderLabel,
  renderValue,
}: {
  items: { key: string; value: number; label: string }[];
  maxValue: number;
  dark: boolean;
  labelWidth?: number;
  onClickItem?: (key: string) => void;
  renderLabel?: (item: { key: string; label: string; value: number }) => React.ReactNode;
  renderValue?: (item: { key: string; label: string; value: number }) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  const max = maxValue || Math.max(...items.map((i) => i.value));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {items.map((item) => (
        <div
          key={item.key}
          onClick={onClickItem ? () => onClickItem(item.key) : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: onClickItem ? "pointer" : "default",
            padding: "2px 0",
            borderRadius: 3,
          }}
        >
          <span
            style={{
              width: labelWidth ?? 36,
              fontSize: 11,
              fontFamily: "monospace",
              color: textSecondary(dark),
              textAlign: "right",
              flexShrink: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {renderLabel ? renderLabel(item) : item.label}
          </span>
          <div
            style={{
              flex: 1,
              height: 14,
              background: barBg(dark),
              borderRadius: 2,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                width: `${max > 0 ? (item.value / max) * 100 : 0}%`,
                height: "100%",
                background: barColor(dark),
                borderRadius: 2,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <span
            style={{
              minWidth: 32,
              fontSize: 11,
              fontFamily: "monospace",
              color: textSecondary(dark),
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            {renderValue ? renderValue(item) : item.value}
          </span>
          {onClickItem && (
            <span style={{ fontSize: 10, color: textMuted(dark) }}>{">"}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Tab Button ── */

function TabButton({
  label,
  active,
  dark,
  onClick,
}: {
  label: string;
  active: boolean;
  dark: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 0",
        fontSize: 11,
        fontFamily: "monospace",
        fontWeight: active ? 700 : 400,
        letterSpacing: 0.5,
        color: active ? textPrimary(dark) : textSecondary(dark),
        background: active
          ? (dark ? "rgba(100,170,255,0.15)" : "rgba(100,170,255,0.12)")
          : "transparent",
        border: `1px solid ${active ? (dark ? "rgba(100,170,255,0.4)" : "rgba(100,170,255,0.3)") : "transparent"}`,
        borderRadius: 4,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

/* ── Airport Tab Content ── */

function AirportTabContent({
  flights,
  icao,
  dark,
  drillDown,
  setDrillDown,
  onSelectFlight,
}: {
  flights: Flight[];
  icao: string;
  dark: boolean;
  drillDown: StatsDrillDown | null;
  setDrillDown: (d: StatsDrillDown | null) => void;
  onSelectFlight: (id: string) => void;
}) {
  const daily = useMemo(() => computeDailyStats(flights, icao), [flights, icao]);
  const hourly = useMemo(() => computeHourlyStats(flights, icao), [flights, icao]);
  const destStats = useMemo(() => computeDestinationStats(flights, icao), [flights, icao]);
  const countries = useMemo(() => groupByCountry(destStats), [destStats]);
  const aircraft = useMemo(() => getAircraftTypeStats(flights, icao), [flights, icao]);
  const airlines = useMemo(() => getAirlineStats(flights, icao), [flights, icao]);
  const duration = useMemo(() => getFlightDurationDistribution(flights, icao), [flights, icao]);
  const days = useMemo(() => getUniqueDays(flights, icao), [flights, icao]);
  const totalFlights = useMemo(
    () => flights.filter((f) => f.origin_icao === icao || f.dest_icao === icao).length,
    [flights, icao],
  );

  const info = AIRPORT_INFO[icao];

  // Drill-down: show route flights
  if (drillDown?.type === "route") {
    const [originIcao, destIcao] = drillDown.key.split("|") as [string, string];
    const routeFlights = getRouteFlights(flights, originIcao, destIcao);
    return (
      <div>
        <button
          onClick={() => setDrillDown(null)}
          style={{
            background: "none",
            border: "none",
            color: accentColor,
            fontSize: 11,
            fontFamily: "monospace",
            cursor: "pointer",
            padding: 0,
            marginBottom: 8,
          }}
        >
          {"< Back"}
        </button>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: textPrimary(dark),
            fontFamily: "monospace",
          }}
        >
          {drillDown.label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: textSecondary(dark),
            fontFamily: "monospace",
            marginBottom: 12,
          }}
        >
          {routeFlights.length} flights
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {routeFlights.map((f) => (
            <div
              key={f.fr24_id}
              onClick={() => onSelectFlight(f.fr24_id)}
              style={{
                display: "flex",
                gap: 8,
                padding: "5px 8px",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 11,
                background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              }}
            >
              <span style={{ color: textPrimary(dark), fontWeight: 600, minWidth: 55 }}>
                {f.callsign}
              </span>
              <span style={{ color: textSecondary(dark) }}>
                {f.dep_time > 0
                  ? new Date(f.dep_time * 1000).toLocaleString("zh-TW", {
                      timeZone: "Asia/Taipei",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })
                  : "--"}
              </span>
              <span style={{ color: textMuted(dark) }}>{f.aircraft_type}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Drill-down: show country airports
  if (drillDown?.type === "country") {
    const group = countries.find((c) => c.country === drillDown.key);
    if (!group) return null;
    return (
      <div>
        <button
          onClick={() => setDrillDown(null)}
          style={{
            background: "none",
            border: "none",
            color: accentColor,
            fontSize: 11,
            fontFamily: "monospace",
            cursor: "pointer",
            padding: 0,
            marginBottom: 8,
          }}
        >
          {"< Back"}
        </button>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: textPrimary(dark),
            fontFamily: "monospace",
          }}
        >
          {info?.iata ?? icao} → {group.country}
        </div>
        <div
          style={{
            fontSize: 11,
            color: textSecondary(dark),
            fontFamily: "monospace",
            marginBottom: 12,
          }}
        >
          {group.totalFlights} flights · {group.airports.length} airports
        </div>
        <BarChart
          items={group.airports.map((a) => ({
            key: a.icao,
            label: a.iata,
            value: a.count,
          }))}
          maxValue={group.airports[0]?.count ?? 1}
          dark={dark}
          onClickItem={(key) =>
            setDrillDown({
              type: "route",
              key: `${icao}|${key}`,
              label: `${info?.iata ?? icao} → ${ICAO_TO_IATA[key] ?? key}`,
            })
          }
        />
      </div>
    );
  }

  const maxDaily = Math.max(...daily.map((d) => d.total), 1);
  const maxHourly = Math.max(...hourly.map((h) => h.count), 1);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: textPrimary(dark),
            fontFamily: "monospace",
            letterSpacing: 1,
          }}
        >
          {icao} {info?.name ?? ""} ({info?.iata ?? ""})
        </div>
        <div
          style={{
            fontSize: 11,
            color: textSecondary(dark),
            fontFamily: "monospace",
            marginTop: 2,
          }}
        >
          {totalFlights} flights · {days} days
        </div>
      </div>

      {/* Daily Totals */}
      <div style={sectionTitle(dark)}>DAILY TOTALS</div>
      {daily.map((d) => (
        <div
          key={d.date}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 3,
          }}
        >
          <span
            style={{
              minWidth: 50,
              fontSize: 11,
              fontFamily: "monospace",
              color: textSecondary(dark),
            }}
          >
            {d.date.slice(5)}
          </span>
          <div
            style={{
              flex: 1,
              height: 14,
              background: barBg(dark),
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(d.total / maxDaily) * 100}%`,
                height: "100%",
                background: barColor(dark),
                borderRadius: 2,
                transition: "width 0.3s",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 10,
              fontFamily: "monospace",
              color: textMuted(dark),
              minWidth: 80,
              textAlign: "right",
            }}
          >
            {d.departures}↑ {d.arrivals}↓
          </span>
        </div>
      ))}

      {/* Hourly Pattern */}
      <div style={sectionTitle(dark)}>HOURLY PATTERN</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {hourly.map((h) => (
          <div
            key={h.hour}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                minWidth: 20,
                fontSize: 10,
                fontFamily: "monospace",
                color: textMuted(dark),
                textAlign: "right",
              }}
            >
              {String(h.hour).padStart(2, "0")}
            </span>
            <div
              style={{
                flex: 1,
                height: 10,
                background: barBg(dark),
                borderRadius: 1,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${maxHourly > 0 ? (h.count / maxHourly) * 100 : 0}%`,
                  height: "100%",
                  background: barColor(dark),
                  borderRadius: 1,
                }}
              />
            </div>
            <span
              style={{
                minWidth: 24,
                fontSize: 10,
                fontFamily: "monospace",
                color: textMuted(dark),
                textAlign: "right",
              }}
            >
              {h.count || ""}
            </span>
          </div>
        ))}
      </div>

      {/* Top Destinations */}
      <div style={sectionTitle(dark)}>TOP DESTINATIONS</div>
      <BarChart
        items={countries.slice(0, 10).map((c) => ({
          key: c.country,
          label: c.country,
          value: c.totalFlights,
        }))}
        maxValue={countries[0]?.totalFlights ?? 1}
        dark={dark}
        labelWidth={75}
        onClickItem={(key) =>
          setDrillDown({ type: "country", key, label: key })
        }
      />

      {/* Aircraft Types */}
      <div style={sectionTitle(dark)}>AIRCRAFT TYPES</div>
      <BarChart
        items={aircraft.slice(0, 8).map((a) => ({
          key: a.type,
          label: a.type,
          value: a.count,
        }))}
        maxValue={aircraft[0]?.count ?? 1}
        dark={dark}
      />

      {/* Airline Breakdown */}
      <div style={sectionTitle(dark)}>AIRLINE BREAKDOWN</div>
      <BarChart
        items={airlines.slice(0, 10).map((a) => ({
          key: a.code,
          label: a.code,
          value: a.count,
        }))}
        maxValue={airlines[0]?.count ?? 1}
        dark={dark}
      />

      {/* Flight Duration */}
      <div style={sectionTitle(dark)}>FLIGHT DURATION</div>
      <BarChart
        items={duration.map((b) => ({
          key: b.label,
          label: b.label,
          value: b.count,
        }))}
        maxValue={Math.max(...duration.map((b) => b.count), 1)}
        dark={dark}
        renderValue={(item) => {
          const bucket = duration.find((b) => b.label === item.key);
          return (
            <span>
              {item.value}{" "}
              <span style={{ fontSize: 9, color: textMuted(dark) }}>
                {bucket?.tag}
              </span>
            </span>
          );
        }}
      />
    </div>
  );
}

/* ── All Taiwan Tab Content ── */

function AllTaiwanTabContent({
  flights,
  dark,
  onSelectAirport,
}: {
  flights: Flight[];
  dark: boolean;
  onSelectAirport: (icao: string) => void;
}) {
  const comparison = useMemo(() => computeAirportComparison(flights), [flights]);
  const reachable = useMemo(() => computeReachableDestinations(flights), [flights]);
  const domestic = useMemo(() => computeDomesticRoutes(flights), [flights]);

  return (
    <div>
      {/* Airport Comparison */}
      <div style={sectionTitle(dark)}>AIRPORT COMPARISON</div>
      <BarChart
        items={comparison.map((a) => ({
          key: a.icao,
          label: a.iata,
          value: a.count,
        }))}
        maxValue={comparison[0]?.count ?? 1}
        dark={dark}
        onClickItem={onSelectAirport}
      />

      {/* Reachable Destinations */}
      <div style={sectionTitle(dark)}>REACHABLE DESTINATIONS</div>
      {reachable.slice(0, 10).map((g) => (
        <div
          key={g.country}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
            fontFamily: "monospace",
          }}
        >
          <span
            style={{
              minWidth: 70,
              fontSize: 11,
              color: textSecondary(dark),
            }}
          >
            {g.country}
          </span>
          <span
            style={{
              fontSize: 10,
              color: textMuted(dark),
              minWidth: 60,
            }}
          >
            {g.airports.length} airports
          </span>
          <div
            style={{
              flex: 1,
              height: 12,
              background: barBg(dark),
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(g.totalFlights / (reachable[0]?.totalFlights ?? 1)) * 100}%`,
                height: "100%",
                background: barColor(dark),
                borderRadius: 2,
              }}
            />
          </div>
          <span
            style={{
              minWidth: 32,
              fontSize: 11,
              fontFamily: "monospace",
              color: textSecondary(dark),
              textAlign: "right",
            }}
          >
            {g.totalFlights}
          </span>
        </div>
      ))}

      {/* Domestic Routes */}
      <div style={sectionTitle(dark)}>DOMESTIC ROUTES</div>
      {domestic.length === 0 ? (
        <div
          style={{
            fontSize: 11,
            color: textMuted(dark),
            fontFamily: "monospace",
          }}
        >
          No domestic routes found
        </div>
      ) : (
        domestic.slice(0, 10).map((r) => (
          <div
            key={`${r.from}-${r.to}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 3,
              fontFamily: "monospace",
              fontSize: 11,
            }}
          >
            <span style={{ color: textPrimary(dark), minWidth: 80 }}>
              {r.fromIata}↔{r.toIata}
            </span>
            <div
              style={{
                flex: 1,
                height: 12,
                background: barBg(dark),
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(r.count / (domestic[0]?.count ?? 1)) * 100}%`,
                  height: "100%",
                  background: barColor(dark),
                  borderRadius: 2,
                }}
              />
            </div>
            <span style={{ color: textSecondary(dark), minWidth: 32, textAlign: "right" }}>
              {r.count}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/* ── Main Panel ── */

export function FlightStatsPanel({
  allFlights,
  selectedAirport,
  isDarkTheme: dark,
  onClose,
  onSelectAirport,
  onSelectFlight,
}: Props) {
  const [tab, setTab] = useState<StatsTab>("airport");
  const [drillDown, setDrillDown] = useState<StatsDrillDown | null>(null);
  const [visible, setVisible] = useState(true);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleSelectAirport = (icao: string) => {
    onSelectAirport(icao);
    setTab("airport");
    setDrillDown(null);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        zIndex: 50,
        ...glass(dark),
        borderLeft: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        transform: visible ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s ease",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 10px",
          borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: textPrimary(dark),
            letterSpacing: 1,
          }}
        >
          Flight Statistics
        </span>
        <button
          onClick={handleClose}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            border: "none",
            color: textSecondary(dark),
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "10px 16px 8px",
          flexShrink: 0,
        }}
      >
        <TabButton
          label="Airport"
          active={tab === "airport"}
          dark={dark}
          onClick={() => {
            setTab("airport");
            setDrillDown(null);
          }}
        />
        <TabButton
          label="All Taiwan"
          active={tab === "all-taiwan"}
          dark={dark}
          onClick={() => {
            setTab("all-taiwan");
            setDrillDown(null);
          }}
        />
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 16px 20px",
        }}
      >
        {tab === "airport" ? (
          <AirportTabContent
            flights={allFlights}
            icao={selectedAirport}
            dark={dark}
            drillDown={drillDown}
            setDrillDown={setDrillDown}
            onSelectFlight={onSelectFlight}
          />
        ) : (
          <AllTaiwanTabContent
            flights={allFlights}
            dark={dark}
            onSelectAirport={handleSelectAirport}
          />
        )}
      </div>
    </div>
  );
}
