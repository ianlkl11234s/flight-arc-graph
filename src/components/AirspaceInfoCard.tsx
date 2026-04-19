import type React from "react";
import type { AirspaceFeature } from "../data/airspaceLoader";
import { AIRSPACE_CATEGORIES } from "../types/airspace";

interface AirspaceInfoCardProps {
  selected: AirspaceFeature;
  others: AirspaceFeature[];   // 同一點下其他較大範圍的空域
  onSelect: (f: AirspaceFeature) => void;
  onClose: () => void;
  isDarkTheme: boolean;
}

/** 從 remarks 抽取時段 badge（24/7、晝夜連續、限航時段 XXXX-XXXX UTC） */
function extractHours(remarks: string): string | null {
  if (!remarks) return null;
  if (/晝夜連續限航|H24|H\s*24/i.test(remarks)) return "24/7 限航";
  const m = remarks.match(/限航時段[：:]([^。\n]+)/);
  if (m) return m[1]!.trim();
  const t = remarks.match(/(\d{4})\s*-\s*(\d{4})\s*UTC/);
  if (t) return `${t[1]}–${t[2]} UTC`;
  return null;
}

/** 為分類產生徽章色 */
function getCategoryBadge(f: AirspaceFeature, isDark: boolean): { color: string; label: string } {
  const conf = AIRSPACE_CATEGORIES.find((c) => c.id === f.category);
  const rgb = isDark ? conf?.colorDark : conf?.colorLight;
  const color = rgb
    ? `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`
    : "#888";
  return { color, label: f.layer.toUpperCase() };
}

export function AirspaceInfoCard({ selected, others, onSelect, onClose, isDarkTheme }: AirspaceInfoCardProps) {
  const hours = extractHours(selected.remarks);
  const badge = getCategoryBadge(selected, isDarkTheme);
  const hasClass = selected.airspaceClass && selected.airspaceClass.trim() !== "";

  const bgColor = isDarkTheme ? "rgba(10, 12, 16, 0.82)" : "rgba(255, 255, 255, 0.92)";
  const borderColor = isDarkTheme ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)";
  const textColor = isDarkTheme ? "#E5E7EB" : "#1a1a1a";
  const dimColor = isDarkTheme ? "#8a909b" : "#6b7280";
  const sectionBg = isDarkTheme ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const warningBg = isDarkTheme ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.18)";
  const warningBorder = "rgba(245, 158, 11, 0.45)";

  return (
    <div
      style={{
        position: "absolute",
        right: 20,
        bottom: 20,
        width: 360,
        maxHeight: "65vh",
        display: "flex",
        flexDirection: "column",
        background: bgColor,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        color: textColor,
        boxShadow: isDarkTheme
          ? "0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(100,170,255,0.08) inset"
          : "0 10px 30px rgba(0,0,0,0.12)",
        zIndex: 22,
        overflow: "hidden",
        animation: "airspaceCardIn 0.22s ease-out",
      }}
    >
      <style>{`
        @keyframes airspaceCardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: "14px 16px 10px 16px", position: "relative" }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: isDarkTheme ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            border: `1px solid ${borderColor}`,
            color: dimColor,
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>

        {/* Category badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            marginBottom: 8,
            borderRadius: 4,
            background: `${badge.color}22`,
            border: `1px solid ${badge.color}55`,
          }}
        >
          <span
            style={{
              width: 7, height: 7, borderRadius: "50%",
              background: badge.color, boxShadow: `0 0 6px ${badge.color}`,
            }}
          />
          <span
            style={{
              fontSize: 10, fontFamily: "monospace",
              fontWeight: 600, letterSpacing: "0.08em",
              color: badge.color, textTransform: "uppercase",
            }}
          >
            {badge.label}{hasClass ? ` · Class ${selected.airspaceClass}` : ""}
          </span>
        </div>

        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "0.01em", lineHeight: 1.25 }}>
          {selected.nameZh}
        </div>
        {selected.nameEn && (
          <div style={{ fontSize: 12, color: dimColor, marginTop: 2, fontFamily: "monospace" }}>
            {selected.nameEn}
          </div>
        )}
      </div>

      {/* Scroll area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 14px 16px" }}>
        {/* Altitude */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <MetricBlock label="FLOOR" value={selected.floorRaw || "—"} dim={dimColor} bg={sectionBg} />
          <MetricBlock label="CEILING" value={selected.ceilingRaw || "—"} dim={dimColor} bg={sectionBg} />
        </div>

        {/* Hours */}
        {hours && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              marginBottom: 10,
              background: sectionBg,
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <span style={{ fontSize: 14 }}>🕐</span>
            <span style={{ fontWeight: 500 }}>{hours}</span>
          </div>
        )}

        {/* Remarks */}
        {selected.remarks && (
          <>
            <SectionLabel dim={dimColor}>Restrictions</SectionLabel>
            <div
              style={{
                background: sectionBg,
                borderRadius: 6,
                padding: "10px 12px",
                fontSize: 12,
                lineHeight: 1.6,
                maxHeight: 180,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                color: textColor,
                opacity: 0.92,
              }}
            >
              {selected.remarks}
            </div>
          </>
        )}

        {/* Warnings */}
        {selected.warnings.length > 0 && (
          <>
            <SectionLabel dim={dimColor}>Warnings</SectionLabel>
            <div
              style={{
                background: warningBg,
                border: `1px solid ${warningBorder}`,
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
              {selected.warnings.map((w, i) => (
                <div key={i} style={{ marginBottom: i < selected.warnings.length - 1 ? 4 : 0 }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Other zones at same point */}
        {others.length > 0 && (
          <>
            <SectionLabel dim={dimColor}>Also here ({others.length})</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {others.map((f) => {
                const b = getCategoryBadge(f, isDarkTheme);
                return (
                  <div
                    key={f.id}
                    onClick={() => onSelect(f)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      borderRadius: 4,
                      cursor: "pointer",
                      background: sectionBg,
                      fontSize: 11,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = isDarkTheme ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = sectionBg; }}
                  >
                    <span
                      style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: b.color, boxShadow: `0 0 4px ${b.color}`,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontFamily: "monospace", color: dimColor, minWidth: 42 }}>{b.label}</span>
                    <span style={{ flex: 1, color: textColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.nameZh}
                    </span>
                    <span style={{ color: dimColor, fontFamily: "monospace" }}>
                      {f.floorRaw}→{f.ceilingRaw}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricBlock({ label, value, dim, bg }: { label: string; value: string; dim: string; bg: string }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "8px 10px",
        background: bg,
        borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: "0.1em", color: dim, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children, dim }: { children: React.ReactNode; dim: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: dim,
        marginTop: 12,
        marginBottom: 6,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}
