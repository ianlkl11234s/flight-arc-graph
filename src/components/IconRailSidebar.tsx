import { useState, type CSSProperties } from "react";
import type { DisplayMode, Region, RenderMode, Scope, TrackMode, Flight, SavedAirportSet } from "../types";
import type { ColorTheme } from "../types/colorTheme";
import type { AirspaceSettings } from "../types/airspace";
import type { AirportColorMode, AirportAssignment } from "../types/airportColors";
import { DeepAnalysisPanel } from "./DeepAnalysisPanel";
import type { AnalysisColorBy } from "../data/analysisColors";
import type { FlightFilters } from "../data/classify";
import type { AirportManifestEntry } from "../data/flightLoader";
import type { AirportMeta } from "../data/airportMeta";
import type { AtlasColorMode } from "../map/atlasGlowLayer";
import { FONT } from "../styles/tokens";
import { getThemeColors, RAIL_WIDTH, PANEL_WIDTH } from "./sidebar/theme";
import { RailIcon, IconPlaneMark, IconGlobeNetwork, IconPinPlus, IconLayers, IconRouteAnalysis, IconCamera } from "./sidebar/primitives";
import type { ScenePreset } from "./sidebar/scenePresets";
import { SettingsPanel } from "./sidebar/panels/SettingsPanel";
import { SetsPanel } from "./sidebar/panels/SetsPanel";
import { CalendarPanel } from "./sidebar/panels/CalendarPanel";
import { ColorThemePanel } from "./sidebar/panels/ColorThemePanel";
import { SummaryPanel } from "./sidebar/panels/SummaryPanel";
import { AtlasPanel } from "./sidebar/panels/AtlasPanel";
import { AirspacePanel } from "./sidebar/panels/AirspacePanel";
export { SCENE_PRESETS, type ScenePreset } from "./sidebar/scenePresets";

/* ── Types ───────────────────────────────────────────────── */

type PanelId = "settings" | "sets" | "calendar" | "colors" | "airspace" | "summary" | "analysis" | "atlas";
type WorkspaceId = "explore" | "selection" | "view" | "analyze";

const WORKSPACE_DEFAULT_PANEL: Record<WorkspaceId, PanelId> = {
  explore: "atlas",
  selection: "sets",
  view: "settings",
  analyze: "summary",
};

function getWorkspace(panel: PanelId | null): WorkspaceId | null {
  if (panel === "atlas") return "explore";
  if (panel === "sets" || panel === "calendar") return "selection";
  if (panel === "settings" || panel === "colors" || panel === "airspace") return "view";
  if (panel === "summary" || panel === "analysis") return "analyze";
  return null;
}

