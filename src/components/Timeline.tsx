import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "../styles/ThemeContext";
import { BLUR, FONT, LAYOUT, RADIUS, SIZE, SPACE, Z } from "../styles/tokens";
import { Button, Chip, Segmented, Select, Slider } from "../ui";
import { THUMB_W } from "../ui/Slider";
import { IconChevron, IconPause, IconPlay, IconPlus } from "../ui/icons";
import { COMPARE_COLORS } from "../types/dataColors";
import { compareProgressToTime, compareSegmentStarts, compareTimeToProgress } from "../ui/compareTimeline";
import { mix, themeVars } from "../ui/vars";
import {
  COLLAPSE_DELAY_MS,
  INITIAL_EXPAND_STATE,
  expandReducer,
  focusHolds,
  isExpanded,
} from "../ui/timelineExpand";

/** 每小時起降直方圖的一格（start = 該小時起點 unix 秒） */
export interface HourBin {
  start: number;
  arr: number;
  dep: number;
}

interface Props {
  playing: boolean;
  speed: number;
  progress: number;
  currentTime: number;
  windowStart: number;
  windowEnd: number;
  selectedDate: string;
  rangeDays: number;
  availableDates?: string[];
  /** 抓「滿」的日期（月曆實心點、Compare 清單 full vs partial） */
  fullDates?: string[];
  /** 每日筆數（tooltip 用） */
  dateCounts?: Record<string, number>;
  selectedDates?: string[];
  isMultiDateMode?: boolean;
  /** 正在看的對象（機場碼／組合名／區域），月曆點到沒資料日期時的提示用 */
  subjectLabel?: string;
  /** 每小時進場／離場數（App 依目前機場或組合計算） */
  hourBins: HourBin[];
  /** 手機：固定展開（沒有 hover）、撐滿容器寬、月曆往下彈 */
  fixedExpanded?: boolean;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onSeekByProgress: (p: number) => void;
  /** 直方圖點擊：跳到該小時起點 */
  onSeek: (t: number) => void;
  onDateShift: (delta: number) => void;
  onDateSelect?: (date: string) => void;
  onRangeDaysChange: (n: number) => void;
  onToggleMultiDate?: (date: string) => void;
  onClearMultiDates?: () => void;
}

const SPEEDS = [1, 15, 30, 60, 120, 300, 600, 1800, 3600];
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const COLLAPSED_W = 300;
const EXPANDED_W = 640;
const LEFT = LAYOUT.panelLeft + SPACE.s8;
/** Compare 展開區最多直接顯示幾個日期 chip，其餘收成「+N」 */
const MAX_COMPARE_CHIPS = 4;

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  return `${m}/${d} (${WEEKDAYS[date.getDay()]})`;
}

/** 台灣時間 HH:MM */
function formatTime(t: number): string {
  if (t <= 0) return "--:--";
  const tw = new Date(t * 1000 + 8 * 3600_000);
  return `${String(tw.getUTCHours()).padStart(2, "0")}:${String(tw.getUTCMinutes()).padStart(2, "0")}`;
}

