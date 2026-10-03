import type React from "react";
import type { AirspaceFeature } from "../data/airspaceLoader";
import { AIRSPACE_CATEGORIES } from "../types/airspace";
import { FONT, SIZE } from "../styles/tokens";
import { DockCard } from "../ui";
import { mix } from "../ui/vars";
import { useTheme } from "../styles/ThemeContext";
import { AIRSPACE_FALLBACK_COLOR, rgbCss } from "../types/dataColors";

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
  const color = rgb ? rgbCss(rgb) : AIRSPACE_FALLBACK_COLOR;
  return { color, label: f.layer.toUpperCase() };
}

export function AirspaceInfoCard({ selected, others, onSelect, onClose, isDarkTheme }: AirspaceInfoCardProps) {
  const hours = extractHours(selected.remarks);
  const badge = getCategoryBadge(selected, isDarkTheme);
  const hasClass = selected.airspaceClass && selected.airspaceClass.trim() !== "";

  const { tokens } = useTheme();
  const textColor = tokens.fg1;
  const dimColor = tokens.fg2;
  const sectionBg = tokens.ctl;
  const warningBg = mix(tokens.warn, isDarkTheme ? 12 : 18);
  const warningBorder = mix(tokens.warn, 45);

  // 外殼 = DockCard（右下 dock，R1）；內文與關閉行為不變
  return (
    <DockCard eyebrow="AIRSPACE · 空域" title={selected.nameZh} onClose={onClose} closeLabel="關閉空域資訊">
      <div style={{ maxHeight: "50vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {/* Category badge */}
        <div
          style={{
            display: "inline-flex",
            alignSelf: "flex-start",
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
              fontSize: SIZE.minor, fontFamily: FONT.ui,
              fontWeight: 600, letterSpacing: "0.08em",
              color: badge.color, textTransform: "uppercase",
            }}
          >
            {badge.label}{hasClass ? ` · Class ${selected.airspaceClass}` : ""}
          </span>
        </div>

        {selected.nameEn && (
          <div style={{ fontSize: SIZE.sub, color: dimColor, marginBottom: 10, fontFamily: FONT.ui }}>
            {selected.nameEn}
          </div>
        )}

        {/* Scroll area */}
        <div>
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
              fontSize: SIZE.sub,
            }}
          >
            <span style={{ fontSize: SIZE.title }}>🕐</span>
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
                fontSize: SIZE.sub,
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
                fontSize: SIZE.body,
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
                      fontSize: SIZE.body,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = mix(tokens.fg1, 8); }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = sectionBg; }}
                  >
                    <span
                      style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: b.color, boxShadow: `0 0 4px ${b.color}`,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontFamily: FONT.ui, color: dimColor, minWidth: 42 }}>{b.label}</span>
                    <span style={{ flex: 1, color: textColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.nameZh}
                    </span>
                    <span style={{ color: dimColor, fontFamily: FONT.ui }}>
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
    </DockCard>
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
      <div style={{ fontSize: SIZE.eyebrow, letterSpacing: "0.1em", color: dim, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: SIZE.sub, fontFamily: FONT.ui, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children, dim }: { children: React.ReactNode; dim: string }) {
  return (
    <div
      style={{
        fontSize: SIZE.minor,
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
