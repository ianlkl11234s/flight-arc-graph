import { useState } from "react";

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
  /** 抓「滿」的日期（區分 Compare 清單裡的 full vs partial） */
  fullDates?: string[];
  /** 每日筆數（tooltip 顯示用，單一機場模式才有） */
  dateCounts?: Record<string, number>;
  selectedDates?: string[];
  isMultiDateMode?: boolean;
  isDarkTheme?: boolean;
  isMobile?: boolean;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onSeekByProgress: (p: number) => void;
  onDateShift: (delta: number) => void;
  /** 月曆直接跳指定日期（點日期標籤開月曆） */
  onDateSelect?: (date: string) => void;
  onRangeDaysChange: (n: number) => void;
  onToggleMultiDate?: (date: string) => void;
  onClearMultiDates?: () => void;
}

const getBtnStyle = (dark: boolean): React.CSSProperties => ({
  background: dark ? "rgba(120,120,120,0.35)" : "rgba(50,50,50,0.75)",
  color: dark ? "rgba(220,220,220,0.9)" : "rgba(255,255,255,0.9)",
  border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.15)"}`,
  borderRadius: 4,
  padding: "4px 10px",
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "monospace",
  backdropFilter: "blur(8px)",
});

const getSelectStyle = (dark: boolean): React.CSSProperties => ({
  background: dark ? "rgba(120,120,120,0.35)" : "rgba(50,50,50,0.75)",
  color: dark ? "rgba(220,220,220,0.9)" : "rgba(255,255,255,0.9)",
  border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.15)"}`,
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 13,
  fontFamily: "monospace",
  backdropFilter: "blur(8px)",
});

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  const weekday = WEEKDAYS[date.getDay()];
  return `${m}/${d} (${weekday})`;
}

