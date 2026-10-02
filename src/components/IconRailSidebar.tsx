import type { DataSource, DisplayMode, Region, Scope, TrackMode, Flight, SavedAirportSet } from "../types";
import type { ColorTheme } from "../types/colorTheme";
import type { AirspaceSettings } from "../types/airspace";
import type { AirportColorMode, AirportAssignment } from "../types/airportColors";
import { DeepAnalysisPanel } from "./DeepAnalysisPanel";
import { FlightStatsPanel } from "./FlightStatsPanel";
import type { AnalysisColorBy } from "../data/analysisColors";
import type { FlightFilters } from "../data/classify";
import type { AirportManifestEntry } from "../data/flightLoader";
import type { AirportMeta } from "../data/airportMeta";
import type { AtlasColorMode } from "../map/atlasGlowLayer";
import { useTheme } from "../styles/ThemeContext";
import { FONT, LAYOUT, RADIUS, SIZE, SPACE, Z } from "../styles/tokens";
import { Chip, Panel, PanelBody, PanelHeader, Section, Segmented } from "../ui";
import { RailIcon, IconPlaneMark, IconGlobeNetwork, IconPinPlus, IconLayers, IconRouteAnalysis, IconCamera, IconRadar } from "./sidebar/primitives";
import type { ScenePreset } from "./sidebar/scenePresets";
import { SettingsPanel } from "./sidebar/panels/SettingsPanel";
import { SetsPanel } from "./sidebar/panels/SetsPanel";
import { ColorThemePanel } from "./sidebar/panels/ColorThemePanel";
import { SummaryPanel } from "./sidebar/panels/SummaryPanel";
import { AtlasPanel } from "./sidebar/panels/AtlasPanel";
import { AirspacePanel } from "./sidebar/panels/AirspacePanel";
export { SCENE_PRESETS, type ScenePreset } from "./sidebar/scenePresets";

/* ── Types ───────────────────────────────────────────────── */

export type PanelId = "settings" | "sets" | "colors" | "airspace" | "summary" | "analysis" | "stats" | "atlas";
type WorkspaceId = "explore" | "selection" | "view" | "airspace" | "analyze";

const WORKSPACE_DEFAULT_PANEL: Record<WorkspaceId, PanelId> = {
  explore: "atlas",
  selection: "sets",
  view: "settings",
  airspace: "airspace",
  analyze: "summary",
};

function getWorkspace(panel: PanelId | null): WorkspaceId | null {
  if (panel === "atlas") return "explore";
  if (panel === "sets") return "selection";
  if (panel === "settings" || panel === "colors") return "view";
  if (panel === "airspace") return "airspace";
  if (panel === "summary" || panel === "analysis" || panel === "stats") return "analyze";
  return null;
}

