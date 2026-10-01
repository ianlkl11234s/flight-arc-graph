import { useState, useEffect, type CSSProperties } from "react";
import { FONT } from "../../../styles/tokens";
import type { ThemeColors } from "../theme";
import type { IconRailSidebarProps } from "../../IconRailSidebar";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function CalendarPanel({
  availableDates,
  fullDates,
  dateCounts,
  selectedDate,
  onDateSelect,
  theme,
}: Pick<IconRailSidebarProps, "availableDates" | "fullDates" | "dateCounts" | "selectedDate" | "onDateSelect"> & { theme: ThemeColors }) {
  const availableSet = new Set(availableDates);
  const fullSet = new Set(fullDates);

  // Determine initial month from selectedDate or first available date or current month
  const initDate = selectedDate
    ? new Date(selectedDate)
    : availableDates.length > 0
      ? new Date(availableDates[0]!)
      : new Date();

  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  // 選定日期變動時，月曆翻到該月
  useEffect(() => {
    if (!selectedDate) return;
    const [y, m] = selectedDate.split("-").map(Number);
    if (!y || !m) return;
    setViewYear(y);
    setViewMonth(m - 1);
  }, [selectedDate]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const cellBase: CSSProperties = {
    width: 30,
    height: 30,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontFamily: FONT.ui,
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    background: "transparent",
    color: theme.ACCENT,
    position: "relative",
  };

  return (
    <>
      {/* All Dates button */}
      <button
        onClick={() => onDateSelect(null)}
        style={{
          width: "100%",
          padding: "6px 0",
          marginBottom: 8,
          fontSize: 11,
          fontFamily: FONT.ui,
          border: `1px solid ${selectedDate === null ? theme.ACTIVE_BORDER : theme.BORDER}`,
          borderRadius: 4,
          background: selectedDate === null ? theme.ACTIVE_BG : "transparent",
          color: selectedDate === null ? theme.ACTIVE_TEXT : theme.ACCENT,
          cursor: "pointer",
        }}
      >
        All Dates
      </button>

      {/* Month navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <button
          onClick={prevMonth}
          style={{ background: "none", border: "none", color: theme.ACCENT, cursor: "pointer", fontSize: 14, padding: "2px 6px" }}
        >
          &lt;
        </button>
        <span style={{ fontSize: 12, color: theme.ACTIVE_TEXT, fontWeight: 500 }}>
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          style={{ background: "none", border: "none", color: theme.ACCENT, cursor: "pointer", fontSize: 14, padding: "2px 6px" }}
        >
          &gt;
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 30px)", gap: 1, justifyContent: "center", marginBottom: 2 }}>
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            style={{
              width: 30,
              textAlign: "center",
              fontSize: 10,
              color: theme.DIM,
              fontFamily: FONT.ui,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 30px)", gap: 1, justifyContent: "center" }}>
        {/* Empty cells before first day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} style={{ width: 30, height: 30 }} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = formatDate(viewYear, viewMonth, day);
          const hasData = availableSet.has(dateStr);
          const isFull = fullSet.has(dateStr);
          const isSelected = selectedDate === dateStr;
          const count = dateCounts?.[dateStr];
          // 有 fullDates 資訊時，部分資料的日期文字調暗以區分
          const isPartial = hasData && !isFull && fullSet.size > 0;
          const tooltip = hasData
            ? count !== undefined
              ? `${count} flights${isFull ? "（完整）" : "（部分）"}`
              : isFull ? "完整資料" : undefined
            : undefined;
          return (
            <button
              key={day}
              title={tooltip}
              onClick={() => {
                if (isSelected) onDateSelect(null);
                else if (hasData) onDateSelect(dateStr);
              }}
              style={{
                ...cellBase,
                background: isSelected ? theme.ACTIVE_BG : "transparent",
                color: hasData ? (isPartial ? theme.ACCENT : theme.ACTIVE_TEXT) : theme.NO_DATA_TEXT,
                cursor: hasData ? "pointer" : "default",
                fontWeight: isSelected ? 700 : 400,
              }}
            >
              {day}
              {hasData && !isSelected && (
                <span
                  style={{
                    position: "absolute",
                    bottom: 2,
                    width: isFull ? 4 : 4,
                    height: isFull ? 4 : 4,
                    borderRadius: "50%",
                    background: isFull ? theme.ACCENT_BLUE : "transparent",
                    border: isFull ? "none" : `1px solid ${theme.ACCENT_BLUE}80`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
