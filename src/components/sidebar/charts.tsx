import { FONT } from "../../styles/tokens";
import type { ThemeColors } from "./theme";

export function HourlyHeatmap({ hourly, theme }: { hourly: { hour: number; count: number }[]; theme: ThemeColors }) {
  const max = Math.max(...hourly.map((h) => h.count), 1);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 1, height: 20 }}>
        {hourly.map((h) => {
          const intensity = h.count / max;
          const r = Math.round(100 + 155 * intensity);
          const g = Math.round(170 * (1 - intensity * 0.6));
          const b = 255;
          return (
            <div
              key={h.hour}
              title={`${String(h.hour).padStart(2, "0")}:00 — ${h.count} flights`}
              style={{
                flex: 1,
                borderRadius: 2,
                background: h.count > 0 ? `rgba(${r},${g},${b},${0.2 + intensity * 0.8})` : theme.SLIDER_TRACK,
                transition: "background 0.3s",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: theme.DIM, fontFamily: FONT.ui, marginTop: 2 }}>
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </div>
  );
}

/** 每日趨勢 SVG 折線圖 */
export function DailyTrendChart({ daily, theme }: { daily: { date: string; departures: number; arrivals: number; total: number }[]; theme: ThemeColors }) {
  if (daily.length < 2) return null;
  const W = 210;
  const H = 50;
  const PAD = 2;
  const maxVal = Math.max(...daily.map((d) => d.total), 1);
  const stepX = (W - PAD * 2) / (daily.length - 1);

  const toPoints = (getValue: (d: typeof daily[0]) => number) =>
    daily.map((d, i) => `${PAD + i * stepX},${H - PAD - ((getValue(d) / maxVal) * (H - PAD * 2))}`).join(" ");

  const depPoints = toPoints((d) => d.departures);
  const arrPoints = toPoints((d) => d.arrivals);

  return (
    <div style={{ marginBottom: 8 }}>
      <svg width={W} height={H} style={{ display: "block" }}>
        <polyline points={depPoints} fill="none" stroke={theme.ACCENT_BLUE} strokeWidth="1.5" strokeLinejoin="round" />
        <polyline points={arrPoints} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="3,2" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: theme.DIM, fontFamily: FONT.ui, marginTop: 1 }}>
        <span>{daily[0]!.date.slice(5)}</span>
        <span style={{ display: "flex", gap: 8 }}>
          <span style={{ color: theme.ACCENT_BLUE }}>— Dep</span>
          <span style={{ color: "#f59e0b" }}>┈ Arr</span>
        </span>
        <span>{daily[daily.length - 1]!.date.slice(5)}</span>
      </div>
    </div>
  );
}