export interface IconRailSidebarProps {
  /** 目前開著的面板（null = 全部收起；進站預設收起，Q6） */
  activePanel: PanelId | null;
  onActivePanelChange: (panel: PanelId | null) => void;
  // Theme
  // Settings panel controls
  displayMode: DisplayMode;
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
  onFarViewChange: (v: boolean) => void;
  onFarViewBoostChange: (v: number) => void;
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
  /** 開啟機場：單選並飛過去（R11；機場面板點擊、搜尋結果） */
  onAirportChange: (icao: string) => void;
  onLocationJump: (icao: string) => void;
  onSceneSelect: (scene: ScenePreset) => void;
  // 日期只在時間軸選（R12）；這裡只用來顯示「N 座無此日期」
  selectedDate: string | null;
  // Flights data (for summary panel — already filtered by time window)
  summaryFlights: Flight[];
  /** 時間範圍天數（1d / 3d / 7d）影響顯示內容 */
  rangeDays: number;
  // 統計（分析 › 統計分頁，R2：不再是右側浮層）
  /** 全部航班（ALL REGION 統計，不受篩選影響） */
  statsAllFlights: Flight[];
  onStatsSelectAirport: (icao: string) => void;
  onStatsSelectFlight: (id: string) => void;
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
  // 探索面板頂部的區域 chip（Q3，取代舊頂部 Region 按鈕列）
  regions: Array<{ id: Region; label: string }>;
  onRegionSelect: (r: Region) => void;
  // 空域快照 workspace（Q4）：資料來源切換（航線軌跡／空域快照）
  dataSource: DataSource;
  hasFused: boolean;
  onDataSourceChange: (s: DataSource) => void;
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
  const { activePanel, onActivePanelChange: setActivePanel } = props;
  const { tokens } = useTheme();
  const activeWorkspace = getWorkspace(activePanel);
  const activeSelection = props.airportSet ?? [props.selectedAirport];
  const selectedDate = props.selectedDate;
  const selectedAvailable = selectedDate
    ? activeSelection.filter((icao) => Boolean(props.airportCatalog[icao]?.dates?.[selectedDate])).length
    : 0;
  const workspaceTabs: Array<{ id: PanelId; label: string }> = activeWorkspace === "explore"
    ? [{ id: "atlas", label: "地圖總覽" }]
    : activeWorkspace === "selection"
      ? [{ id: "sets", label: "機場" }]
      : activeWorkspace === "view"
        ? [{ id: "settings", label: "顯示" }, { id: "colors", label: "色彩" }]
        : activeWorkspace === "airspace"
          ? []
          : [{ id: "summary", label: "總覽" }, { id: "analysis", label: "篩選" }, { id: "stats", label: "統計" }];
  const workspaceTitle = activeWorkspace === "explore"
    ? "探索機場"
    : activeWorkspace === "selection"
      ? props.setName ?? (props.airportSet ? "自訂機場組合" : props.selectedAirport)
      : activeWorkspace === "view"
        ? "呈現"
        : activeWorkspace === "airspace"
          ? "空域快照"
          : "航班分析";

  const toggleWorkspace = (workspace: WorkspaceId) => {
    setActivePanel(getWorkspace(activePanel) === workspace ? null : WORKSPACE_DEFAULT_PANEL[workspace]);
  };

  const workspaceEyebrow = activeWorkspace === "explore"
    ? "EXPLORE · 探索"
    : activeWorkspace === "selection"
      ? "SELECTION · 機場"
      : activeWorkspace === "view"
        ? "VIEW · 呈現"
        : activeWorkspace === "airspace"
          ? "AIRSPACE · 空域"
          : "ANALYZE · 分析";

