import { useState, useEffect, type CSSProperties } from "react";
import { useTheme } from "../../../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../../../styles/tokens";
import { Button } from "../../../ui";
import { IconChevron } from "../../../ui/icons";
import { mix } from "../../../ui/vars";
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
}: Pick<IconRailSidebarProps, "availableDates" | "fullDates" | "dateCounts" | "selectedDate" | "onDateSelect">) {
  const { tokens } = useTheme();
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
    fontSize: SIZE.s11,
    fontFamily: FONT.data,
    border: "none",
    borderRadius: RADIUS.base,
    cursor: "pointer",
    background: "transparent",
    color: tokens.fg2,
    position: "relative",
  };

  return (
    <>
      {/* All Dates button */}
      <Button fullWidth pressed={selectedDate === null} onClick={() => onDateSelect(null)}>
        All Dates
      </Button>

      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Button
          variant="ghost"
          ariaLabel="上個月"
          onClick={prevMonth}
          icon={<span style={{ display: "flex", transform: "scaleX(-1)" }}><IconChevron direction="right" /></span>}
        />
        <span style={{ fontSize: SIZE.s12, color: tokens.fg1, fontWeight: 500, fontFamily: FONT.ui }}>
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <Button variant="ghost" ariaLabel="下個月" onClick={nextMonth} icon={<IconChevron direction="right" />} />
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 30px)", gap: 1, justifyContent: "center", marginBottom: SPACE.s2 }}>
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            style={{
              width: 30,
              textAlign: "center",
              fontSize: SIZE.s10,
              color: tokens.fg3,
              fontFamily: FONT.data,
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
                background: isSelected ? tokens.accentSoft : "transparent",
                color: hasData ? (isPartial ? tokens.fg2 : tokens.fg1) : mix(tokens.fg3, 50),
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
                    background: isFull ? tokens.accent : "transparent",
                    border: isFull ? "none" : `1px solid ${mix(tokens.accent, 50)}`,
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
