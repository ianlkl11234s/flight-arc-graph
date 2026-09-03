import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dateToUnixTW } from "../utils/dateUtils";

/** currentTime state 節流發布頻率（Phase 1-3：播放時鐘留在 ref，React 只需 ~10 Hz） */
const STATE_PUBLISH_INTERVAL_MS = 100;

interface UseTimelineOptions {
  availableDates: string[];
  /** 優先選用的日期（如該機場的 fullDate）；不給則維持 2026-02-18 */
  preferredDate?: string;
  /** 每個 rAF 幀都會呼叫（不受 10 Hz state 節流影響），給 App 觸發 map repaint 用 */
  onTick?: (t: number) => void;
}

interface UseTimelineReturn {
  currentTime: number;
  /**
   * 播放時鐘的絕對真值：rAF 迴圈每幀直接寫入，不經過 React state。currentTime
   * state 只是節流到 ~10 Hz 後給 slider／時間標籤用的「發布快照」——需要逐幀精度
   * 的消費者（custom layer getCurrentTime、錄影 overlay、晨昏線、viewshed
   * track-single）一律讀這個 ref，不要讀 currentTime state。
   */
  timeRef: { current: number };
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
  onTick,
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
  // 播放時鐘真值（見 UseTimelineReturn.timeRef 註解）
  const timeRef = useRef(windowStart);
  const lastPublishRef = useRef(0); // 上次發布 state 的 performance.now()，節流用
  const pendingSeekRef = useRef<number | null>(null);
  const manualSeekRef = useRef<number>(0); // 手動 seek 後短暫保護，不被 reset

  const duration = windowEnd - windowStart;
  const progress = duration > 0 ? (currentTime - windowStart) / duration : 0;

  /** 立即發布：同步寫 ref + state，不等節流窗。seek／play／pause／loop back 都走這個 */
  const publishNow = useCallback((t: number) => {
    timeRef.current = t;
    lastPublishRef.current = performance.now();
    setCurrentTime(t);
  }, []);

  // 切日期或 rangeDays 時：若有 pending seek 就 seek 到那個時間，否則 reset
  useEffect(() => {
    if (pendingSeekRef.current !== null) {
      const t = pendingSeekRef.current;
      pendingSeekRef.current = null;
      publishNow(Math.max(windowStart, Math.min(windowEnd, t)));
    } else if (Date.now() - manualSeekRef.current > 500) {
      // 若剛手動 seek 過（500ms 內），不要被 reset
      publishNow(windowStart);
    }
  }, [windowStart, windowEnd, publishNow]);

  // availableDates 改變時（如切換機場），若 selectedDate 不在列表中，
  // 優先跳到 preferredDate（該機場的完整資料日），fallback 第一個可用日期
  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
      setSelectedDateRaw(
        availableDates.includes(preferredDate) ? preferredDate : availableDates[0]!,
      );
    }
  }, [availableDates, selectedDate, preferredDate]);

  // 動畫循環（Phase 1-3）：rAF 每幀只寫 timeRef + 呼叫 onTick（觸發 map repaint），
  // 不再每幀 setState —— React 樹只在 state 節流發布時 reconcile 一次。
  useEffect(() => {
    if (!playing) return;

    const animate = (now: number) => {
      if (lastFrameRef.current === 0) lastFrameRef.current = now;
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      const next = timeRef.current + dt * speed;
      if (next >= windowEnd) {
        setPlaying(false);
        publishNow(windowStart); // loop back：立即發布，不等節流窗
      } else {
        timeRef.current = next;
        if (now - lastPublishRef.current >= STATE_PUBLISH_INTERVAL_MS) {
          lastPublishRef.current = now;
          setCurrentTime(next);
        }
      }

      onTick?.(timeRef.current);
      rafRef.current = requestAnimationFrame(animate);
    };

    lastFrameRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, windowStart, windowEnd, onTick, publishNow]);

  // play／pause／toggle：切換播放狀態前先把 timeRef 目前值 flush 進 state，
  // 避免暫停當下 slider 停在最後一次節流發布（最多 100ms 前）的舊值。
  const play = useCallback(() => {
    publishNow(timeRef.current);
    setPlaying(true);
  }, [publishNow]);
  const pause = useCallback(() => {
    publishNow(timeRef.current);
    setPlaying(false);
  }, [publishNow]);
  const toggle = useCallback(() => {
    publishNow(timeRef.current);
    setPlaying((p) => !p);
  }, [publishNow]);

  const seek = useCallback(
    (time: number) => {
      manualSeekRef.current = Date.now();
      publishNow(Math.max(windowStart, Math.min(windowEnd, time)));
    },
    [windowStart, windowEnd, publishNow],
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
    timeRef,
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