function formatTime(t: number): string {
  if (t <= 0) return "--:--";
  const d = new Date(t * 1000);
  // 顯示台灣時區
  const tw = new Date(d.getTime() + 8 * 3600_000);
  const hh = String(tw.getUTCHours()).padStart(2, "0");
  const mi = String(tw.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

function formatDateTime(t: number): string {
  if (t <= 0) return "--/-- --:--";
  const d = new Date(t * 1000);
  const tw = new Date(d.getTime() + 8 * 3600_000);
  const mm = String(tw.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tw.getUTCDate()).padStart(2, "0");
  const hh = String(tw.getUTCHours()).padStart(2, "0");
  const mi = String(tw.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

export function TimelineControls({
  playing,
  speed,
  progress,
  currentTime,
  windowStart,
  windowEnd,
  selectedDate,
  rangeDays,
  availableDates = [],
  fullDates = [],
  dateCounts,
  selectedDates = [],
  isMultiDateMode = false,
  isDarkTheme = true,
  isMobile = false,
  onToggle,
  onSpeedChange,
  onSeekByProgress,
  onDateShift,
  onDateSelect,
  onRangeDaysChange,
  onToggleMultiDate,
  onClearMultiDates,
}: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewYM, setViewYM] = useState<[number, number]>(() => {
    const [y, m] = selectedDate.split("-").map(Number);
    return [y || new Date().getFullYear(), (m || 1) - 1];
  });

  const openCalendar = () => {
    if (!onDateSelect) return;
    if (!calendarOpen) {
      const [y, m] = selectedDate.split("-").map(Number);
      setViewYM([y || new Date().getFullYear(), (m || 1) - 1]);
    }
    setCalendarOpen(!calendarOpen);
  };

  const availableSet = new Set(availableDates);
  const fullSet = new Set(fullDates);
  const [viewYear, viewMonth] = viewYM;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const calTextMain = isDarkTheme ? "rgba(230,230,230,0.95)" : "rgba(40,40,40,0.9)";
  const calTextDim = isDarkTheme ? "rgba(180,180,180,0.5)" : "rgba(0,0,0,0.4)";
  const calNavBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: calTextMain,
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 8px",
    fontFamily: "monospace",
  };

  return (
    <div
      style={isMobile ? {} : {
        position: "absolute",
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 10,
      }}
    >
      {/* 日期導航列 */}
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          marginBottom: 6,
          position: "relative",
        }}
      >
        <button
          onClick={() => onDateShift(-1)}
          style={{
            ...getBtnStyle(isDarkTheme),
            padding: isMobile ? "6px 10px" : "4px 8px",
            fontSize: isMobile ? 16 : 14,
          }}
        >
          ◀
        </button>
        <button
          onClick={openCalendar}
          title={onDateSelect ? "開月曆選日期" : undefined}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: isDarkTheme ? "#fff" : "rgba(50,50,50,0.9)",
            fontSize: isMobile ? 14 : 13,
            fontFamily: "monospace",
            fontWeight: 600,
            letterSpacing: 0.5,
            minWidth: isMobile ? 90 : 80,
            textAlign: "center",
            cursor: onDateSelect ? "pointer" : "default",
            textDecoration: onDateSelect ? "underline dotted" : "none",
            textUnderlineOffset: 3,
          }}
        >
          {formatDateLabel(selectedDate)}
        </button>
        {calendarOpen && (
          <>
            {/* 點外面關閉 */}
            <div
              onClick={() => setCalendarOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 29 }}
            />
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: 0,
                zIndex: 30,
                background: isDarkTheme ? "rgba(25,25,25,0.95)" : "rgba(255,255,255,0.96)",
                border: `1px solid ${isDarkTheme ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                borderRadius: 8,
                padding: 10,
                backdropFilter: "blur(8px)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
              }}
            >
              {/* 月份切換 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <button
                  onClick={() => setViewYM(viewMonth === 0 ? [viewYear - 1, 11] : [viewYear, viewMonth - 1])}
                  style={calNavBtnStyle}
                >
                  ‹
                </button>
                <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: calTextMain }}>
                  {viewYear}/{String(viewMonth + 1).padStart(2, "0")}
                </span>
                <button
                  onClick={() => setViewYM(viewMonth === 11 ? [viewYear + 1, 0] : [viewYear, viewMonth + 1])}
                  style={calNavBtnStyle}
                >
                  ›
                </button>
              </div>
              {/* 星期標頭 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 28px)", gap: 2 }}>
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    style={{ textAlign: "center", fontSize: 10, fontFamily: "monospace", color: calTextDim }}
                  >
                    {w}
                  </div>
                ))}
              </div>
              {/* 日期格 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 28px)", gap: 2, marginTop: 2 }}>
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`e${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const hasData = availableSet.has(dateStr);
                  const isFull = fullSet.has(dateStr);
                  const isPartial = hasData && !isFull && fullDates.length > 0;
                  const isSelected = dateStr === selectedDate;
                  const count = dateCounts?.[dateStr];
                  return (
                    <button
                      key={day}
                      title={
                        hasData
                          ? count !== undefined
                            ? `${count} flights${isFull ? "（完整）" : "（部分）"}`
                            : isFull ? "完整資料" : isPartial ? "部分資料" : undefined
                          : undefined
                      }
                      onClick={() => {
                        if (!hasData) return;
                        onDateSelect?.(dateStr);
                        setCalendarOpen(false);
                      }}
                      style={{
                        width: 28,
                        height: 28,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontFamily: "monospace",
                        border: "none",
                        borderRadius: 6,
                        position: "relative",
                        background: isSelected
                          ? (isDarkTheme ? "rgba(99,102,241,0.55)" : "rgba(99,102,241,0.75)")
                          : "transparent",
                        color: hasData
                          ? calTextMain
                          : (isDarkTheme ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)"),
                        opacity: isPartial && !isSelected ? 0.55 : 1,
                        cursor: hasData ? "pointer" : "default",
                        fontWeight: isSelected ? 700 : 400,
                      }}
                    >
                      {day}
                      {isFull && (
                        <span
                          style={{
                            position: "absolute",
                            bottom: 2,
                            width: 3,
                            height: 3,
                            borderRadius: "50%",
                            background: isDarkTheme ? "rgba(220,220,220,0.8)" : "rgba(99,102,241,0.9)",
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
        <button
          onClick={() => onDateShift(1)}
          style={{
            ...getBtnStyle(isDarkTheme),
            padding: isMobile ? "6px 10px" : "4px 8px",
            fontSize: isMobile ? 16 : 14,
          }}
        >
          ▶
        </button>
        {!isMultiDateMode && (
          <select
            value={rangeDays}
            onChange={(e) => onRangeDaysChange(Number(e.target.value))}
            style={getSelectStyle(isDarkTheme)}
          >
            <option value={1}>1d</option>
            <option value={3}>3d</option>
            <option value={7}>7d</option>
          </select>
        )}
        {availableDates.length > 1 && onToggleMultiDate && (
          <button
            onClick={isMultiDateMode ? onClearMultiDates : () => onToggleMultiDate(selectedDate)}
            style={{
              ...getBtnStyle(isDarkTheme),
              padding: "4px 8px",
              fontSize: 12,
              opacity: isMultiDateMode ? 1 : 0.65,
              background: isMultiDateMode
                ? (isDarkTheme ? "rgba(99,102,241,0.5)" : "rgba(99,102,241,0.7)")
                : (isDarkTheme ? "rgba(120,120,120,0.35)" : "rgba(50,50,50,0.75)"),
              borderColor: isMultiDateMode ? "rgba(99,102,241,0.8)" : undefined,
            }}
          >
            {isMultiDateMode ? `Compare (${selectedDates.length})` : "Compare"}
          </button>
        )}
      </div>

      {/* Multi-date 日期選擇器 */}
      {isMultiDateMode && availableDates.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {availableDates.map((d) => {
            const active = selectedDates.includes(d);
            // 有 fullDates 資訊時，部分資料的日期調暗以區分（比照 CalendarPanel 視覺語言）
            const isFull = fullDates.includes(d);
            const isPartial = !isFull && fullDates.length > 0;
            const count = dateCounts?.[d];
            const title = count !== undefined
              ? `${count} flights${isFull ? "（完整）" : "（部分）"}`
              : isFull ? "完整資料" : isPartial ? "部分資料" : undefined;
            return (
              <button
                key={d}
                title={title}
                onClick={() => onToggleMultiDate?.(d)}
                style={{
                  ...getBtnStyle(isDarkTheme),
                  padding: "3px 7px",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: active
                    ? (isDarkTheme ? "rgba(99,102,241,0.6)" : "rgba(99,102,241,0.8)")
                    : (isDarkTheme ? "rgba(80,80,80,0.3)" : "rgba(30,30,30,0.5)"),
                  borderColor: active ? "rgba(99,102,241,0.9)" : undefined,
                  opacity: active ? 1 : isPartial ? 0.4 : 0.55,
                }}
              >
                {formatDateLabel(d)}
                {isFull && (
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: isDarkTheme ? "rgba(220,220,220,0.8)" : "#fff",
                      flexShrink: 0,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 控制按鈕列 */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <button onClick={onToggle} style={{
          ...getBtnStyle(isDarkTheme),
          ...(isMobile ? { width: 44, height: 44, fontSize: 18, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" } : {}),
        }}>
          {playing ? "\u23F8" : "\u25B6"}
        </button>

        <select
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          style={getSelectStyle(isDarkTheme)}
        >
          <option value={1}>1x</option>
          <option value={15}>15x</option>
          <option value={30}>30x</option>
          <option value={60}>60x</option>
          <option value={120}>120x</option>
          <option value={300}>300x</option>
          <option value={600}>600x</option>
          <option value={1800}>1800x</option>
          <option value={3600}>3600x</option>
        </select>

        <span
          style={{
            color: isDarkTheme ? "rgba(200,200,200,0.6)" : "rgba(255,255,255,0.7)",
            fontSize: 13,
            fontFamily: "monospace",
          }}
        >
          {formatDateTime(currentTime)}
        </span>
      </div>

      {/* 時間軸滑桿 */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={progress}
        onChange={(e) => onSeekByProgress(Number(e.target.value))}
        style={{
          width: "100%",
          height: isMobile ? 8 : undefined,
          accentColor: isDarkTheme ? "#aaa" : "#3B82F6",
          colorScheme: isDarkTheme ? "dark" : "light",
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: isDarkTheme ? "rgba(180,180,180,0.4)" : "rgba(0,0,0,0.3)",
          fontSize: 10,
          fontFamily: "monospace",
          marginTop: 2,
        }}
      >
        <span>{formatTime(windowStart)}</span>
        <span>{formatTime(windowEnd)}</span>
      </div>
    </div>
  );
}
