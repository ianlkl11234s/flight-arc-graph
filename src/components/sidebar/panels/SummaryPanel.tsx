import { useMemo } from "react";
import type { Region, Scope, Flight } from "../../../types";
import { getAirportInfo } from "../../../map/cameraPresets";
import { getDepArrCount, computeTopRoutes, getAirlineStats, getFleetMix, getFlightDurationDistribution, computeHourlyStats, computeDailyStats, computeAirportComparison, getUniqueDays } from "../../../data/flightStats";
import { FONT } from "../../../styles/tokens";
import type { ThemeColors } from "../theme";
import { SectionHeader, StatRow, MiniBar } from "../primitives";
import { HourlyHeatmap, DailyTrendChart } from "../charts";

/* ── Summary Panel ──────────────────────────────────────── */

export function SummaryPanel({ flights, selectedAirport, scope, region, rangeDays, theme }: {
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
        <div style={{ fontSize: 11, color: theme.NO_DATA_TEXT, fontFamily: FONT.ui, textAlign: "center", padding: "20px 0" }}>
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
                <div key={r.destIcao} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: FONT.ui, padding: "2px 0" }}>
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
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.ACCENT, fontFamily: FONT.ui }}>{f.percentage}%</div>
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
