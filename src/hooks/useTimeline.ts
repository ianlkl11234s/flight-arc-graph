import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  setSelectedDate: (d: string) => void;
  shiftDate: (delta: number) => void;
  setRangeDays: (n: number) => void;
}

/** 將 "YYYY-MM-DD" 轉成台灣時區 00:00:00 的 unix sec */
function dateToUnixTW(dateStr: string): number {
  // dateStr = "YYYY-MM-DD", 台灣 UTC+8
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcMs = Date.UTC(y!, m! - 1, d!, 0, 0, 0) - 8 * 3600_000;
  return utcMs / 1000;
}

export function useTimeline({
  availableDates,
}: UseTimelineOptions): UseTimelineReturn {
  // 初始選最後一個 available date
  const initialDate = availableDates.length > 0
    ? availableDates[availableDates.length - 1]!
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

  const duration = windowEnd - windowStart;
  const progress = duration > 0 ? (currentTime - windowStart) / duration : 0;

  // 切日期或 rangeDays 時 reset currentTime
  useEffect(() => {
    setCurrentTime(windowStart);
  }, [windowStart]);

  // availableDates 改變時，若 selectedDate 不在列表中，選最後一個
  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
      setSelectedDateRaw(availableDates[availableDates.length - 1]!);
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
    (d: string) => {
      setSelectedDateRaw(d);
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
    setSelectedDate,
    shiftDate,
    setRangeDays,
  };
}