function formatDateTime(t: number): string {
  if (t <= 0) return "--/-- --:--";
  const tw = new Date(t * 1000 + 8 * 3600_000);
  const mm = String(tw.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tw.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd} ${formatTime(t)}`;
}

/** 選完原生 select 後放掉 focus，避免滑鼠選完時間軸永遠不收（focusHolds 註解） */
function releaseFocus() {
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
}

/** 把 timelineExpand 純函式接到 DOM */
function useTimelineExpand() {
  const [state, dispatch] = useReducer(expandReducer, INITIAL_EXPAND_STATE);
  const lastInputWasPointerRef = useRef(false);

  useEffect(() => {
    const onPointer = () => { lastInputWasPointerRef.current = true; };
    const onKey = () => { lastInputWasPointerRef.current = false; };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  useEffect(() => {
    if (state.phase !== "closing") return;
    const timer = window.setTimeout(() => dispatch({ type: "timeout" }), COLLAPSE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase]);

  const holds = (target: EventTarget | null) =>
    target instanceof Element && focusHolds(target.matches("select") ? "select" : "other", lastInputWasPointerRef.current);

  const onFocus = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (holds(e.target)) dispatch({ type: "focusIn" });
  }, []);
  const onBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) {
      dispatch({ type: holds(next) ? "focusIn" : "focusOut" });
      return;
    }
    dispatch({ type: "focusOut" });
  }, []);

  return { state, dispatch, onFocus, onBlur };
}

/**
 * 時間軸膠囊（spec R4、R5）。收合：播放、時刻（台灣時間）、細進度條；
 * 展開：日期列（◀ 日期 ▶、月曆、天數、Compare／已選日期 chip）、每小時起降直方圖、進度滑桿、速度。
 * Compare（多日）＝依日期先後串成一條絕對時間軸；直方圖與滑桿改成每個日期一段等寬區塊（ui/compareTimeline.ts）。
 * 外層容器負責定位（底邊 LAYOUT.mapBottomInset，與 dock 共用）。手機用 fixedExpanded：固定展開、撐滿寬、月曆往下彈。
 */
export function Timeline(p: Props) {
  const { tokens, isDark } = useTheme();
  const { state, dispatch, onFocus, onBlur } = useTimelineExpand();
  const fixed = p.fixedExpanded ?? false;
  const expanded = fixed || isExpanded(state);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const availableDates = p.availableDates ?? [];
  const fullDates = p.fullDates ?? [];
  const selectedDates = p.selectedDates ?? [];
  const isMultiDateMode = p.isMultiDateMode ?? false;

  /** Compare 日期色：與 App compareColorMap 同一公式（依加入順序取 COMPARE_COLORS） */
  const compareColor = (d: string) => COMPARE_COLORS[Math.max(0, selectedDates.indexOf(d)) % COMPARE_COLORS.length]!;
  /** 已選日期依日期先後（= 播放與直方圖分段順序） */
  const compareSorted = [...new Set(selectedDates)].sort();

  /* ── 月曆 ── */
  const calendarOpen = state.popupOpen;
  /** 點到沒資料的日期時的提示（月曆內一行字）；開關月曆或選到有效日期時清掉 */
  const [noDataNotice, setNoDataNotice] = useState<string | null>(null);
  const setCalendarOpen = useCallback((open: boolean) => {
    setNoDataNotice(null);
    dispatch({ type: "popup", open });
  }, [dispatch]);
  const [viewYM, setViewYM] = useState<[number, number]>(() => {
    const [y, m] = p.selectedDate.split("-").map(Number);
    return [y || new Date().getFullYear(), (m || 1) - 1];
  });
  const openCalendar = () => {
    if (!p.onDateSelect) return;
    if (!calendarOpen) {
      const [y, m] = p.selectedDate.split("-").map(Number);
      setViewYM([y || new Date().getFullYear(), (m || 1) - 1]);
    }
    setCalendarOpen(!calendarOpen);
  };
  // 月曆 portal 到 body：外層容器（z-index 10）自成 stacking context，popover 留在裡面會被 z 20 的左側面板蓋住。
  // 位置依時間軸根節點量測（桌面往上彈、手機往下彈）。
  const [calendarPos, setCalendarPos] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!calendarOpen) return;
    const measure = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      setCalendarPos(fixed
        ? { top: r.bottom + SPACE.s8, left: r.left }
        : { bottom: window.innerHeight - r.top + SPACE.s8, left: r.left });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [calendarOpen, fixed, expanded]);
  // 月曆開著：點時間軸外或按 Esc 關閉
  useEffect(() => {
    if (!calendarOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target) && !calendarRef.current?.contains(e.target)) setCalendarOpen(false);
    };
    // Esc 分層（R7）：月曆排在說明視窗之後、dock 卡之前；preventDefault 讓 App 的 Esc handler 略過這一次
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setCalendarOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [calendarOpen, setCalendarOpen]);

  /* ── 拖曳進度滑桿 ── */
  useEffect(() => {
    if (!state.dragging) return;
    const end = () => dispatch({ type: "dragEnd" });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [state.dragging, dispatch]);

  const availableSet = new Set(availableDates);
  const fullSet = new Set(fullDates);
  const [viewYear, viewMonth] = viewYM;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();

  const dateTitle = (d: string) => {
    const isFull = fullSet.has(d);
    const isPartial = availableSet.has(d) && !isFull && fullDates.length > 0;
    const count = p.dateCounts?.[d];
    return count !== undefined
      ? `${count} flights${isFull ? "（完整）" : "（部分）"}`
      : isFull ? "完整資料" : isPartial ? "部分資料" : undefined;
  };

  /* ── 直方圖 ── */
  const hasBins = expanded && p.hourBins.length > 0;
  const winSpan = Math.max(1, p.windowEnd - p.windowStart);
  /** Compare：每個所選日期一段等寬（不依絕對時間留白）；滑桿位置同樣換算 */
  const segStarts = isMultiDateMode ? compareSegmentStarts(selectedDates) : [];
  const segMode = segStarts.length > 0;
  const binLeft = (t: number) => (segMode ? compareTimeToProgress(t, segStarts) : (t - p.windowStart) / winSpan);
  const binWidth = segMode ? 1 / (24 * segStarts.length) : 3600 / winSpan;
  const progress = segMode ? compareTimeToProgress(p.currentTime, segStarts) : p.progress;
  const onSlider = segMode ? (u: number) => p.onSeek(compareProgressToTime(u, segStarts)) : p.onSeekByProgress;
  /** 每格之間留 1px 縫（格寬 = 一小時的時間寬 − 縫） */
  const binGap = 1;
  const maxHalf = Math.max(1, ...p.hourBins.map((b) => Math.max(b.arr, b.dep)));
  const curIdx = p.hourBins.findIndex((b) => p.currentTime >= b.start && p.currentTime < b.start + 3600);

  const iconBtn: CSSProperties = {
    width: fixed ? 32 : 24,
    height: fixed ? 32 : 24,
    padding: 0,
    border: 0,
    borderRadius: RADIUS.base,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    flex: "none",
  };

  const playButton = (
    <button
      type="button"
      onClick={p.onToggle}
      aria-label={p.playing ? "暫停" : "播放"}
      title={p.playing ? "暫停" : "播放"}
      className="fa-focus"
      style={{ ...iconBtn, background: tokens.accent, color: tokens.accentInk }}
    >
      {p.playing ? <IconPause /> : <IconPlay />}
    </button>
  );

  const clock = (
    <>
      <span
        style={{
          fontFamily: FONT.data,
          fontSize: SIZE.sub + 1,
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          color: tokens.fg1,
          flex: "none",
          minWidth: expanded && (p.rangeDays > 1 || isMultiDateMode) ? 92 : 44,
        }}
        title="台灣時間"
      >
        {expanded && (p.rangeDays > 1 || isMultiDateMode) ? formatDateTime(p.currentTime) : formatTime(p.currentTime)}
      </span>
      <span style={{ fontFamily: FONT.data, fontSize: SIZE.eyebrow, color: tokens.fg3, letterSpacing: ".08em", flex: "none" }}>UTC+8</span>
    </>
  );

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={expanded ? "時間軸" : "時間軸（滑鼠移入或按 Enter 展開）"}
      tabIndex={expanded ? -1 : 0}
      className="fa-focus"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") dispatch({ type: "pointerEnter" }); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") dispatch({ type: "pointerLeave" }); }}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={() => { if (!expanded) dispatch({ type: "activate" }); }}
      onKeyDown={(e) => {
        if (!expanded && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          dispatch({ type: "activate" });
        }
      }}
      style={{
        ...themeVars(tokens),
        position: "relative",
        pointerEvents: "auto",
        width: fixed ? "100%" : expanded ? EXPANDED_W : COLLAPSED_W,
        maxWidth: fixed ? undefined : `calc(100vw - ${LEFT + LAYOUT.dockWidth + SPACE.s16 * 2}px)`,
        boxSizing: "border-box",
        background: tokens.panel,
        border: `1px solid ${tokens.border}`,
        borderRadius: RADIUS.base,
        backdropFilter: `blur(${BLUR}px) saturate(1.2)`,
        WebkitBackdropFilter: `blur(${BLUR}px) saturate(1.2)`,
        color: tokens.fg1,
        fontFamily: FONT.ui,
        fontSize: SIZE.body,
        padding: `${SPACE.s8}px ${SPACE.s8 + SPACE.s2}px`,
        display: "flex",
        flexDirection: "column",
        gap: SPACE.s8,
        transition: fixed ? undefined : "width .25s ease",
      }}
    >
      {/* ── 月曆（只此一套，R12）── */}
      {calendarOpen && calendarPos && createPortal(
        <div
          ref={calendarRef}
          role="dialog"
          aria-label="選擇日期"
          style={{
            ...themeVars(tokens),
            position: "fixed",
            ...calendarPos,
            zIndex: Z.popover,
            color: tokens.fg1,
            fontFamily: FONT.ui,
            background: tokens.panel,
            border: `1px solid ${tokens.border}`,
            borderRadius: RADIUS.base,
            backdropFilter: `blur(${BLUR}px) saturate(1.2)`,
            WebkitBackdropFilter: `blur(${BLUR}px) saturate(1.2)`,
            padding: SPACE.s8 + SPACE.s2,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.s6 }}>
            <Button
              variant="ghost"
              ariaLabel="上個月"
              icon={<IconChevron direction="left" />}
              onClick={() => setViewYM(viewMonth === 0 ? [viewYear - 1, 11] : [viewYear, viewMonth - 1])}
            />
            <span style={{ fontFamily: FONT.data, fontSize: SIZE.sub, fontWeight: 600 }}>
              {viewYear}/{String(viewMonth + 1).padStart(2, "0")}
            </span>
            <Button
              variant="ghost"
              ariaLabel="下個月"
              icon={<IconChevron direction="right" />}
              onClick={() => setViewYM(viewMonth === 11 ? [viewYear + 1, 0] : [viewYear, viewMonth + 1])}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 28px)", gap: SPACE.s2 }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ textAlign: "center", fontSize: SIZE.minor, color: tokens.fg3 }}>{w}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 28px)", gap: SPACE.s2, marginTop: SPACE.s2 }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const month = viewMonth + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const hasData = availableSet.has(dateStr);
              const isFull = fullSet.has(dateStr);
              const isPartial = hasData && !isFull && fullDates.length > 0;
              const isSelected = !isMultiDateMode && dateStr === p.selectedDate;
              const inCompare = isMultiDateMode && selectedDates.includes(dateStr);
              const cmpColor = inCompare ? compareColor(dateStr) : undefined;
              return (
                <button
                  key={day}
                  type="button"
                  title={hasData ? dateTitle(dateStr) : undefined}
                  aria-pressed={isMultiDateMode ? inCompare : isSelected}
                  aria-disabled={!hasData || undefined}
                  onClick={() => {
                    if (!hasData) {
                      setNoDataNotice(`${month}/${day} 沒有${p.subjectLabel ? ` ${p.subjectLabel} 的` : ""}資料`);
                      return;
                    }
                    if (isMultiDateMode) {
                      // Compare：點日期 = 加入／移除，月曆保持開著；移除最後一天會離開 Compare，順手關月曆
                      setNoDataNotice(null);
                      p.onToggleMultiDate?.(dateStr);
                      if (inCompare && selectedDates.length <= 1) setCalendarOpen(false);
                      return;
                    }
                    p.onDateSelect?.(dateStr);
                    setCalendarOpen(false);
                  }}
                  className="fa-focus"
                  style={{
                    width: 28,
                    height: 28,
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: FONT.data,
                    fontSize: SIZE.body,
                    border: 0,
                    borderRadius: RADIUS.base,
                    background: isSelected ? tokens.accent : cmpColor ? mix(cmpColor, 26) : "transparent",
                    boxShadow: cmpColor ? `inset 0 0 0 1px ${cmpColor}` : undefined,
                    color: isSelected ? tokens.accentInk : hasData ? tokens.fg1 : mix(tokens.fg3, 55),
                    opacity: isPartial && !isSelected && !inCompare ? 0.55 : 1,
                    fontWeight: isSelected || inCompare ? 700 : 400,
                    cursor: hasData ? "pointer" : "not-allowed",
                  }}
                >
                  {day}
                  {isFull && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        bottom: 3,
                        width: 3,
                        height: 3,
                        borderRadius: RADIUS.pill,
                        background: isSelected ? tokens.accentInk : tokens.fg2,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {isMultiDateMode && (
            <div style={{ marginTop: SPACE.s6, maxWidth: 7 * 28 + 6 * SPACE.s2, fontSize: SIZE.minor, lineHeight: 1.4, color: tokens.fg3 }}>
              點日期加入／移除比較 · 已選 {compareSorted.length} 天
            </div>
          )}
          {noDataNotice && (
            <div
              role="status"
              style={{
                marginTop: SPACE.s6,
                maxWidth: 7 * 28 + 6 * SPACE.s2,
                fontSize: SIZE.minor,
                lineHeight: 1.4,
                color: tokens.fg2,
              }}
            >
              {noDataNotice}
            </div>
          )}
        </div>,
        document.body,
      )}

      {expanded && (
        <>
          {/* ── 日期列：單日 = ◀ 日期 ▶ · 天數 · Compare；Compare = 開關 · 已選日期 chip · ＋ 加日期 ── */}
          <div style={{ display: "flex", alignItems: "center", gap: SPACE.s6, flexWrap: "wrap" }}>
            {!isMultiDateMode && (
              <>
                <Button variant="ghost" ariaLabel="前一個有資料的日期" icon={<IconChevron direction="left" />} onClick={() => p.onDateShift(-1)} />
                <Button
                  variant="ghost"
                  onClick={openCalendar}
                  disabled={!p.onDateSelect}
                  pressed={calendarOpen}
                  title="開月曆選日期"
                  width={92}
                  style={{ fontFamily: FONT.data, fontWeight: 600, color: tokens.fg1 }}
                >
                  {formatDateLabel(p.selectedDate)}
                </Button>
                <Button variant="ghost" ariaLabel="後一個有資料的日期" icon={<IconChevron direction="right" />} onClick={() => p.onDateShift(1)} />
                <Segmented<number>
                  ariaLabel="天數"
                  options={[1, 3, 7].map((n) => ({ value: n, label: `${n}d` }))}
                  value={p.rangeDays}
                  onChange={p.onRangeDaysChange}
                />
              </>
            )}
            {availableDates.length > 1 && p.onToggleMultiDate && (
              <Button
                pressed={isMultiDateMode}
                width={104}
                onClick={isMultiDateMode ? p.onClearMultiDates : () => p.onToggleMultiDate?.(p.selectedDate)}
                title={isMultiDateMode ? "關閉多日比較" : "多日比較"}
              >
                {isMultiDateMode ? `Compare (${compareSorted.length})` : "Compare"}
              </Button>
            )}
            {isMultiDateMode && (
              <>
                {compareSorted.slice(0, MAX_COMPARE_CHIPS).map((d) => (
                  <Chip
                    key={d}
                    title={dateTitle(d)}
                    removeLabel={`移除 ${formatDateLabel(d)}`}
                    label={
                      <span style={{ display: "inline-flex", alignItems: "center", gap: SPACE.s4 }}>
                        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RADIUS.pill, background: compareColor(d), flex: "none" }} />
                        {formatDateLabel(d)}
                      </span>
                    }
                    onRemove={() => p.onToggleMultiDate?.(d)}
                  />
                ))}
                {compareSorted.length > MAX_COMPARE_CHIPS && (
                  <Chip
                    label={`+${compareSorted.length - MAX_COMPARE_CHIPS}`}
                    title={compareSorted.slice(MAX_COMPARE_CHIPS).map(formatDateLabel).join("、")}
                    onClick={openCalendar}
                  />
                )}
                <Button
                  variant="ghost"
                  icon={<IconPlus />}
                  onClick={openCalendar}
                  pressed={calendarOpen}
                  disabled={!p.onDateSelect}
                  title="開月曆加入／移除比較日期"
                >
                  加日期
                </Button>
              </>
            )}
            <span style={{ flex: 1 }} />
            <Select<number>
              ariaLabel="播放速度"
              title="播放速度"
              width={84}
              options={SPEEDS.map((s) => ({ value: s, label: `${s}x` }))}
              value={p.speed}
              onChange={(v) => { p.onSpeedChange(v); releaseFocus(); }}
            />
          </div>

        </>
      )}

      {/* ── 主區：欄 = 播放 | 時刻 | 軌道 | 起訖；直方圖放軌道欄上一列，與滑桿同寬 ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto minmax(40px, 1fr)" + (expanded ? " auto" : ""),
          gridAutoRows: "auto",
          columnGap: SPACE.s8 + SPACE.s2,
          alignItems: "center",
          minWidth: 0,
        }}
      >
          {/* ── 每小時起降直方圖：進場向上、離場向下；點擊跳到該小時 ──
            與進度滑桿同欄：左右各縮 THUMB_W/2（滑桿 thumb 中心在 3px + p×(W−6)），
            每格 x 與滑桿用同一套換算（binLeft／progress）：單日／Nd 依絕對時間；Compare 每個日期一段等寬，
            段首標日期（比較色點），段與段之間一條細分隔線。 */}
        {hasBins && (
          <div style={{ gridColumn: 3, gridRow: 1, margin: `0 ${THUMB_W / 2}px ${SPACE.s4}px`, display: "flex", flexDirection: "column", gap: SPACE.s2 }}>
            {segMode && (
              <div aria-hidden="true" style={{ position: "relative", height: 14 }}>
                {segStarts.map((st, k) => {
                  const d = compareSorted[k]!;
                  return (
                    <span
                      key={st}
                      style={{
                        position: "absolute",
                        left: `${(k / segStarts.length) * 100}%`,
                        width: `${100 / segStarts.length}%`,
                        top: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: SPACE.s4,
                        paddingLeft: k > 0 ? SPACE.s4 : 0,
                        boxSizing: "border-box",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        fontFamily: FONT.data,
                        fontSize: SIZE.eyebrow,
                        lineHeight: "14px",
                        color: tokens.fg3,
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: RADIUS.pill, background: compareColor(d), flex: "none" }} />
                      {formatDateLabel(d)}
                    </span>
                  );
                })}
              </div>
            )}
            <div
              role="group"
              aria-label="每小時起降（進場向上、離場向下）"
              style={{ position: "relative", height: 34 }}
            >
              {segMode && segStarts.slice(1).map((st, i) => (
                <span
                  key={`sep${st}`}
                  aria-hidden="true"
                  style={{ position: "absolute", top: -SPACE.s2 - 14, bottom: 0, left: `${((i + 1) / segStarts.length) * 100}%`, width: 1, background: tokens.border }}
                />
              ))}
              {p.hourBins.map((b, i) => {
                const cur = i === curIdx;
                const color = cur ? tokens.accent : mix(tokens.fg2, isDark ? 45 : 50); // 圖表配色規則：目前用 accent，其餘中性灰階
                const tw = new Date(b.start * 1000 + 8 * 3600_000);
                const label = `${String(tw.getUTCMonth() + 1).padStart(2, "0")}/${String(tw.getUTCDate()).padStart(2, "0")} ${String(tw.getUTCHours()).padStart(2, "0")}:00 · 進場 ${b.arr} · 離場 ${b.dep}`;
                return (
                  <button
                    key={b.start}
                    type="button"
                    tabIndex={-1}
                    title={label}
                    aria-label={label}
                    onClick={() => p.onSeek(b.start)}
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${binLeft(b.start) * 100}%`,
                      width: `calc(${binWidth * 100}% - ${binGap}px)`,
                      minWidth: 1,
                      padding: 0,
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                    }}
                  >
                    <span style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                      <span style={{ width: "100%", height: `${(b.arr / maxHalf) * 100}%`, background: color }} />
                    </span>
                    <span style={{ flex: 1, display: "flex", alignItems: "flex-start", width: "100%" }}>
                      <span style={{ width: "100%", height: `${(b.dep / maxHalf) * 100}%`, background: color }} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ gridColumn: 1, gridRow: 2, display: "flex" }}>{playButton}</div>
        <div style={{ gridColumn: 2, gridRow: 2, display: "flex", alignItems: "baseline", gap: SPACE.s8 + SPACE.s2 }}>{clock}</div>
        {expanded ? (
          <div
            style={{ gridColumn: 3, gridRow: 2, minWidth: 0 }}
            onPointerDown={() => dispatch({ type: "dragStart" })}
          >
            <Slider
              bare
              ariaLabel="播放進度"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              onChange={onSlider}
            />
          </div>
        ) : (
          <div
            aria-hidden="true"
            style={{ gridColumn: 3, gridRow: 2, minWidth: 0, height: 2, position: "relative", background: mix(tokens.fg1, 18) }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                background: tokens.accent,
              }}
            />
          </div>
        )}
        {expanded && (
          <span style={{ fontFamily: FONT.data, fontSize: SIZE.minor, color: tokens.fg3, whiteSpace: "nowrap", gridColumn: 4, gridRow: 2 }}>
            {formatTime(p.windowStart)}–{formatTime(p.windowEnd)}
          </span>
        )}
      </div>
    </div>
  );
}
