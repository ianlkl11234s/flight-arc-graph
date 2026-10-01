import { COLOR_THEMES, type ColorTheme } from "../../../types/colorTheme";
import type { AirportColorMode } from "../../../types/airportColors";
import { useTheme } from "../../../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../../../styles/tokens";
import { Button, Chip, Section, Segmented, Toggle } from "../../../ui";
import { IconClose } from "../../../ui/icons";
import type { IconRailSidebarProps } from "../../IconRailSidebar";

/* ── Color Theme Panel ────────────────────────────────────── */

export type ColorThemePanelProps = Pick<IconRailSidebarProps,
  | "colorThemeKey" | "onColorThemeChange"
  | "colorThemeOverride" | "onColorThemeOverride"
  | "colorBy" | "onColorByChange"
  | "airportAssignment" | "airportColorOverrides"
  | "onAirportColorOverride" | "onAirportColorReset"
  | "compareModeActive"
>;

export function ColorThemePanel(props: ColorThemePanelProps) {
  const { tokens } = useTheme();
  const {
    colorThemeKey, onColorThemeChange, colorThemeOverride, onColorThemeOverride,
    colorBy, onColorByChange, airportAssignment, airportColorOverrides,
    onAirportColorOverride, onAirportColorReset, compareModeActive,
  } = props;

  const entries = Object.entries(COLOR_THEMES);
  const ct: ColorTheme = colorThemeOverride ?? COLOR_THEMES[colorThemeKey] ?? COLOR_THEMES["default"]!;

  const update = (patch: Partial<ColorTheme>) => {
    onColorThemeOverride({ ...ct, ...patch });
  };

  const pickerStyle: React.CSSProperties = {
    width: 24, height: 24, padding: 0, border: `1px solid ${tokens.border}`,
    borderRadius: RADIUS.base, cursor: "pointer", background: "transparent",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: SIZE.s10, color: tokens.fg3, fontFamily: FONT.ui, minWidth: 55,
  };

  const arrow = <span style={{ fontSize: SIZE.s9, color: tokens.fg3 }}>→</span>;
  const swatchBar = { borderRadius: RADIUS.base, border: `1px solid ${tokens.border}` } as const;
  const stepBtn = { width: 24, padding: 0 } as const;
  const modeTitles: Record<string, string> = {
    local: "目前 Selection 的機場（純區域總覽時使用 region）",
    origin: "起飛機場",
    dest: "目的地機場",
  };

  return (
    <>
      <Section title="PRESET · 預設配色">
        <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.s6 }}>
          {entries.map(([key, preset]) => (
            <Chip
              key={key}
              mono={false}
              label={preset.name}
              selected={key === colorThemeKey && !colorThemeOverride}
              onClick={() => onColorThemeChange(key)}
            />
          ))}
        </div>
      </Section>

      <Section title="ADJUST · 微調">
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s8 }}>
          {/* Trail colors */}
          <div style={{ display: "flex", alignItems: "center", gap: SPACE.s4 }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: SPACE.s4, flexWrap: "wrap" }}>
            <span style={labelStyle}>Static</span>
            {ct.staticGradient.map((c, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: SPACE.s2 }}>
                {i > 0 && arrow}
                <input type="color" value={c} style={pickerStyle}
                  onChange={(e) => {
                    const g = [...ct.staticGradient];
                    g[i] = e.target.value;
                    update({ staticGradient: g });
                  }} />
              </span>
            ))}
            {ct.staticGradient.length < 5 && (
              <Button ariaLabel="新增漸層色標" style={stepBtn}
                onClick={() => update({ staticGradient: [...ct.staticGradient, ct.staticGradient[ct.staticGradient.length - 1]!] })}>+</Button>
            )}
            {ct.staticGradient.length > 2 && (
              <Button ariaLabel="移除最後一個色標" style={stepBtn}
                onClick={() => update({ staticGradient: ct.staticGradient.slice(0, -1) })}>−</Button>
            )}
          </div>
          <div style={{ ...swatchBar, marginLeft: 59, height: 12, background: `linear-gradient(90deg, ${ct.staticGradient.join(", ")})` }} />

          {/* Orb glow */}
          <div style={{ display: "flex", alignItems: "center", gap: SPACE.s4 }}>
            <span style={labelStyle}>Orb</span>
            <input type="color" value={ct.orbGlow} style={pickerStyle}
              onChange={(e) => update({ orbGlow: e.target.value })} />
          </div>

          {/* 2D Map trail */}
          <div style={{ display: "flex", alignItems: "center", gap: SPACE.s4 }}>
            <span style={labelStyle}>2D Map</span>
            <input type="color" value={ct.mapTrailA} style={pickerStyle}
              onChange={(e) => update({ mapTrailA: e.target.value })} />
            {arrow}
            <input type="color" value={ct.mapTrailB} style={pickerStyle}
              onChange={(e) => update({ mapTrailB: e.target.value })} />
            <div style={{ ...swatchBar, flex: 1, height: 16, background: `linear-gradient(90deg, ${ct.mapTrailA}, ${ct.mapTrailB})` }} />
          </div>
        </div>
      </Section>

      {/* ── Compare Airports（opt-in 比較模式）─────────────── */}
      <Section title="COMPARE · 機場配色">
        {compareModeActive && (
          <div style={{ fontSize: SIZE.s10, color: tokens.fg3, lineHeight: 1.4 }}>
            日期 Compare 啟用時自動關閉
          </div>
        )}

        {/* 主開關（ON/OFF toggle）*/}
        <Toggle
          label={colorBy === "theme" ? "Off" : "On"}
          ariaLabel="機場配色"
          checked={colorBy !== "theme"}
          disabled={compareModeActive}
          onChange={() => onColorByChange(colorBy === "theme" ? "local" : "theme")}
        />

        {/* On 時才顯示維度切換 */}
        {colorBy !== "theme" && !compareModeActive && (
          <Segmented<AirportColorMode>
            fullWidth
            ariaLabel="機場配色維度"
            options={(["local", "origin", "dest"] as AirportColorMode[]).map((m) => ({
              value: m,
              label: m === "local" ? "Local" : m === "origin" ? "Origin" : "Dest",
              title: modeTitles[m],
            }))}
            value={colorBy}
            onChange={onColorByChange}
          />
        )}

        {colorBy !== "theme" && !compareModeActive && airportAssignment && (
          <>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              fontSize: SIZE.s10, color: tokens.fg3,
            }}>
              <span>
                {airportAssignment.airports.length} airport{airportAssignment.airports.length !== 1 ? "s" : ""}
                {" · "}
                {colorBy === "local" ? "local"
                  : colorBy === "origin" ? "by departure"
                  : "by arrival"}
              </span>
              {Object.keys(airportColorOverrides).length > 0 && (
                <Button variant="ghost" onClick={onAirportColorReset}>reset</Button>
              )}
            </div>
            <div style={{
              display: "flex", flexDirection: "column", gap: 3,
              maxHeight: 220, overflowY: "auto",
              paddingRight: SPACE.s2,
            }}>
              {airportAssignment.airports.map((ap) => (
                <div
                  key={ap.icao}
                  style={{
                    display: "flex", alignItems: "center", gap: SPACE.s6,
                    padding: `${SPACE.s4}px ${SPACE.s6}px`,
                    borderRadius: RADIUS.base,
                    background: ap.isCustom ? tokens.ctl : "transparent",
                    border: `1px solid ${ap.isCustom ? tokens.border : "transparent"}`,
                  }}
                >
                  {/* 色點是資料色（機場配色本身），保留 */}
                  <label
                    style={{
                      position: "relative", width: 18, height: 18, flexShrink: 0,
                      borderRadius: "50%", cursor: "pointer",
                      background: ap.palette.primary,
                      boxShadow: `0 0 6px ${ap.palette.primary}88`,
                      border: `1px solid ${tokens.border}`,
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
                  <span style={{ fontSize: SIZE.s11, fontFamily: FONT.data, color: tokens.fg1, minWidth: 42 }}>
                    {ap.icao}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: SIZE.s10, color: tokens.fg3, fontFamily: FONT.data, fontVariantNumeric: "tabular-nums" }}>
                    {ap.count}
                  </span>
                  {ap.isCustom && (
                    <Button
                      variant="ghost"
                      ariaLabel="恢復預設色"
                      title="恢復預設色"
                      icon={<IconClose size={10} />}
                      style={{ width: 20, height: 20, padding: 0 }}
                      onClick={() => onAirportColorOverride(ap.icao, null)}
                    />
                  )}
                </div>
              ))}
              {airportAssignment.airports.length === 0 && (
                <div style={{ fontSize: SIZE.s10, color: tokens.fg3, padding: `${SPACE.s6}px 0` }}>
                  尚無航班資料
                </div>
              )}
            </div>
          </>
        )}
      </Section>
    </>
  );
}