export interface IconRailSidebarProps {
  // Theme
  isDarkTheme: boolean;
  // Settings panel controls
  displayMode: DisplayMode;
  renderMode: RenderMode;
  farView: boolean;
  farViewBoost: number;
  mapStyleId: string;
  // Slider values
  altExaggeration: number;
  altOffset: number;
  staticOpacity: number;
  orbScale: number;
  airportOpacity: number;
  airportGlow: number;
  trailLineWidth: number;
  // Callbacks
  onDisplayModeChange: (mode: DisplayMode) => void;
  onRenderModeChange: (mode: RenderMode) => void;
  onFarViewChange: (v: boolean) => void;
  onFarViewBoostChange: (v: number) => void;
  onMapStyleChange: (id: string) => void;
  onAltExaggerationChange: (v: number) => void;
  onAltOffsetChange: (v: number) => void;
  onStaticOpacityChange: (v: number) => void;
  onOrbScaleChange: (v: number) => void;
  onAirportOpacityChange: (v: number) => void;
  onAirportGlowChange: (v: number) => void;
  onTrailLineWidthChange: (v: number) => void;
  viewshedOpacity: number;
  onViewshedOpacityChange: (v: number) => void;
  viewshedSharpness: number;
  onViewshedSharpnessChange: (v: number) => void;
  // Scope & Track mode
  scope: Scope;
  region: Region;
  trackMode: TrackMode;
  timeWindow: boolean;
  pickableFlights: Flight[];
  selectedFlightId: string | null;
  onScopeChange: (scope: Scope) => void;
  onTrackModeChange: (mode: TrackMode) => void;
  onTimeWindowChange: (v: boolean) => void;
  onFlightSelect: (id: string | null) => void;
  // Locations
  airports: string[];
  /** manifest 機場目錄（isCore / dates / fullDates / flights），key = ICAO */
  airportCatalog: Record<string, AirportManifestEntry>;
  /** 機場 metadata（座標/名稱/國家），含無 preset 的長尾機場，key = ICAO */
  airportMeta: Record<string, AirportMeta>;
  selectedAirport: string;
  onAirportChange: (icao: string) => void;
  onLocationJump: (icao: string) => void;
  onSceneSelect: (scene: ScenePreset) => void;
  // Calendar
  availableDates: string[];
  /** 完整資料的日期（實心標記） */
  fullDates: string[];
  /** 各日期的軌跡筆數（單一機場模式才有，tooltip 顯示用） */
  dateCounts?: Record<string, number>;
  selectedDate: string | null;
  onDateSelect: (date: string | null) => void;
  // Flights data (for summary panel — already filtered by time window)
  summaryFlights: Flight[];
  /** 時間範圍天數（1d / 3d / 7d）影響顯示內容 */
  rangeDays: number;
  // Stats
  onStatsClick: () => void;
  onCaptureClick: () => void;
  // Info
  // Day/Night
  showTerminator: boolean;
  onTerminatorChange: (v: boolean) => void;
  // Color Theme
  colorThemeKey: string;
  onColorThemeChange: (key: string) => void;
  colorThemeOverride: ColorTheme | null;
  onColorThemeOverride: (theme: ColorTheme) => void;
  // Airspace
  airspaceSettings: AirspaceSettings;
  onAirspaceSettingsChange: (s: AirspaceSettings) => void;
  // Per-airport color
  colorBy: AirportColorMode;
  onColorByChange: (m: AirportColorMode) => void;
  airportAssignment: AirportAssignment | null;
  airportColorOverrides: Record<string, string>;
  onAirportColorOverride: (icao: string, hex: string | null) => void;
  onAirportColorReset: () => void;
  compareModeActive: boolean;
  // 多機場組合（Sets 模式）
  airportSet: string[] | null;
  setName: string | null;
  savedSets: SavedAirportSet[];
  onApplySet: (set: SavedAirportSet) => void;
  onToggleAirportInSet: (icao: string) => void;
  onClearSet: () => void;
  onExitSetMode: () => void;
  // Deep Analysis (🔬)
  analysisFilteredFlights: Flight[];
  analysisPreFilterFlights: Flight[];
  analysisColorBy: AnalysisColorBy;
  onAnalysisColorByChange: (v: AnalysisColorBy) => void;
  flightFilters: FlightFilters;
  onFlightFiltersChange: (f: FlightFilters) => void;
  scaleByAircraftSize: boolean;
  onScaleByAircraftSizeChange: (v: boolean) => void;
  // Atlas 機場總覽（🗺️）
  atlasVisible: boolean;
  onAtlasVisibleChange: (v: boolean) => void;
  /** 使用者是否曾啟用過機場點（true 時待按小紅點永久消失） */
  atlasEverEnabled: boolean;
  atlasGlowVisible: boolean;
  onAtlasGlowVisibleChange: (v: boolean) => void;
  atlasColorMode: AtlasColorMode;
  onAtlasColorModeChange: (m: AtlasColorMode) => void;
  atlasGlowSize: number;
  onAtlasGlowSizeChange: (v: number) => void;
  // 展開「探索地圖總覽」workspace 時觸發（用來飛相機到俯瞰視角）
  onExploreOpen?: () => void;
}

/* ── Helpers ─────────────────────────────────────────────── */

const FADE_KEYFRAMES = `
@keyframes iconRailFadeIn {
  from { opacity: 0; transform: translateX(-12px); }
  to   { opacity: 1; transform: translateX(0); }
}
`;

// 機場點按鈕「待按」小紅點的呼吸動畫（動畫名稱獨立，避免撞名 App.tsx/CinemaBar 的 pulse）
const ATLAS_BADGE_KEYFRAMES = `
@keyframes atlasBadgePulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.55; transform: scale(1.25); }
}
`;

/* ── Main Component ──────────────────────────────────────── */