  return (
    <>
      <style>{FADE_KEYFRAMES}{ATLAS_BADGE_KEYFRAMES}</style>

      {/* Icon Rail (top icons) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: LAYOUT.railWidth,
          zIndex: Z.panel,
          background: tokens.rail,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 36,
          paddingBottom: SPACE.s8,
          borderRight: `1px solid ${tokens.border}`,
          borderBottom: `1px solid ${tokens.border}`,
          borderRadius: `0 0 ${RADIUS.base}px 0`,
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
            color: tokens.fg1,
          }}
        >
          <IconPlaneMark />
        </div>

        {/* Separator */}
        <div
          style={{
            width: 28,
            height: 1,
            background: tokens.border,
            margin: `${SPACE.s8}px 0`,
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
        >
          <IconGlobeNetwork />
        </RailIcon>

        <RailIcon
          active={activeWorkspace === "selection"}
          onClick={() => toggleWorkspace("selection")}
          title="選擇機場"
        >
          <IconPinPlus />
        </RailIcon>

        <RailIcon
          active={activeWorkspace === "view"}
          onClick={() => toggleWorkspace("view")}
          title="顯示與色彩"
        >
          <IconLayers />
        </RailIcon>

        <RailIcon
          active={activeWorkspace === "airspace"}
          onClick={() => toggleWorkspace("airspace")}
          title="空域快照"
        >
          <IconRadar />
        </RailIcon>

        <RailIcon
          active={activeWorkspace === "analyze"}
          onClick={() => toggleWorkspace("analyze")}
          title="分析航班"
        >
          <IconRouteAnalysis />
        </RailIcon>

        <RailIcon
          active={false}
          onClick={props.onCaptureClick}
          title="擷取與錄製"
        >
          <IconCamera />
        </RailIcon>
      </div>

      {/* Floating Panel */}
      {activePanel !== null && (
        <Panel
          ariaLabel={workspaceTitle}
          width={activePanel === "stats" ? LAYOUT.panelWidthWide : LAYOUT.panelWidth}
          maxHeight="70vh"
          style={{ animation: "iconRailFadeIn 0.25s ease-out" }}
        >
          <PanelHeader
            eyebrow={workspaceEyebrow}
            title={workspaceTitle}
            onClose={() => setActivePanel(null)}
          />
          <div style={{ padding: `${SPACE.s8}px ${SPACE.s12}px 0`, display: "flex", flexDirection: "column", gap: SPACE.s8, flex: "none" }}>
            {activeWorkspace === "explore" && (
              <div role="group" aria-label="區域" style={{ display: "flex", flexWrap: "wrap", gap: SPACE.s4 }}>
                {props.regions.map((r) => (
                  <Chip key={r.id} label={r.label} selected={props.region === r.id} onClick={() => props.onRegionSelect(r.id)} />
                ))}
              </div>
            )}
            {(activeWorkspace === "selection" || activeWorkspace === "explore") && (
              <div style={{ fontSize: SIZE.minor, color: tokens.fg3, fontFamily: FONT.data, lineHeight: 1.45 }}>
                {activeSelection.length} 座機場
                {selectedDate ? ` · ${selectedDate}` : ""}
                {selectedDate && selectedAvailable < activeSelection.length
                  ? ` · ${activeSelection.length - selectedAvailable} 座無此日期`
                  : ""}
              </div>
            )}
            {workspaceTabs.length > 1 && <Segmented<PanelId>
              fullWidth
              ariaLabel="面板分頁"
              options={workspaceTabs.map((tab) => ({ value: tab.id, label: tab.label }))}
              value={activePanel}
              onChange={setActivePanel}
            />}
          </div>
          <PanelBody style={activePanel === "stats" ? { padding: 0, gap: 0 } : undefined}>
          {activePanel === "settings" && <SettingsPanel {...props} />}
          {activePanel === "sets" && (
            <SetsPanel
              airports={props.airports}
              airportCatalog={props.airportCatalog}
              airportMeta={props.airportMeta}
              region={props.region}
              selectedAirport={props.selectedAirport}
              airportSet={activeSelection}
              setMode={props.airportSet !== null}
              setName={props.setName}
              savedSets={props.savedSets}
              onApplySet={props.onApplySet}
              onOpenAirport={props.onAirportChange}
              onToggleAirport={props.onToggleAirportInSet}
              onClearSet={props.onClearSet}
              onExitSetMode={props.onExitSetMode}
              onSceneSelect={props.onSceneSelect}
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
            />
          )}
          {activePanel === "airspace" && (
            <Section title="SOURCE · 資料來源">
              <Segmented<DataSource>
                fullWidth
                ariaLabel="資料來源"
                options={[
                  { value: "api", label: "航線軌跡" },
                  { value: "fused", label: "空域快照", disabled: !props.hasFused },
                ]}
                value={props.dataSource}
                onChange={props.onDataSourceChange}
              />
              <div style={{ fontSize: SIZE.minor, color: tokens.fg3, lineHeight: 1.5 }}>
                {props.dataSource === "fused"
                  ? "切回航線軌跡：回到單一機場範圍、天數重設為 1 天、靜態軌跡透明度回到預設。"
                  : "切到空域快照：改看整個區域某天的空中快照，天數重設為 1 天、靜態軌跡調淡，並拉遠到區域視角。"}
                {!props.hasFused && " 目前沒有空域快照資料。"}
              </div>
            </Section>
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
            />
          )}
          {activePanel === "stats" && (
            <FlightStatsPanel
              allFlights={props.statsAllFlights}
              filteredFlights={props.summaryFlights}
              selectedAirport={props.selectedAirport}
              onSelectAirport={props.onStatsSelectAirport}
              onSelectFlight={props.onStatsSelectFlight}
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
          </PanelBody>
        </Panel>
      )}
    </>
  );
}
