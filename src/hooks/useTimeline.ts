import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dateToUnixTW } from "../utils/dateUtils";

interface UseTimelineOptions {
  availableDates: string[];
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
}

export function useTimeline({
  availableDates,
}: UseTimelineOptions): UseTimelineReturn {
  // 初始選 2026-02-18（主要資料日期），fallback 到第一個可用日期
  const preferredDate = "2026-02-18";
  const initialDate = availableDates.includes(preferredDate)
    ? preferredDate
    : availableDates.length > 0
      ? availableDates[0]!
      : new Date().toISOString().slice(0, 10);

  const [selectedDate, setSelectedDateRaw] = useState(initialDate);
  const [rangeDays, setRangeDaysRaw] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  // 計算 windowStart / windowEnd
  const windowStart = useMemo(() => dateToUnixTW(selectedDate), [selectedDate]);
  const windowEnd = useMemo(
    () => {
      const [y, m, d] = selectedDate.split("-").map(Number);
      const endDate = new Date(Date.UTC(y!, m! - 1, d! + rangeDays, 0, 0, 0) - 8 * 3600_000 - 1000);
      return Math.floor(endDate.getTime() / 1000);
    },
    [selectedDate, rangeDays],
  );

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

  // availableDates 改變時，若 selectedDate 不在列表中，選第二個（2/19），fallback 第一個
  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
      setSelectedDateRaw(availableDates.length > 1 ? availableDates[1]! : availableDates[0]!);
    }
  }, [availableDates, selectedDate]);

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
  };
}