export function IconRailSidebar(props: IconRailSidebarProps) {
  const [activePanel, setActivePanel] = useState<PanelId | null>("sets");
  const theme = getThemeColors(props.isDarkTheme);
  const activeWorkspace = getWorkspace(activePanel);
  const activeSelection = props.airportSet ?? [props.selectedAirport];
  const selectedDate = props.selectedDate;
  const selectedAvailable = selectedDate
    ? activeSelection.filter((icao) => Boolean(props.airportCatalog[icao]?.dates?.[selectedDate])).length
    : 0;
  const workspaceTabs: Array<{ id: PanelId | "stats"; label: string }> = activeWorkspace === "explore"
    ? [{ id: "atlas", label: "地圖總覽" }]
    : activeWorkspace === "selection"
      ? [{ id: "sets", label: "機場" }, { id: "calendar", label: "日期" }]
      : activeWorkspace === "view"
        ? [{ id: "settings", label: "顯示" }, { id: "colors", label: "色彩" }, { id: "airspace", label: "空域" }]
        : [{ id: "summary", label: "總覽" }, { id: "analysis", label: "篩選" }, { id: "stats", label: "統計" }];
  const workspaceTitle = activeWorkspace === "explore"
    ? "探索機場"
    : activeWorkspace === "selection"
      ? props.setName ?? (props.airportSet ? "自訂機場組合" : props.selectedAirport)
      : activeWorkspace === "view"
        ? "呈現與空域"
        : "航班分析";

  const toggleWorkspace = (workspace: WorkspaceId) => {
    setActivePanel((prev) => (
      getWorkspace(prev) === workspace ? null : WORKSPACE_DEFAULT_PANEL[workspace]
    ));
  };

  const panelStyle: CSSProperties = {
    position: "absolute",
    left: RAIL_WIDTH + 8,
    top: 116,
    zIndex: 20,
    width: PANEL_WIDTH,
    maxHeight: "70vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    background: theme.BG_PANEL,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: `1px solid ${theme.BORDER}`,
    borderRadius: 12,
    padding: "12px 14px",
    color: theme.ACCENT,
    animation: "iconRailFadeIn 0.25s ease-out",
  };

  return (
    <>
      <style>{FADE_KEYFRAMES}{ATLAS_BADGE_KEYFRAMES}</style>

      {/* Icon Rail (top icons) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: RAIL_WIDTH,
          zIndex: 20,
          background: theme.BG_RAIL,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 36,
          paddingBottom: 8,
          borderRight: `1px solid ${theme.BORDER}`,
          borderBottom: `1px solid ${theme.BORDER}`,
          borderRadius: "0 0 8px 0",
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.ACCENT_BLUE,
          }}
        >
          <IconPlaneMark />
        </div>

        {/* Separator */}
        <div
          style={{
            width: 28,
            height: 1,
            background: theme.BORDER,
            margin: "8px 0",
          }}
        />

        <RailIcon
          active={activeWorkspace === "explore"}
          onClick={() => {
            const opening = activeWorkspace !== "explore";
            toggleWorkspace("explore");
            if (opening) props.onExploreOpen?.();
          }}
          title="探索地圖總覽"
          theme={theme}
        >
          <IconGlobeNetwork />
        </RailIcon>

        <RailIcon
          active={activeWorkspace === "selection"}
          onClick={() => toggleWorkspace("selection")}
          title="選擇機場與日期"
          theme={theme}
        >
          <IconPinPlus />
        </RailIcon>

        <RailIcon
          active={activeWorkspace === "view"}
          onClick={() => toggleWorkspace("view")}
          title="顯示、色彩與空域"
          theme={theme}
        >
          <IconLayers />
        </RailIcon>

        <RailIcon
          active={activeWorkspace === "analyze"}
          onClick={() => toggleWorkspace("analyze")}
          title="分析航班"
          theme={theme}
        >
          <IconRouteAnalysis />
        </RailIcon>

        <RailIcon
          active={false}
          onClick={props.onCaptureClick}
          title="擷取與錄製"
          theme={theme}
        >
          <IconCamera />
        </RailIcon>
      </div>

      {/* Floating Panel */}
      {activePanel !== null && (
        <div style={panelStyle}>
          {/* Close button */}
          <button
            onClick={() => setActivePanel(null)}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: theme.CLOSE_BG,
              border: `1px solid ${theme.CLOSE_BORDER}`,
              color: theme.DIM,
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1,
            }}
          >
            ✕
          </button>
          <div style={{ paddingRight: 26, marginBottom: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 9, letterSpacing: 1.6, color: theme.ACCENT_BLUE, fontFamily: FONT.ui }}>
              FLIGHT ARC / {activeWorkspace?.toUpperCase()}
            </div>
            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600, color: theme.ACTIVE_TEXT }}>
              {workspaceTitle}
            </div>
            {(activeWorkspace === "selection" || activeWorkspace === "explore") && (
              <div style={{ marginTop: 5, fontSize: 10, color: theme.DIM, fontFamily: FONT.ui, lineHeight: 1.45 }}>
                {activeSelection.length} 座機場
                {selectedDate ? ` · ${selectedDate}` : ""}
                {selectedDate && selectedAvailable < activeSelection.length
                  ? ` · ${activeSelection.length - selectedAvailable} 座無此日期`
                  : ""}
              </div>
            )}
            <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
              {workspaceTabs.map((tab) => {
                const active = tab.id === activePanel;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.id === "stats") props.onStatsClick();
                      else setActivePanel(tab.id);
                    }}
                    style={{
                      padding: "5px 9px",
                      borderRadius: 6,
                      border: `1px solid ${active ? theme.ACTIVE_BORDER : theme.BORDER}`,
                      background: active ? theme.ACTIVE_BTN_BG : "transparent",
                      color: active ? theme.ACTIVE_TEXT : theme.DIM,
                      cursor: "pointer",
                      fontSize: 10,
                      fontFamily: FONT.ui,
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ minHeight: 0, overflowY: "auto", flex: "1 1 auto" }}>
          {activePanel === "settings" && <SettingsPanel {...props} />}
          {activePanel === "sets" && (
            <SetsPanel
              airports={props.airports}
              airportCatalog={props.airportCatalog}
              airportMeta={props.airportMeta}
              region={props.region}
              airportSet={activeSelection}
              setMode={props.airportSet !== null}
              setName={props.setName}
              savedSets={props.savedSets}
              onApplySet={props.onApplySet}
              onToggleAirport={props.onToggleAirportInSet}
              onClearSet={props.onClearSet}
              onExitSetMode={props.onExitSetMode}
              onSceneSelect={props.onSceneSelect}
            />
          )}
          {activePanel === "calendar" && (
            <CalendarPanel
              availableDates={props.availableDates}
              fullDates={props.fullDates}
              dateCounts={props.dateCounts}
              selectedDate={props.selectedDate}
              onDateSelect={props.onDateSelect}
            />
          )}
          {activePanel === "colors" && (
            <ColorThemePanel
              colorThemeKey={props.colorThemeKey}
              onColorThemeChange={props.onColorThemeChange}
              colorThemeOverride={props.colorThemeOverride}
              onColorThemeOverride={props.onColorThemeOverride}
              colorBy={props.colorBy}
              onColorByChange={props.onColorByChange}
              airportAssignment={props.airportAssignment}
              airportColorOverrides={props.airportColorOverrides}
              onAirportColorOverride={props.onAirportColorOverride}
              onAirportColorReset={props.onAirportColorReset}
              compareModeActive={props.compareModeActive}
              theme={theme}
            />
          )}
          {activePanel === "airspace" && (
            <AirspacePanel
              settings={props.airspaceSettings}
              onChange={props.onAirspaceSettingsChange}
            />
          )}
          {activePanel === "summary" && (
            <SummaryPanel
              flights={props.summaryFlights}
              selectedAirport={props.selectedAirport}
              scope={props.scope}
              region={props.region}
              rangeDays={props.rangeDays}
            />
          )}
          {activePanel === "analysis" && (
            <DeepAnalysisPanel
              filteredFlights={props.analysisFilteredFlights}
              preFilterFlights={props.analysisPreFilterFlights}
              colorBy={props.analysisColorBy}
              onColorByChange={props.onAnalysisColorByChange}
              filters={props.flightFilters}
              onFiltersChange={props.onFlightFiltersChange}
              scaleByAircraftSize={props.scaleByAircraftSize}
              onScaleByAircraftSizeChange={props.onScaleByAircraftSizeChange}
              isDarkTheme={props.isDarkTheme}
              theme={theme}
            />
          )}
          {activePanel === "atlas" && (
            <AtlasPanel
              atlasVisible={props.atlasVisible}
              onAtlasVisibleChange={props.onAtlasVisibleChange}
              atlasEverEnabled={props.atlasEverEnabled}
              atlasGlowVisible={props.atlasGlowVisible}
              onAtlasGlowVisibleChange={props.onAtlasGlowVisibleChange}
              atlasColorMode={props.atlasColorMode}
              onAtlasColorModeChange={props.onAtlasColorModeChange}
              atlasGlowSize={props.atlasGlowSize}
              onAtlasGlowSizeChange={props.onAtlasGlowSizeChange}
              airportCatalog={props.airportCatalog}
            />
          )}
          </div>
        </div>
      )}
    </>
  );
}
