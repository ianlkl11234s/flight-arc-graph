import { useTheme } from "../../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../../styles/tokens";
import { mix } from "../../ui/vars";

export function HourlyHeatmap({ hourly }: { hourly: { hour: number; count: number }[] }) {
  const { tokens } = useTheme();
  const max = Math.max(...hourly.map((h) => h.count), 1);
  return (
    <div>
      <div style={{ display: "flex", gap: 1, height: 20 }}>
        {hourly.map((h) => {
          const intensity = h.count / max;
          return (
            <div
              key={h.hour}
              title={`${String(h.hour).padStart(2, "0")}:00 — ${h.count} flights`}
              style={{
                flex: 1,
                borderRadius: RADIUS.base,
                background: h.count > 0 ? mix(tokens.accent, 20 + intensity * 80) : mix(tokens.fg1, 12),
                transition: "background 0.3s",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: SIZE.eyebrow, color: tokens.fg3, fontFamily: FONT.data, marginTop: SPACE.s2 }}>
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </div>
  );
}

/** 每日趨勢 SVG 折線圖 */
export function DailyTrendChart({ daily }: { daily: { date: string; departures: number; arrivals: number; total: number }[] }) {
  const { tokens } = useTheme();
  if (daily.length < 2) return null;
  const W = 264;
  const H = 50;
  const PAD = 2;
  const maxVal = Math.max(...daily.map((d) => d.total), 1);
  const stepX = (W - PAD * 2) / (daily.length - 1);

  const toPoints = (getValue: (d: typeof daily[0]) => number) =>
    daily.map((d, i) => `${PAD + i * stepX},${H - PAD - ((getValue(d) / maxVal) * (H - PAD * 2))}`).join(" ");

  const depPoints = toPoints((d) => d.departures);
  const arrPoints = toPoints((d) => d.arrivals);

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <polyline points={depPoints} fill="none" stroke={tokens.accent} strokeWidth="1.5" strokeLinejoin="round" />
        <polyline points={arrPoints} fill="none" stroke={tokens.fg2} strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="3,2" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: SIZE.eyebrow, color: tokens.fg3, fontFamily: FONT.data, marginTop: 1 }}>
        <span>{daily[0]!.date.slice(5)}</span>
        <span style={{ display: "flex", gap: SPACE.s8 }}>
          <span style={{ color: tokens.accent }}>— Dep</span>
          <span style={{ color: tokens.fg2 }}>┈ Arr</span>
        </span>
        <span>{daily[daily.length - 1]!.date.slice(5)}</span>
      </div>
    </div>
  );
}

/** 水平迷你長條（標籤、長條、數值） */
export function MiniBar({ items }: { items: { label: string; value: number; color?: string }[] }) {
  const { tokens } = useTheme();
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: SPACE.s6 }}>
          <span style={{ fontSize: SIZE.minor, color: tokens.fg3, fontFamily: FONT.data, width: 32, textAlign: "right", flexShrink: 0 }}>
            {item.label}
          </span>
          <div style={{ flex: 1, height: 10, background: mix(tokens.fg1, 12), borderRadius: RADIUS.base, overflow: "hidden" }}>
            <div style={{
              width: `${(item.value / max) * 100}%`,
              height: "100%",
              background: item.color ?? tokens.accent,
              transition: "width 0.3s ease",
            }} />
          </div>
          <span style={{ fontSize: SIZE.minor, color: tokens.fg2, fontFamily: FONT.data, fontVariantNumeric: "tabular-nums", width: 28, textAlign: "right", flexShrink: 0 }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
