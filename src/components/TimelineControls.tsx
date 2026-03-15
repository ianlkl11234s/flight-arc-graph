interface Props {
  playing: boolean;
  speed: number;
  progress: number;
  currentTime: number;
  windowStart: number;
  windowEnd: number;
  selectedDate: string;
  rangeDays: number;
  isDarkTheme?: boolean;
  isMobile?: boolean;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onSeekByProgress: (p: number) => void;
  onDateShift: (delta: number) => void;
  onRangeDaysChange: (n: number) => void;
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
  isDarkTheme = true,
  isMobile = false,
  onToggle,
  onSpeedChange,
  onSeekByProgress,
  onDateShift,
  onRangeDaysChange,
}: Props) {
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
        <span
          style={{
            color: isDarkTheme ? "#fff" : "rgba(50,50,50,0.9)",
            fontSize: isMobile ? 14 : 13,
            fontFamily: "monospace",
            fontWeight: 600,
            letterSpacing: 0.5,
            minWidth: isMobile ? 90 : 80,
            textAlign: "center",
          }}
        >
          {formatDateLabel(selectedDate)}
        </span>
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
        <select
          value={rangeDays}
          onChange={(e) => onRangeDaysChange(Number(e.target.value))}
          style={getSelectStyle(isDarkTheme)}
        >
          <option value={1}>1d</option>
          <option value={3}>3d</option>
          <option value={7}>7d</option>
        </select>
      </div>

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
          <option value={30}>30x</option>
          <option value={60}>60x</option>
          <option value={120}>120x</option>
          <option value={300}>300x</option>
          <option value={600}>600x</option>
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
