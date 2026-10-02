import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "../styles/ThemeContext";
import { BLUR, FONT, LAYOUT, RADIUS, SIZE, SPACE, Z } from "../styles/tokens";
import { Button, Chip, Segmented, Select, Slider } from "../ui";
import { IconChevron, IconPause, IconPlay } from "../ui/icons";
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
 * 展開：日期列（◀ 日期 ▶、月曆、天數、Compare）、每小時起降直方圖、Compare 日期、進度滑桿、速度。
 * 外層容器負責定位（底邊 LAYOUT.mapBottomInset，與 dock 共用）。手機用 fixedExpanded：固定展開、撐滿寬、月曆往下彈。
 */
export function Timeline(p: Props) {
  const { tokens, isDark } = useTheme();
  const { state, dispatch, onFocus, onBlur } = useTimelineExpand();
  const fixed = p.fixedExpanded ?? false;
  const expanded = fixed || isExpanded(state);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const availableDates = p.availableDates ?? [];
  const fullDates = p.fullDates ?? [];
  const selectedDates = p.selectedDates ?? [];
  const isMultiDateMode = p.isMultiDateMode ?? false;

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
  // 月曆開著：點時間軸外或按 Esc 關閉
  useEffect(() => {
    if (!calendarOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) setCalendarOpen(false);
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
      {calendarOpen && (
        <div
          role="dialog"
          aria-label="選擇日期"
          style={{
            position: "absolute",
            ...(fixed ? { top: "calc(100% + 8px)" } : { bottom: "calc(100% + 8px)" }),
            left: 0,
            zIndex: Z.popover,
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
              const isSelected = dateStr === p.selectedDate;
              return (
                <button
                  key={day}
                  type="button"
                  title={hasData ? dateTitle(dateStr) : undefined}
                  aria-pressed={isSelected}
                  aria-disabled={!hasData || undefined}
                  onClick={() => {
                    if (!hasData) {
                      setNoDataNotice(`${month}/${day} 沒有${p.subjectLabel ? ` ${p.subjectLabel} 的` : ""}資料`);
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
                    background: isSelected ? tokens.accent : "transparent",
                    color: isSelected ? tokens.accentInk : hasData ? tokens.fg1 : mix(tokens.fg3, 55),
                    opacity: isPartial && !isSelected ? 0.55 : 1,
                    fontWeight: isSelected ? 700 : 400,
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
        </div>
      )}

      {expanded && (
        <>
          {/* ── 日期列 ── */}
          <div style={{ display: "flex", alignItems: "center", gap: SPACE.s6, flexWrap: "wrap" }}>
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
            {!isMultiDateMode && (
              <Segmented<number>
                ariaLabel="天數"
                options={[1, 3, 7].map((n) => ({ value: n, label: `${n}d` }))}
                value={p.rangeDays}
                onChange={p.onRangeDaysChange}
              />
            )}
            {availableDates.length > 1 && p.onToggleMultiDate && (
              <Button
                pressed={isMultiDateMode}
                width={104}
                onClick={isMultiDateMode ? p.onClearMultiDates : () => p.onToggleMultiDate?.(p.selectedDate)}
                title={isMultiDateMode ? "關閉多日比較" : "多日比較"}
              >
                {isMultiDateMode ? `Compare (${selectedDates.length})` : "Compare"}
              </Button>
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

          {/* ── Compare 日期 ── */}
          {isMultiDateMode && availableDates.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.s4, maxHeight: 96, overflowY: "auto" }}>
              {availableDates.map((d) => {
                const isPartial = !fullSet.has(d) && fullDates.length > 0;
                const active = selectedDates.includes(d);
                return (
                  // 部分資料的日期調暗（沿用舊 Compare 清單的視覺語言）
                  <span key={d} style={{ opacity: isPartial && !active ? 0.55 : 1, display: "inline-flex" }}>
                    <Chip
                      label={formatDateLabel(d)}
                      title={dateTitle(d)}
                      selected={active}
                      onClick={() => p.onToggleMultiDate?.(d)}
                    />
                  </span>
                );
              })}
            </div>
          )}

          {/* ── 每小時起降直方圖：進場向上、離場向下；點擊跳到該小時 ── */}
          {p.hourBins.length > 0 && (
            <div
              role="group"
              aria-label="每小時起降（進場向上、離場向下）"
              style={{ display: "flex", alignItems: "stretch", gap: 1, height: 34 }}
            >
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
                      flex: 1,
                      minWidth: 0,
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
          )}
        </>
      )}

      {/* ── 主列：播放、時刻、進度 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.s8 + SPACE.s2, minWidth: 0 }}>
        {playButton}
        {clock}
        {expanded ? (
          <div
            style={{ flex: 1, minWidth: 40 }}
            onPointerDown={() => dispatch({ type: "dragStart" })}
          >
            <Slider
              bare
              ariaLabel="播放進度"
              min={0}
              max={1}
              step={0.001}
              value={p.progress}
              onChange={p.onSeekByProgress}
            />
          </div>
        ) : (
          <div
            aria-hidden="true"
            style={{ flex: 1, minWidth: 40, height: 2, position: "relative", background: mix(tokens.fg1, 18) }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.max(0, Math.min(1, p.progress)) * 100}%`,
                background: tokens.accent,
              }}
            />
          </div>
        )}
        {expanded && (
          <span style={{ fontFamily: FONT.data, fontSize: SIZE.minor, color: tokens.fg3, whiteSpace: "nowrap", flex: "none" }}>
            {formatTime(p.windowStart)}–{formatTime(p.windowEnd)}
          </span>
        )}
      </div>
    </div>
  );
}
