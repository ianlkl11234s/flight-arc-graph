import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dateToUnixTW } from "../utils/dateUtils";

interface UseTimelineOptions {
  availableDates: string[];
  /** 優先選用的日期（如該機場的 fullDate）；不給則維持 2026-02-18 */
  preferredDate?: string;
}

interface UseTimelineReturn {
  currentTime: number;
  playing: boolean;
  speed: number;
  progress: number;
  selectedDate: string;
  rangeDays: number;
  windowStart: number;
  windowEnd: number;
  selectedDates: string[];
  isMultiDateMode: boolean;
  dateWindowStarts: number[];
  dateWindowEnds: number[];
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (s: number) => void;
  seek: (time: number) => void;
  seekByProgress: (p: number) => void;
  /** 設定一個 pending seek — 會在日期/rangeDays 更新後自動 seek */
  seekDeferred: (time: number) => void;
  setSelectedDate: (d: string | null) => void;
  shiftDate: (delta: number) => void;
  setRangeDays: (n: number) => void;
  toggleMultiDate: (date: string) => void;
  clearMultiDates: () => void;
}

export function useTimeline({
  availableDates,
  preferredDate = "2026-02-18",
}: UseTimelineOptions): UseTimelineReturn {
  // 初始選 preferredDate（預設 2026-02-18 主資料日），fallback 到第一個可用日期
  const initialDate = availableDates.includes(preferredDate)
    ? preferredDate
    : availableDates.length > 0
      ? availableDates[0]!
      : new Date().toISOString().slice(0, 10);

  const [selectedDate, setSelectedDateRaw] = useState(initialDate);
  const [rangeDays, setRangeDaysRaw] = useState(1);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  const isMultiDateMode = selectedDates.length > 0;

  // 計算單一日期的 windowEnd
  const computeWindowEnd = (date: string, days: number) => {
    const [y, m, d] = date.split("-").map(Number);
    const endDate = new Date(Date.UTC(y!, m! - 1, d! + days, 0, 0, 0) - 8 * 3600_000 - 1000);
    return Math.floor(endDate.getTime() / 1000);
  };

  // 計算 windowStart / windowEnd（多日期模式下取最早/最晚）
  const windowStart = useMemo(() => {
    if (isMultiDateMode) {
      const sorted = [...selectedDates].sort();
      return dateToUnixTW(sorted[0]!);
    }
    return dateToUnixTW(selectedDate);
  }, [selectedDate, selectedDates, isMultiDateMode]);

  const windowEnd = useMemo(() => {
    if (isMultiDateMode) {
      const sorted = [...selectedDates].sort();
      return computeWindowEnd(sorted[sorted.length - 1]!, 1);
    }
    return computeWindowEnd(selectedDate, rangeDays);
  }, [selectedDate, rangeDays, selectedDates, isMultiDateMode]);

  // 多日期模式下各日期的個別時間窗口（用於 displayedFlights 篩選）
  const dateWindowStarts = useMemo(() => {
    if (!isMultiDateMode) return [];
    return selectedDates.map((d) => dateToUnixTW(d));
  }, [isMultiDateMode, selectedDates]);

  const dateWindowEnds = useMemo(() => {
    if (!isMultiDateMode) return [];
    return selectedDates.map((d) => computeWindowEnd(d, 1));
  }, [isMultiDateMode, selectedDates]);

  const [currentTime, setCurrentTime] = useState(windowStart);
  const pendingSeekRef = useRef<number | null>(null);
  const manualSeekRef = useRef<number>(0); // 手動 seek 後短暫保護，不被 reset

  const duration = windowEnd - windowStart;
  const progress = duration > 0 ? (currentTime - windowStart) / duration : 0;

  // 切日期或 rangeDays 時：若有 pending seek 就 seek 到那個時間，否則 reset
  useEffect(() => {
    if (pendingSeekRef.current !== null) {
      const t = pendingSeekRef.current;
      pendingSeekRef.current = null;
      setCurrentTime(Math.max(windowStart, Math.min(windowEnd, t)));
    } else if (Date.now() - manualSeekRef.current > 500) {
      // 若剛手動 seek 過（500ms 內），不要被 reset
      setCurrentTime(windowStart);
    }
  }, [windowStart, windowEnd]);

  // availableDates 改變時（如切換機場），若 selectedDate 不在列表中，
  // 優先跳到 preferredDate（該機場的完整資料日），fallback 第一個可用日期
  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
      setSelectedDateRaw(
        availableDates.includes(preferredDate) ? preferredDate : availableDates[0]!,
      );
    }
  }, [availableDates, selectedDate, preferredDate]);

  // 動畫循環
  useEffect(() => {
    if (!playing) return;

    const animate = (now: number) => {
      if (lastFrameRef.current === 0) lastFrameRef.current = now;
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      setCurrentTime((prev) => {
        const next = prev + dt * speed;
        if (next >= windowEnd) {
          setPlaying(false);
          return windowStart; // loop back
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    lastFrameRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, windowStart, windowEnd]);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);

  const seek = useCallback(
    (time: number) => {
      manualSeekRef.current = Date.now();
      setCurrentTime(Math.max(windowStart, Math.min(windowEnd, time)));
    },
    [windowStart, windowEnd],
  );

  const seekByProgress = useCallback(
    (p: number) => {
      seek(windowStart + p * duration);
    },
    [seek, windowStart, duration],
  );

  const setSelectedDate = useCallback(
    (d: string | null) => {
      if (d !== null) setSelectedDateRaw(d);
    },
    [],
  );

  const shiftDate = useCallback(
    (delta: number) => {
      if (availableDates.length === 0) return;
      const idx = availableDates.indexOf(selectedDate);
      if (idx < 0) {
        // 找最接近的
        setSelectedDateRaw(availableDates[availableDates.length - 1]!);
        return;
      }
      const newIdx = Math.max(0, Math.min(availableDates.length - 1, idx + delta));
      setSelectedDateRaw(availableDates[newIdx]!);
    },
    [availableDates, selectedDate],
  );

  const seekDeferred = useCallback((time: number) => {
    pendingSeekRef.current = time;
  }, []);

  const setRangeDays = useCallback((n: number) => {
    setRangeDaysRaw(n);
  }, []);

  const toggleMultiDate = useCallback((date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date],
    );
  }, []);

  const clearMultiDates = useCallback(() => {
    setSelectedDates([]);
  }, []);

  return {
    currentTime,
    playing,
    speed,
    progress,
    selectedDate,
    rangeDays,
    windowStart,
    windowEnd,
    play,
    pause,
    toggle,
    setSpeed,
    seek,
    seekByProgress,
    seekDeferred,
    setSelectedDate,
    shiftDate,
    setRangeDays,
    selectedDates,
    isMultiDateMode,
    dateWindowStarts,
    dateWindowEnds,
    toggleMultiDate,
    clearMultiDates,
  };
}
