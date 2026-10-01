import { COLOR_THEMES, type ColorTheme } from "../../../types/colorTheme";
import type { AirportColorMode } from "../../../types/airportColors";
import { FONT } from "../../../styles/tokens";
import type { ThemeColors } from "../theme";
import { SectionHeader } from "../primitives";
import type { IconRailSidebarProps } from "../../IconRailSidebar";

/* ── Color Theme Panel ────────────────────────────────────── */

export type ColorThemePanelProps = Pick<IconRailSidebarProps,
  | "colorThemeKey" | "onColorThemeChange"
  | "colorThemeOverride" | "onColorThemeOverride"
  | "colorBy" | "onColorByChange"
  | "airportAssignment" | "airportColorOverrides"
  | "onAirportColorOverride" | "onAirportColorReset"
  | "compareModeActive"
> & { theme: ThemeColors };

export function ColorThemePanel(props: ColorThemePanelProps) {
  const {
    colorThemeKey, onColorThemeChange, colorThemeOverride, onColorThemeOverride,
    colorBy, onColorByChange, airportAssignment, airportColorOverrides,
    onAirportColorOverride, onAirportColorReset, compareModeActive,
    theme,
  } = props;

  const entries = Object.entries(COLOR_THEMES);
  const ct: ColorTheme = colorThemeOverride ?? COLOR_THEMES[colorThemeKey] ?? COLOR_THEMES["default"]!;

  const update = (patch: Partial<ColorTheme>) => {
    onColorThemeOverride({ ...ct, ...patch });
  };

  const pickerStyle: React.CSSProperties = {
    width: 24, height: 24, padding: 0, border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 4, cursor: "pointer", background: "transparent",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: theme.DIM, fontFamily: FONT.ui, minWidth: 55,
  };

  return (
    <>
      <SectionHeader theme={theme}>Preset</SectionHeader>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {entries.map(([key, preset]) => {
          const active = key === colorThemeKey && !colorThemeOverride;
          return (
            <button
              key={key}
              onClick={() => onColorThemeChange(key)}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                border: `1px solid ${active ? theme.ACCENT_BLUE : theme.BORDER}`,
                background: active ? "rgba(100,160,255,0.15)" : "rgba(255,255,255,0.05)",
                color: active ? theme.ACCENT_BLUE : theme.DIM,
                fontSize: 11,
                fontFamily: FONT.ui,
                cursor: "pointer",
              }}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      <SectionHeader theme={theme}>Adjust</SectionHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Trail colors */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={labelStyle}>Trails</span>
          {ct.trailColors.map((c, i) => (
            <input key={i} type="color" value={c} style={pickerStyle}
              onChange={(e) => {
                const newColors = [...ct.trailColors] as [string, string, string, string, string];
                newColors[i] = e.target.value;
                update({ trailColors: newColors });
              }} />
          ))}
        </div>

        {/* Static gradient (multi-stop) */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={labelStyle}>Static</span>
          {ct.staticGradient.map((c, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
              {i > 0 && <span style={{ fontSize: 9, color: theme.DIM }}>→</span>}
              <input type="color" value={c} style={pickerStyle}
                onChange={(e) => {
                  const g = [...ct.staticGradient];
                  g[i] = e.target.value;
                  update({ staticGradient: g });
                }} />
            </span>
          ))}
          {ct.staticGradient.length < 5 && (
            <button onClick={() => update({ staticGradient: [...ct.staticGradient, ct.staticGradient[ct.staticGradient.length - 1]!] })}
              style={{ ...pickerStyle, width: 20, height: 20, fontSize: 14, color: theme.DIM, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          )}
          {ct.staticGradient.length > 2 && (
            <button onClick={() => update({ staticGradient: ct.staticGradient.slice(0, -1) })}
              style={{ ...pickerStyle, width: 20, height: 20, fontSize: 14, color: theme.DIM, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
          )}
        </div>
        <div style={{ marginLeft: 59, height: 12, borderRadius: 3, background: `linear-gradient(90deg, ${ct.staticGradient.join(", ")})`, border: "1px solid rgba(255,255,255,0.1)", marginTop: -4, marginBottom: 4 }} />

        {/* Orb glow */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={labelStyle}>Orb</span>
          <input type="color" value={ct.orbGlow} style={pickerStyle}
            onChange={(e) => update({ orbGlow: e.target.value })} />
        </div>

        {/* 2D Map trail */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={labelStyle}>2D Map</span>
          <input type="color" value={ct.mapTrailA} style={pickerStyle}
            onChange={(e) => update({ mapTrailA: e.target.value })} />
          <span style={{ fontSize: 9, color: theme.DIM }}>→</span>
          <input type="color" value={ct.mapTrailB} style={pickerStyle}
            onChange={(e) => update({ mapTrailB: e.target.value })} />
          <div style={{ flex: 1, height: 16, borderRadius: 3, background: `linear-gradient(90deg, ${ct.mapTrailA}, ${ct.mapTrailB})`, border: "1px solid rgba(255,255,255,0.1)" }} />
        </div>
      </div>

      {/* ── Compare Airports（opt-in 比較模式）─────────────── */}
      <SectionHeader theme={theme}>Compare Airports</SectionHeader>
      {compareModeActive && (
        <div style={{ fontSize: 10, color: theme.DIM, marginBottom: 6, lineHeight: 1.4 }}>
          日期 Compare 啟用時自動關閉
        </div>
      )}

      {/* 主開關（ON/OFF toggle）*/}
      <div
        onClick={() => {
          if (compareModeActive) return;
          onColorByChange(colorBy === "theme" ? "local" : "theme");
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          marginBottom: 6,
          borderRadius: 6,
          border: `1px solid ${colorBy !== "theme" ? theme.ACTIVE_BORDER : theme.BORDER}`,
          background: colorBy !== "theme" ? theme.ACTIVE_BG : "transparent",
          cursor: compareModeActive ? "not-allowed" : "pointer",
          opacity: compareModeActive ? 0.4 : 1,
          transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: 12, fontFamily: FONT.ui, color: theme.ACCENT }}>
          {colorBy === "theme" ? "Off" : "On"}
        </span>
        <span
          style={{
            width: 28, height: 14, borderRadius: 7,
            background: colorBy !== "theme" ? theme.ACCENT_BLUE : theme.SLIDER_TRACK,
            position: "relative", transition: "background 0.15s",
          }}
        >
          <span
            style={{
              position: "absolute", top: 1,
              left: colorBy !== "theme" ? 15 : 1,
              width: 12, height: 12, borderRadius: "50%",
              background: "#fff", transition: "left 0.15s",
              boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
            }}
          />
        </span>
      </div>

      {/* On 時才顯示維度切換 */}
      {colorBy !== "theme" && !compareModeActive && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {(["local", "origin", "dest"] as AirportColorMode[]).map((m) => {
            const label = m === "local" ? "Local" : m === "origin" ? "Origin" : "Dest";
            const active = colorBy === m;
            return (
              <button
                key={m}
                onClick={() => onColorByChange(m)}
                title={
                  m === "local" ? "目前 Selection 的機場（純區域總覽時使用 region）"
                  : m === "origin" ? "起飛機場"
                  : "目的地機場"
                }
                style={{
                  flex: 1,
                  padding: "4px 0",
                  fontSize: 10,
                  fontFamily: FONT.ui,
                  border: `1px solid ${active ? theme.ACTIVE_BORDER : theme.BORDER}`,
                  borderRadius: 4,
                  background: active ? theme.ACTIVE_BG : "transparent",
                  color: active ? theme.ACTIVE_TEXT : theme.DIM,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {colorBy !== "theme" && !compareModeActive && airportAssignment && (
        <>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 10, color: theme.DIM, marginBottom: 6,
          }}>
            <span>
              {airportAssignment.airports.length} airport{airportAssignment.airports.length !== 1 ? "s" : ""}
              {" · "}
              {colorBy === "local" ? "local"
                : colorBy === "origin" ? "by departure"
                : "by arrival"}
            </span>
            {Object.keys(airportColorOverrides).length > 0 && (
              <button
                onClick={onAirportColorReset}
                style={{
                  fontSize: 10, color: theme.ACCENT_BLUE, background: "none",
                  border: "none", cursor: "pointer", padding: 0,
                  fontFamily: FONT.ui,
                }}
              >
                reset
              </button>
            )}
          </div>
          <div style={{
            display: "flex", flexDirection: "column", gap: 3,
            maxHeight: 220, overflowY: "auto",
            paddingRight: 2,
          }}>
            {airportAssignment.airports.map((ap) => (
              <div
                key={ap.icao}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 6px",
                  borderRadius: 4,
                  background: ap.isCustom ? theme.HOVER_BG : "transparent",
                  border: `1px solid ${ap.isCustom ? theme.BORDER : "transparent"}`,
                }}
              >
                <label
                  style={{
                    position: "relative", width: 18, height: 18, flexShrink: 0,
                    borderRadius: "50%", cursor: "pointer",
                    background: ap.palette.primary,
                    boxShadow: `0 0 6px ${ap.palette.primary}88`,
                    border: "1px solid rgba(255,255,255,0.25)",
                  }}
                  title="點擊改色"
                >
                  <input
                    type="color"
                    value={ap.palette.primary}
                    onChange={(e) => onAirportColorOverride(ap.icao, e.target.value)}
                    style={{
                      position: "absolute", inset: 0, opacity: 0,
                      width: "100%", height: "100%", cursor: "pointer",
                    }}
                  />
                </label>
                <span style={{ fontSize: 11, fontFamily: FONT.ui, color: theme.ACCENT, minWidth: 42 }}>
                  {ap.icao}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: theme.DIM, fontFamily: FONT.ui }}>
                  {ap.count}
                </span>
                {ap.isCustom && (
                  <button
                    onClick={() => onAirportColorOverride(ap.icao, null)}
                    style={{
                      fontSize: 10, color: theme.DIM, background: "none",
                      border: "none", cursor: "pointer", padding: "0 2px",
                    }}
                    title="恢復預設色"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {airportAssignment.airports.length === 0 && (
              <div style={{ fontSize: 10, color: theme.DIM, padding: "6px 0" }}>
                尚無航班資料
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
