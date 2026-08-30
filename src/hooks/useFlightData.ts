import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Flight, DataSource, Region, Scope } from "../types";
import {
  filterByAirport,
  getTimeRange,
  loadAirportFlights,
  loadAirportSelectionFlights,
  loadRegionFullFlights,
  loadAirspaceManifest,
  loadAirspaceDays,
  loadManifest,
  getManifestAirports,
  getRegionDates,
  getRegionFullDates,
} from "../data/flightLoader";
import type { AirportManifestEntry } from "../data/flightLoader";

interface UseFlightDataReturn {
  allFlights: Flight[];
  airports: string[];
  /** manifest 的機場目錄（isCore / dates / fullDates），key = ICAO */
  airportCatalog: Record<string, AirportManifestEntry>;
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
  airportSelection?: string[] | null,
): UseFlightDataReturn {
  const [trackFlights, setTrackFlights] = useState<Flight[]>([]);
  const [airspaceFlights, setAirspaceFlights] = useState<Flight[] | null>(null);
  const [allAirports, setAllAirports] = useState<string[]>([]);
  const [airportCatalog, setAirportCatalog] = useState<Record<string, AirportManifestEntry>>({});
  const [airspaceDates, setAirspaceDates] = useState<string[]>([]);
  const [regionDatesMap, setRegionDatesMap] = useState<Record<string, string[]>>({});
  const [regionFullDatesMap, setRegionFullDatesMap] = useState<Record<string, string[]>>({});
  const [selectedAirport, setSelectedAirport] = useState("RCTP");
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; label: string } | null>(null);

  const loadIdRef = useRef(0);
  const manifestRef = useRef<{ airports: Record<string, { flights: number }> } | null>(null);

  // 載入 manifest（機場列表）+ airspace manifest（一次性）
  useEffect(() => {
    loadManifest().then((m) => {
      manifestRef.current = m;
      setAllAirports(getManifestAirports(m));
      setAirportCatalog(m.airports);
      // 各 region 日期
      const rdm: Record<string, string[]> = {};
      for (const r of ["TW", "JP", "HK", "KR", "TH", "US", "UK", "world"]) {
        rdm[r] = getRegionDates(m, r);
      }
      setRegionDatesMap(rdm);
      const rfdm: Record<string, string[]> = {};
      for (const r of ["TW", "JP", "HK", "KR", "TH", "US", "UK", "world"]) {
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

    // 從 manifest 取得預期總數
    const manifest = manifestRef.current;
    let expectedTotal = 0;
    if (airportSelection !== null && airportSelection !== undefined) {
      // 多機場 union 會按 fr24_id 去重，各機場 manifest 總數相加不是可靠分母。
      expectedTotal = 0;
    } else if (scope === "airport") {
      expectedTotal = manifest?.airports[selectedAirport]?.flights ?? 0;
    } else {
      // region: 加總所有匹配機場的航班數
      const REGION_PREFIX: Record<string, string[]> = {
        TW: ["RC"], JP: ["RJ", "RO"], HK: ["VH"], US: ["K"], UK: ["EG"], world: [], all: [],
      };
      const prefixes = REGION_PREFIX[region] ?? [];
      if (prefixes.length > 0 && manifest) {
        for (const [icao, info] of Object.entries(manifest.airports)) {
          if (prefixes.some((p) => icao.startsWith(p))) expectedTotal += info.flights;
        }
      } else if (manifest) {
        expectedTotal = Object.values(manifest.airports).reduce((s, a) => s + a.flights, 0);
      }
    }

    let lastProgressUpdate = 0;

    const onProgress = (_flights: Flight[], total: number) => {
      if (loadIdRef.current !== loadId) return;
      const now = Date.now();
      if (now - lastProgressUpdate > 300) {
        lastProgressUpdate = now;
        const label = expectedTotal > 0 ? `${total} / ${expectedTotal} flights` : `${total} flights`;
        setLoadingProgress({ loaded: total, label });
      }
    };

    if (airportSelection !== null && airportSelection !== undefined) {
      loadAirportSelectionFlights(
        airportSelection,
        onProgress,
        () => loadIdRef.current !== loadId,
      ).then((flights) => {
        if (loadIdRef.current !== loadId) return;
        setTrackFlights(flights);
        setLoadingProgress(null);
        setLoading(false);
      });
    } else if (scope === "airport") {
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
  }, [dataSource, scope, region, selectedAirport, airportSelection]);

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
    airportCatalog,
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
