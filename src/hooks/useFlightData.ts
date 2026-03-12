import { useCallback, useEffect, useMemo, useState } from "react";
import type { Flight, DataSource } from "../types";
import {
  filterByAirport,
  getTimeRange,
  getTaiwanAirports,
  loadTracks,
  loadAirspace,
  updateCachedTracks,
} from "../data/flightLoader";
import { mergeS3Updates } from "../data/s3Loader";

interface UseFlightDataReturn {
  allFlights: Flight[];
  filteredFlights: Flight[];
  airports: string[];
  selectedAirport: string;
  setSelectedAirport: (icao: string) => void;
  timeRange: { start: number; end: number };
  loading: boolean;
  hasFused: boolean;
}

export function useFlightData(dataSource: DataSource): UseFlightDataReturn {
  const [trackFlights, setTrackFlights] = useState<Flight[]>([]);
  const [airspaceFlights, setAirspaceFlights] = useState<Flight[] | null>(null);
  const [selectedAirport, setSelectedAirport] = useState("RCTP");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadTracks(), loadAirspace()]).then(
      ([tracks, airspace]) => {
        setTrackFlights(tracks);
        setAirspaceFlights(airspace);
        setLoading(false);

        // Tracks 背景檢查 S3 更新
        mergeS3Updates(tracks, "tracks").then((merged) => {
          if (merged !== tracks) {
            updateCachedTracks(merged);
            setTrackFlights(merged);
          }
        });
      },
    );
  }, []);

  const hasFused = airspaceFlights !== null && airspaceFlights.length > 0;

  // 根據 dataSource 選擇資料集
  const sourceFlights = useMemo(() => {
    if (dataSource === "fused" && airspaceFlights) return airspaceFlights;
    return trackFlights;
  }, [dataSource, trackFlights, airspaceFlights]);

  const airports = useMemo(
    () => getTaiwanAirports(sourceFlights),
    [sourceFlights],
  );

  const filteredFlights = filterByAirport(sourceFlights, selectedAirport);

  // 若 airport filter 結果為空（如快照航班沒有台灣機場），
  // fallback 用全部 sourceFlights 計算時間範圍
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
    filteredFlights,
    airports,
    selectedAirport,
    setSelectedAirport: handleSetAirport,
    timeRange,
    loading,
    hasFused,
  };
}
