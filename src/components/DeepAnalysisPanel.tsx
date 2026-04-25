/**
 * Deep Analysis Panel（🔬）
 *
 * Phase 2c：colorBy dropdown + legend（計數）
 * 之後會在這裡加 multi-filter chips（2d）
 */

import type { Flight } from "../types";
import {
  COLOR_BY_OPTIONS,
  getAnalysisLegend,
  type AnalysisColorBy,
} from "../data/analysisColors";

interface ThemeColors {
  ACCENT: string;
  BORDER: string;
  DIM: string;
  ACTIVE_TEXT: string;
  ACTIVE_BG: string;
  ACTIVE_BORDER: string;
  HOVER_BG: string;
  SELECT_BG: string;
}

export interface DeepAnalysisPanelProps {
  flights: Flight[];
  colorBy: AnalysisColorBy;
  onColorByChange: (v: AnalysisColorBy) => void;
  isDarkTheme: boolean;
  theme: ThemeColors;
}

export function DeepAnalysisPanel({
  flights,
  colorBy,
  onColorByChange,
  isDarkTheme,
  theme,
}: DeepAnalysisPanelProps) {
  const legend = getAnalysisLegend(flights, colorBy);
  const totalInLegend = legend.reduce((s, it) => s + it.count, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* ── ColorBy dropdown ── */}
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: theme.DIM,
            marginBottom: 6,
          }}
        >
          Color By
        </div>
        <select
          value={colorBy}
          onChange={(e) => onColorByChange(e.target.value as AnalysisColorBy)}
          style={{
            width: "100%",
            padding: "6px 8px",
            fontSize: 12,
            fontFamily: "monospace",
            background: theme.SELECT_BG,
            color: theme.ACCENT,
            border: `1px solid ${theme.BORDER}`,
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          {COLOR_BY_OPTIONS.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              style={{
                background: isDarkTheme ? "#1a1a1a" : "#fff",
                color: isDarkTheme ? "#fff" : "#000",
              }}
            >
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Summary line ── */}
      {colorBy !== "none" && (
        <div
          style={{
            fontSize: 10,
            color: theme.DIM,
            fontFamily: "monospace",
            paddingBottom: 4,
            borderBottom: `1px solid ${theme.BORDER}`,
          }}
        >
          {totalInLegend.toLocaleString()} flights · {legend.length} groups
        </div>
      )}

      {/* ── Legend ── */}
      {colorBy !== "none" && legend.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 360,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {legend.map((item) => {
            const pct = totalInLegend > 0 ? (item.count / totalInLegend) * 100 : 0;
            return (
              <div
                key={item.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 6px",
                  borderRadius: 3,
                  background: theme.HOVER_BG,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    background: item.color,
                    border: `1px solid ${theme.BORDER}`,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    color: theme.ACCENT,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={item.label}
                >
                  {item.label}
                </span>
                <span style={{ color: theme.DIM, flexShrink: 0 }}>
                  {item.count.toLocaleString()}
                </span>
                <span
                  style={{
                    color: theme.DIM,
                    fontSize: 10,
                    minWidth: 36,
                    textAlign: "right",
                  }}
                >
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty state ── */}
      {colorBy === "none" && (
        <div
          style={{
            fontSize: 11,
            color: theme.DIM,
            padding: "12px 0",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Choose a dimension above to<br />
          color-code flights by category.
        </div>
      )}
    </div>
  );
}
