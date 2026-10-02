import type { DisplayMode, Scope, TrackMode } from "../../../types";
import { useTheme } from "../../../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../../../styles/tokens";
import { Section, Segmented, Select, Slider, Toggle } from "../../../ui";
import { mix } from "../../../ui/vars";
import type { IconRailSidebarProps } from "../../IconRailSidebar";

export function SettingsPanel(props: IconRailSidebarProps) {
  const { tokens } = useTheme();
  return (
    <>
      <Section title="SCOPE · 範圍">
        {props.airportSet !== null ? (
          <div style={{
            padding: `${SPACE.s6}px ${SPACE.s8}px`,
            border: `1px solid ${mix(tokens.accent, 60)}`,
            borderRadius: RADIUS.base,
            background: tokens.accentSoft,
            color: tokens.fg1,
            fontSize: SIZE.minor,
            fontFamily: FONT.ui,
            lineHeight: 1.45,
          }}>
            Current selection · {props.airportSet.length} airport{props.airportSet.length === 1 ? "" : "s"}
          </div>
        ) : (
          <Segmented<Scope>
            fullWidth
            options={[
              { value: "airport", label: "This Airport" },
              { value: "region", label: props.region === "all" ? "All Regions" : props.region === "world" ? "All World" : `All ${REGION_LABELS[props.region] ?? props.region}` },
            ]}
            value={props.scope}
            onChange={props.onScopeChange}
          />
        )}
        <Segmented<TrackMode>
          fullWidth
          options={[
            { value: "stack", label: "Stack All" },
            { value: "single", label: "Track Single" },
          ]}
          value={props.trackMode}
          onChange={(m) => {
            props.onTrackModeChange(m);
            if (m !== "single") props.onFlightSelect(null);
          }}
        />
        {props.trackMode === "single" && props.pickableFlights.length > 0 && (
          <Select<string>
            fullWidth
            ariaLabel="Select flight"
            placeholder="Select flight..."
            value={props.selectedFlightId}
            onChange={(v) => props.onFlightSelect(v || null)}
            options={props.pickableFlights.map((f) => ({
              value: f.fr24_id,
              label: `${f.callsign} (${f.origin_iata}→${f.dest_iata})`,
            }))}
          />
        )}
      </Section>

      <Section title="DISPLAY · 顯示">
        <Segmented<DisplayMode>
          fullWidth
          options={[
            { value: "trails", label: "Flight Trails" },
            { value: "status", label: "Live Status" },
          ]}
          value={props.displayMode}
          onChange={props.onDisplayModeChange}
        />
        {/* ±12h Window：僅在 Flight Trails 模式下顯示 */}
        {props.displayMode === "trails" && (
          <Toggle label="±12h Window" checked={props.timeWindow} onChange={props.onTimeWindowChange} />
        )}
        {/* Far View：拉遠時光點按 zoom 補償放大 + 軌跡加亮 */}
        <Toggle label="Far View 遠景增強" checked={props.farView} onChange={props.onFarViewChange} />
        {props.farView && (
          <Slider
            label="Boost"
            value={props.farViewBoost}
            min={0.5} max={15} step={0.5}
            format={(v) => `×${v.toFixed(1)}`}
            onChange={props.onFarViewBoostChange}
          />
        )}
      </Section>

      {/* 2D/3D 與底圖只在右上工具列切換（R3）；晨昏線只在衛星底圖有 */}
      {props.mapStyleId === "satellite" && (
        <Section title="MAP · 地圖">
          <Toggle label="Day/Night" checked={props.showTerminator} onChange={props.onTerminatorChange} />
        </Section>
      )}

      <Section title="VISUAL · 進階視覺" collapsible defaultOpen={false}>
        <Slider
          label="Alt"
          value={props.altExaggeration}
          min={1} max={5} step={0.5}
          format={(v) => `\u00d7${v}`}
          onChange={props.onAltExaggerationChange}
        />
        <Slider
          label="Z"
          value={props.altOffset}
          min={0} max={1000} step={50}
          format={(v) => `+${v}m`}
          onChange={props.onAltOffsetChange}
        />
        <Slider
          label="Opacity"
          value={props.staticOpacity}
          min={0.02} max={0.5} step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={props.onStaticOpacityChange}
        />
        <Slider
          label="Width"
          value={props.trailLineWidth}
          min={0.1} max={6} step={0.1}
          format={(v) => `×${v.toFixed(1)}`}
          onChange={props.onTrailLineWidthChange}
        />
        <Slider
          label="Orb"
          value={props.orbScale}
          min={0.000001} max={0.00001} step={0.000001}
          format={(v) => v.toFixed(6)}
          onChange={props.onOrbScaleChange}
        />
        <Slider
          label="APT"
          value={props.airportOpacity}
          min={0} max={0.3} step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={props.onAirportOpacityChange}
        />
        <Slider
          label="Glow"
          value={props.airportGlow}
          min={0} max={2} step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={props.onAirportGlowChange}
        />
        {props.trackMode === "single" && (
          <>
            <Slider
              label="View"
              value={props.viewshedOpacity}
              min={0} max={2} step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={props.onViewshedOpacityChange}
            />
            <Slider
              label="Edge"
              value={props.viewshedSharpness}
              min={0} max={1} step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={props.onViewshedSharpnessChange}
            />
          </>
        )}
      </Section>
    </>
  );
}

export const REGION_LABELS: Record<string, string> = {
  TW: "台灣 Taiwan",
  JP: "日本 Japan",
  HK: "香港 Hong Kong",
  KR: "韓國 Korea",
  TH: "泰國 Thailand",
  US: "United States",
  UK: "United Kingdom",
  CN: "中國 China",
  world: "World",
};
