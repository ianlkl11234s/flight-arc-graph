import { useCallback, useEffect, useState } from "react";
import type { Flight } from "../types";
import {
  filterByAirport,
  getTimeRange,
  getTaiwanAirports,
  loadFlights,
  updateCachedFlights,
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
}

export function useFlightData(): UseFlightDataReturn {
  const [allFlights, setAllFlights] = useState<Flight[]>([]);
  const [airports, setAirports] = useState<string[]>([]);
  const [selectedAirport, setSelectedAirport] = useState("RCTP");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFlights().then((flights) => {
      setAllFlights(flights);
      setAirports(getTaiwanAirports(flights));
      setLoading(false);

      // 若載入的是融合資料，跳過 S3 合併（避免混入其他日期）
      const hasFusedData = flights.some((f) => f.fr24_id.startsWith("snap_"));
      if (hasFusedData) {
        console.log("[Hook] Fused data detected, skipping S3 merge");
        return;
      }

      // 背景檢查 S3 是否有新資料
      mergeS3Updates(flights).then((merged) => {
        if (merged !== flights) {
          updateCachedFlights(merged);
          setAllFlights(merged);
          setAirports(getTaiwanAirports(merged));
        }
      });
    });
  }, []);

  const filteredFlights = filterByAirport(allFlights, selectedAirport);
  const timeRange = filteredFlights.length
    ? getTimeRange(filteredFlights)
    : { start: 0, end: 0 };

  const handleSetAirport = useCallback((icao: string) => {
    setSelectedAirport(icao);
  }, []);

  return {
    allFlights,
    filteredFlights,
    airports,
    selectedAirport,
    setSelectedAirport: handleSetAirport,
    timeRange,
    loading,
  };
}
