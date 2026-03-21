import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Flight, DataSource, Region, Scope } from "../types";
import {
  filterByAirport,
  getTimeRange,
  loadAirportFlights,
  loadRegionFullFlights,
  loadAirspaceManifest,
  loadAirspaceDays,
  loadManifest,
  getManifestAirports,
  getRegionDates,
  getRegionFullDates,
} from "../data/flightLoader";

interface UseFlightDataReturn {
  allFlights: Flight[];
  airports: string[];
  selectedAirport: string;
  setSelectedAirport: (icao: string) => void;
  timeRange: { start: number; end: number };
  loading: boolean;
  loadingProgress: { loaded: number; label: string } | null;
  hasFused: boolean;
  airspaceDates: string[];
  regionDatesMap: Record<string, string[]>;
  regionFullDatesMap: Record<string, string[]>;
}

export function useFlightData(
  dataSource: DataSource,
  scope: Scope,
  region: Region,
  selectedDate?: string,
  rangeDays?: number,
): UseFlightDataReturn {
  const [trackFlights, setTrackFlights] = useState<Flight[]>([]);
  const [airspaceFlights, setAirspaceFlights] = useState<Flight[] | null>(null);
  const [allAirports, setAllAirports] = useState<string[]>([]);
  const [airspaceDates, setAirspaceDates] = useState<string[]>([]);
  const [regionDatesMap, setRegionDatesMap] = useState<Record<string, string[]>>({});
  const [regionFullDatesMap, setRegionFullDatesMap] = useState<Record<string, string[]>>({});
  const [selectedAirport, setSelectedAirport] = useState("RCTP");
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; label: string } | null>(null);

  const loadIdRef = useRef(0);

  // 載入 manifest（機場列表）+ airspace manifest（一次性）
  useEffect(() => {
    loadManifest().then((m) => {
      setAllAirports(getManifestAirports(m));
      // 各 region 日期
      const rdm: Record<string, string[]> = {};
      for (const r of ["TW", "JP", "HK", "US", "world"]) {
        rdm[r] = getRegionDates(m, r);
      }
      setRegionDatesMap(rdm);
      const rfdm: Record<string, string[]> = {};
      for (const r of ["TW", "JP", "HK", "US", "world"]) {
        rfdm[r] = getRegionFullDates(m, r);
      }
      setRegionFullDatesMap(rfdm);
    });
    loadAirspaceManifest().then((m) => {
      setAirspaceDates(m.dates.map((d) => d.date).sort());
    });
  }, []);

  // 載入 tracks：依 scope + region/airport 變化
  useEffect(() => {
    if (dataSource === "fused") return; // airspace 模式由另一個 effect 處理
    const loadId = ++loadIdRef.current;

    setLoading(true);
    setLoadingProgress({ loaded: 0, label: "Loading..." });

    // Streaming 期間：只更新計數器（輕量），不更新 flights state
    // 載入完成後一次性 setTrackFlights — 避免 Three.js 反覆重建幾何體
    let lastProgressUpdate = 0;

    const onProgress = (_flights: Flight[], total: number) => {
      if (loadIdRef.current !== loadId) return;
      const now = Date.now();
      if (now - lastProgressUpdate > 300) {
        lastProgressUpdate = now;
        setLoadingProgress({ loaded: total, label: `${total} flights` });
      }
    };

    if (scope === "airport") {
      loadAirportFlights(selectedAirport, onProgress).then((flights) => {
        if (loadIdRef.current !== loadId) return;
        setTrackFlights(flights);
        setLoadingProgress(null);
        setLoading(false);
      });
    } else {
      loadRegionFullFlights(
        region,
        onProgress,
        () => loadIdRef.current !== loadId,
      ).then((flights) => {
        if (loadIdRef.current !== loadId) return;
        setTrackFlights(flights);
        setLoadingProgress(null);
        setLoading(false);
      });
    }
  }, [dataSource, scope, region, selectedAirport]);

  // 載入 airspace：依 selectedDate + rangeDays 按天載入
  useEffect(() => {
    if (dataSource !== "fused") return;
    if (!selectedDate || airspaceDates.length === 0) return;

    const loadId = ++loadIdRef.current;
    setLoading(true);
    setLoadingProgress({ loaded: 0, label: "Loading airspace..." });

    // 計算需要載入的日期
    const days = rangeDays ?? 1;
    const startIdx = airspaceDates.indexOf(selectedDate);
    const datesToLoad: string[] = [];
    if (startIdx >= 0) {
      for (let i = 0; i < days && startIdx + i < airspaceDates.length; i++) {
        datesToLoad.push(airspaceDates[startIdx + i]!);
      }
    } else {
      // selectedDate 不在 airspace 日期列表中，找最近的
      datesToLoad.push(airspaceDates[airspaceDates.length - 1]!);
    }

    loadAirspaceDays(datesToLoad, (flights, total) => {
      if (loadIdRef.current !== loadId) return;
      setAirspaceFlights([...flights]);
      setLoadingProgress({ loaded: total, label: `${total} flights` });
      if (total > 0) setLoading(false);
    }).then((flights) => {
      if (loadIdRef.current !== loadId) return;
      setAirspaceFlights(flights);
      setLoadingProgress(null);
      setLoading(false);
    });
  }, [dataSource, selectedDate, rangeDays, airspaceDates]);

  const hasFused = airspaceDates.length > 0;

  const sourceFlights = useMemo(() => {
    if (dataSource === "fused" && airspaceFlights) return airspaceFlights;
    return trackFlights;
  }, [dataSource, trackFlights, airspaceFlights]);

  const airports = allAirports;
  const filteredFlights = filterByAirport(sourceFlights, selectedAirport);

  const timeRange = filteredFlights.length
    ? getTimeRange(filteredFlights)
    : sourceFlights.length
      ? getTimeRange(sourceFlights)
      : { start: 0, end: 0 };

  const handleSetAirport = useCallback((icao: string) => {
    setSelectedAirport(icao);
  }, []);

  return {
    allFlights: sourceFlights,
    airports,
    selectedAirport,
    setSelectedAirport: handleSetAirport,
    timeRange,
    loading,
    loadingProgress,
    hasFused,
    airspaceDates,
    regionDatesMap,
    regionFullDatesMap,
  };
}
