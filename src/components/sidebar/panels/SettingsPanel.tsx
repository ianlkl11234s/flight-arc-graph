import { useState } from "react";
import type { DisplayMode, RenderMode, Scope, TrackMode } from "../../../types";
import { StyleSelector } from "../../StyleSelector";
import { FONT } from "../../../styles/tokens";
import type { ThemeColors } from "../theme";
import { SectionHeader, ToggleButtons, SliderRow } from "../primitives";
import type { IconRailSidebarProps } from "../../IconRailSidebar";

export function SettingsPanel(props: IconRailSidebarProps & { theme: ThemeColors }) {
  const { theme } = props;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <>
      <SectionHeader theme={theme}>Scope</SectionHeader>
      {props.airportSet !== null ? (
        <div style={{
          marginBottom: 8,
          padding: "7px 9px",
          border: `1px solid ${theme.ACTIVE_BORDER}`,
          borderRadius: 6,
          background: theme.ACTIVE_BTN_BG,
          color: theme.ACCENT,
          fontSize: 10,
          fontFamily: FONT.ui,
          lineHeight: 1.45,
        }}>
          Current selection · {props.airportSet.length} airport{props.airportSet.length === 1 ? "" : "s"}
        </div>
      ) : (
        <ToggleButtons<Scope>
          options={[
            { value: "airport", label: "This Airport" },
            { value: "region", label: props.region === "all" ? "All Regions" : props.region === "world" ? "All World" : `All ${REGION_LABELS[props.region] ?? props.region}` },
          ]}
          value={props.scope}
          onChange={props.onScopeChange}
          theme={theme}
        />
      )}
      <ToggleButtons<TrackMode>
        options={[
          { value: "stack", label: "Stack All" },
          { value: "single", label: "Track Single" },
        ]}
        value={props.trackMode}
        onChange={(m) => {
          props.onTrackModeChange(m);
          if (m !== "single") props.onFlightSelect(null);
        }}
        theme={theme}
      />
      {props.trackMode === "single" && props.pickableFlights.length > 0 && (
        <select
          value={props.selectedFlightId ?? ""}
          onChange={(e) => props.onFlightSelect(e.target.value || null)}
          style={{
            width: "100%",
            background: theme.SELECT_BG,
            color: theme.ACTIVE_TEXT,
            border: `1px solid ${theme.BORDER}`,
            borderRadius: 4,
            padding: "5px 6px",
            fontSize: 11,
            fontFamily: FONT.ui,
            cursor: "pointer",
            marginBottom: 8,
          }}
        >
          <option value="">Select flight...</option>
          {props.pickableFlights.map((f) => (
            <option key={f.fr24_id} value={f.fr24_id}>
              {f.callsign} ({f.origin_iata}→{f.dest_iata})
            </option>
          ))}
        </select>
      )}

      <SectionHeader theme={theme}>Display</SectionHeader>
      <ToggleButtons<DisplayMode>
        options={[
          { value: "trails", label: "Flight Trails" },
          { value: "status", label: "Live Status" },
        ]}
        value={props.displayMode}
        onChange={props.onDisplayModeChange}
        theme={theme}
      />
      {/* ±12h Window：僅在 Flight Trails 模式下顯示 */}
      {props.displayMode === "trails" && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            fontFamily: FONT.ui,
            color: props.timeWindow ? theme.ACTIVE_TEXT : theme.ACCENT,
            cursor: "pointer",
            marginBottom: 8,
            marginLeft: 4,
          }}
        >
          <input
            type="checkbox"
            checked={props.timeWindow}
            onChange={(e) => props.onTimeWindowChange(e.target.checked)}
            style={{ accentColor: theme.ACCENT_BLUE, width: 14, height: 14, cursor: "pointer" }}
          />
          ±12h Window
        </label>
      )}
      <ToggleButtons<RenderMode>
        options={[
          { value: "3d", label: "3D Altitude" },
          { value: "2d", label: "2D Flat" },
        ]}
        value={props.renderMode}
        onChange={props.onRenderModeChange}
        theme={theme}
      />
      {/* Far View：拉遠時光點按 zoom 補償放大 + 軌跡加亮 */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontFamily: FONT.ui,
          color: props.farView ? theme.ACTIVE_TEXT : theme.ACCENT,
          cursor: "pointer",
          marginBottom: 8,
          marginLeft: 4,
        }}
      >
        <input
          type="checkbox"
          checked={props.farView}
          onChange={(e) => props.onFarViewChange(e.target.checked)}
          style={{ accentColor: theme.ACCENT_BLUE, width: 14, height: 14, cursor: "pointer" }}
        />
        Far View 遠景增強
      </label>
      {props.farView && (
        <SliderRow
          label="Boost"
          value={props.farViewBoost}
          min={0.5} max={15} step={0.5}
          format={(v) => `×${v.toFixed(1)}`}
          onChange={props.onFarViewBoostChange}
          theme={theme}
        />
      )}

      <SectionHeader theme={theme}>Map</SectionHeader>
      <div style={{ marginBottom: 8 }}>
        <StyleSelector
          selected={props.mapStyleId}
          isDarkTheme={props.isDarkTheme}
          onChange={props.onMapStyleChange}
        />
      </div>
      {props.mapStyleId === "satellite" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: FONT.ui, color: theme.DIM, cursor: "pointer", marginBottom: 8 }}>
          <input type="checkbox" checked={props.showTerminator} onChange={(e) => props.onTerminatorChange(e.target.checked)} />
          Day/Night
        </label>
      )}

      <button
        onClick={() => setAdvancedOpen((open) => !open)}
        style={{
          width: "100%",
          marginTop: 4,
          padding: "8px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderRadius: 7,
          border: `1px solid ${theme.BORDER}`,
          background: theme.SELECT_BG,
          color: theme.ACCENT,
          fontSize: 10,
          fontFamily: FONT.ui,
          cursor: "pointer",
        }}
      >
        <span>Advanced visual settings</span>
        <span>{advancedOpen ? "−" : "+"}</span>
      </button>
      {advancedOpen && <>
      <SectionHeader theme={theme}>Visual</SectionHeader>
      <SliderRow
        label="Alt"
        value={props.altExaggeration}
        min={1} max={5} step={0.5}
        format={(v) => `\u00d7${v}`}
        onChange={props.onAltExaggerationChange}
        theme={theme}
      />
      <SliderRow
        label="Z"
        value={props.altOffset}
        min={0} max={1000} step={50}
        format={(v) => `+${v}m`}
        onChange={props.onAltOffsetChange}
        theme={theme}
      />
      <SliderRow
        label="Opacity"
        value={props.staticOpacity}
        min={0.02} max={0.5} step={0.02}
        format={(v) => v.toFixed(2)}
        onChange={props.onStaticOpacityChange}
        theme={theme}
      />
      <SliderRow
        label="Width"
        value={props.trailLineWidth}
        min={0.1} max={6} step={0.1}
        format={(v) => `×${v.toFixed(1)}`}
        onChange={props.onTrailLineWidthChange}
        theme={theme}
      />
      <SliderRow
        label="Orb"
        value={props.orbScale}
        min={0.000001} max={0.00001} step={0.000001}
        format={(v) => v.toFixed(6)}
        onChange={props.onOrbScaleChange}
        theme={theme}
      />
      <SliderRow
        label="APT"
        value={props.airportOpacity}
        min={0} max={0.3} step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={props.onAirportOpacityChange}
        theme={theme}
      />
      <SliderRow
        label="Glow"
        value={props.airportGlow}
        min={0} max={2} step={0.1}
        format={(v) => v.toFixed(1)}
        onChange={props.onAirportGlowChange}
        theme={theme}
      />
      {props.trackMode === "single" && (
        <>
          <SliderRow
            label="View"
            value={props.viewshedOpacity}
            min={0} max={2} step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={props.onViewshedOpacityChange}
            theme={theme}
          />
          <SliderRow
            label="Edge"
            value={props.viewshedSharpness}
            min={0} max={1} step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={props.onViewshedSharpnessChange}
            theme={theme}
          />
        </>
      )}
      </>}
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
