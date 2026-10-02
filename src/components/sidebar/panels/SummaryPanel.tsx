import { useMemo } from "react";
import type { Region, Scope, Flight } from "../../../types";
import { getAirportInfo } from "../../../map/cameraPresets";
import { getDepArrCount, computeTopRoutes, getAirlineStats, getFleetMix, getFlightDurationDistribution, computeHourlyStats, computeDailyStats, computeAirportComparison, getUniqueDays } from "../../../data/flightStats";
import { useTheme } from "../../../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../../../styles/tokens";
import { Section, StatCard } from "../../../ui";
import { HourlyHeatmap, DailyTrendChart, MiniBar } from "../charts";

/* ── Summary Panel ──────────────────────────────────────── */

export function SummaryPanel({ flights, selectedAirport, scope, region, rangeDays }: {
  flights: Flight[];
  selectedAirport: string;
  scope: Scope;
  region: Region;
  rangeDays: number;
}) {
  const { tokens } = useTheme();
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
      <Section title="SUMMARY · 總覽">
        <div style={{ fontSize: SIZE.body, color: tokens.fg3, fontFamily: FONT.ui, textAlign: "center", padding: "20px 0" }}>
          No flight data loaded
        </div>
      </Section>
    );
  }

  // ── Airport Scope ──
  if (isAirportScope && airportStats) {
    const { depArr, topRoutes, airlines, fleetMix, durations, peakHour, days, total, hourly, daily } = airportStats;
    return (
      <>
        <Section title={airportInfo ? `${airportInfo.iata} — ${airportInfo.name}` : selectedAirport}>
          {/* Key metrics */}
          <div style={{ padding: `${SPACE.s6}px ${SPACE.s8}px`, background: tokens.ctl, borderRadius: RADIUS.base }}>
            <StatCard layout="row" label="Total" value={total} sub={`${days}d`} />
            <StatCard layout="row" label="Dep" value={depArr.departures} />
            <StatCard layout="row" label="Arr" value={depArr.arrivals} />
            <StatCard layout="row" label="Peak" value={`${String(peakHour.hour).padStart(2, "0")}:00`} sub={`${peakHour.count} flights`} />
          </div>
        </Section>

        {/* Hourly Heatmap */}
        <Section title="HOURLY · 時段分布">
          <HourlyHeatmap hourly={hourly} />
        </Section>

        {/* Daily Trend (only for multi-day ranges) */}
        {rangeDays > 1 && daily.length > 1 && (
          <Section title="TREND · 每日趨勢">
            <DailyTrendChart daily={daily} />
          </Section>
        )}

        {/* Top Routes */}
        {topRoutes.length > 0 && (
          <Section title="ROUTES · 熱門航線">
            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s2 }}>
              {topRoutes.map((r) => (
                <div key={r.destIcao} style={{ display: "flex", justifyContent: "space-between", fontSize: SIZE.body, fontFamily: FONT.ui, padding: `${SPACE.s2}px 0` }}>
                  <span style={{ color: tokens.fg1 }}>
                    {r.originIata}→{r.destIata}
                    <span style={{ color: tokens.fg3, marginLeft: SPACE.s4, fontSize: SIZE.minor }}>{r.airlines.join("/")}</span>
                  </span>
                  <span style={{ color: tokens.fg1, fontFamily: FONT.data, fontVariantNumeric: "tabular-nums" }}>{r.count}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Top Airlines */}
        {airlines.length > 0 && (
          <Section title="AIRLINES · 航空公司">
            <MiniBar items={airlines.slice(0, 5).map((a) => ({ label: a.code, value: a.count }))} />
          </Section>
        )}

        {/* Fleet Mix */}
        {fleetMix.length > 0 && (
          <Section title="FLEET · 機型組成">
            <div style={{ display: "flex", gap: SPACE.s6 }}>
              {fleetMix.filter((f) => f.count > 0).map((f) => (
                <div key={f.category} style={{ flex: 1, minWidth: 0 }}>
                  <StatCard label={f.category} value={`${f.percentage}%`} />
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Duration Distribution */}
        {durations.some((d) => d.count > 0) && (
          <Section title="DURATION · 飛行時間">
            <MiniBar items={durations.filter((d) => d.count > 0).map((d) => ({ label: d.label, value: d.count }))} />
          </Section>
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
        <Section title={`${regionLabel} Overview`}>
          <div style={{ padding: `${SPACE.s6}px ${SPACE.s8}px`, background: tokens.ctl, borderRadius: RADIUS.base }}>
            <StatCard layout="row" label="Total" value={totalFlights.toLocaleString()} />
            <StatCard layout="row" label="Airports" value={uniqueAirports} />
            <StatCard layout="row" label="Domestic" value={domestic.toLocaleString()} />
            <StatCard layout="row" label="Int'l" value={international.toLocaleString()} />
          </div>
        </Section>

        {/* Airport Ranking */}
        {comparison.length > 0 && (
          <Section title="RANKING · 機場排名">
            <MiniBar items={comparison.slice(0, 8).map((a) => ({ label: a.iata, value: a.count }))} />
          </Section>
        )}
      </>
    );
  }

  return null;
}
