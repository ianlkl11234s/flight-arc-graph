import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { type Map as MapboxMap } from "mapbox-gl";
import type { DepArrFilter, Scope, TrackMode, RenderMode, DisplayMode, DataSource, Region, TrailDisplay, SavedAirportSet } from "./types";
import { computeFitBoundsForSet } from "./map/fitBoundsForSet";
import { BUILTIN_SETS } from "./map/savedSets";
import type { FlightScene } from "./three/FlightScene";
import { MapView, ATLAS_LAYER } from "./map/MapView";
import { useFlightData } from "./hooks/useFlightData";
import { useTimeline } from "./hooks/useTimeline";
import { useIsMobile } from "./hooks/useIsMobile";
import { CAMERA_PRESETS, getPresetByIcao, getAirportInfo, cameraForAirport } from "./map/cameraPresets";
import { loadAirportMeta, type AirportMeta } from "./data/airportMeta";
import { createFlightLayer, getGlStats, resetGlStats } from "./map/customLayer";
import { notifyActivity } from "./map/repaintScheduler";
import { createAtlasGlowLayer, ATLAS_GLOW_LAYER_ID, type AtlasColorMode } from "./map/atlasGlowLayer";
import { createAirspaceLayer } from "./map/airspaceAurora";
import { addMedianLineLayer, removeMedianLineLayer, setMedianLineVisibility, setMedianLineTheme } from "./map/medianLine";
import { defaultAirspaceSettings, type AirspaceSettings } from "./types/airspace";
import { getCachedAirspace, type AirspaceFeature } from "./data/airspaceLoader";
import { pickAirspace } from "./map/airspacePicker";
import { AirspaceInfoCard } from "./components/AirspaceInfoCard";
import { FlightInfoCard } from "./components/FlightInfoCard";
import { filterByAirport } from "./data/flightLoader";
import type { LodLevel } from "./data/flightLoader";
import { timeToUnixTW } from "./utils/dateUtils";
import { buildSearch, decodeUrlState, encodeUrlState, type UrlState } from "./data/urlState";
import { MobileHeader, MOBILE_HEADER_HEIGHT } from "./components/MobileHeader";
import { FlightPicker } from "./components/FlightPicker";
import { Timeline, type HourBin } from "./components/Timeline";
import { MAP_STYLES, getStyleUrl } from "./components/StyleSelector";
import { MobileBottomSheet, SheetNote } from "./components/MobileBottomSheet";
import { Toolbar } from "./components/Toolbar";
import { Dock, DockItem } from "./components/Dock";
import { LoadingStatus } from "./components/LoadingStatus";
import { AIRCRAFT_CATEGORIES, type AircraftCategory, type AircraftFilterKey } from "./data/aircraftCategories";
import { type FlightFilters, EMPTY_FILTERS, applyFilters } from "./data/classify";
import { IconRailSidebar, type ScenePreset, type PanelId } from "./components/IconRailSidebar";
import { InfoModal } from "./components/InfoModal";
import { useCinemaCamera } from "./hooks/useCinemaCamera";
import { useCanvasRecorder } from "./hooks/useCanvasRecorder";
import { computeBearing, getViewshedArcPoints, getViewshedRings } from "./map/viewshedOverlay";
import { CinemaBar } from "./components/CinemaBar";
import { RecordingGuide } from "./components/RecordingGuide";
import { COLOR_THEMES, DEFAULT_THEME_KEY } from "./types/colorTheme";
import { ATLAS_POPUP as AP, ATLAS_STATUS_FALLBACK_COLOR, ATLAS_STATUS_META, CAPTURE_OVERLAY as CAP, COMPARE_COLORS, COMPASS } from "./types/dataColors";
import { assignAirportColors, type AirportColorMode, type AirportAssignment } from "./types/airportColors";
import { computeAnalysisColorMap, type AnalysisColorBy } from "./data/analysisColors";
import { computeDepArrColoring, type TrajColorBy } from "./data/depArrColors";
import { getAircraftInfo, type AircraftCategory as AcCat } from "./data/aircraftDatabase";
import { setMapTrailColors } from "./map/staticTrails";
import { initTerminatorLayer, removeTerminatorLayer } from "./map/terminatorOverlay";
import { setFrozenAnimTime } from "./three/animClock";
import { ThemeProvider, useTheme } from "./styles/ThemeContext";
import { FONT, LAYOUT, SIZE, SPACE, Z } from "./styles/tokens";
import { IconClose } from "./ui/icons";
import { Button, Caption, Segmented, SelectionRing, Select, Slider, type CaptionMetaItem } from "./ui";
import { escLayerToClose, isEditableTarget } from "./ui/escStack";
import { ALL_OVERLAYS_CLOSED, overlaysOpen, overlaysToClose, type OverlayKey, type OverlayState } from "./ui/overlayMutex";

// ── Atlas 機場點：點擊 popup ──
interface AtlasProps {
  icao: string;
  iata: string;
  name: string;
  country: string;
  continent: string;
  rank: number | null;
  status: string;
  dailyProxy: number;
  capturedFlights: number | null;
  estDaily: number | null;
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}
function buildAtlasPopupHtml(p: AtlasProps): string {
  const st = ATLAS_STATUS_META[p.status] ?? { label: p.status, color: ATLAS_STATUS_FALLBACK_COLOR };
  const rankLine = p.rank
    ? `Top-1000 排名 #${p.rank}`
    : "非前 1000（被動觸及）";
  const capt =
    p.capturedFlights != null ? `${p.capturedFlights.toLocaleString()} 條` : "—";
  const est = p.estDaily != null ? `${p.estDaily} 班/日（估）` : "—";
  return `<div style="font-family:system-ui,-apple-system,sans-serif;min-width:180px;color:${AP.ink}">
    <div style="font-weight:700;font-size:${SIZE.title}px;margin-bottom:2px">${escapeHtml(p.name)}</div>
    <div style="font-size:${SIZE.body}px;color:${AP.dim};margin-bottom:6px">${p.icao}${p.iata ? " / " + p.iata : ""}${p.country ? " · " + p.country : ""}${p.continent ? " " + p.continent : ""}</div>
    <div style="display:inline-flex;align-items:center;gap:5px;font-size:${SIZE.sub}px;font-weight:600;margin-bottom:6px">
      <span style="width:9px;height:9px;border-radius:50%;background:${st.color};display:inline-block"></span>${st.label}
    </div>
    <div style="font-size:${SIZE.sub}px;color:${AP.body};line-height:1.6">${rankLine}<br/>已抓軌跡：${capt}<br/>單日流量：${est}</div>
    ${p.status !== "planned" ? `<div style="--pa-line:${AP.btnLine};--pa-soft:${AP.btnSoft};--pa-ink:${AP.btnInk};display:flex;gap:6px;margin-top:8px">
      <button type="button" data-atlas-open="${escapeHtml(p.icao)}" style="flex:1;padding:6px 8px;border:1px solid var(--pa-ink);border-radius:2px;background:var(--pa-ink);color:var(--pa-soft);font:600 ${SIZE.body}px monospace;cursor:pointer">開啟機場</button>
      <button type="button" data-atlas-add="${escapeHtml(p.icao)}" style="flex:1;padding:6px 8px;border:1px solid var(--pa-line);border-radius:2px;background:var(--pa-soft);color:var(--pa-ink);font:600 ${SIZE.body}px monospace;cursor:pointer">加入組合</button>
    </div>` : ""}
  </div>`;
}

/** 左上字標 FLIGHT ARC + 相機 HUD（座標、zoom、俯角、方位）。 */
function Brand({ cameraInfo }: { cameraInfo: { lng: number; lat: number; zoom: number; pitch: number; bearing: number } }) {
  const { tokens } = useTheme();
  const lat = `${Math.abs(cameraInfo.lat).toFixed(4)}°${cameraInfo.lat >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(cameraInfo.lng).toFixed(4)}°${cameraInfo.lng >= 0 ? "E" : "W"}`;
  return (
    <div
      style={{
        position: "absolute",
        left: LAYOUT.panelLeft + SPACE.s8,
        top: SPACE.s16,
        zIndex: Z.mapOverlay,
        display: "flex",
        alignItems: "baseline",
        gap: SPACE.s12 + SPACE.s2,
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontFamily: FONT.data, fontSize: SIZE.large, fontWeight: 700, letterSpacing: ".18em", lineHeight: 1.2, color: tokens.fg1 }}>
        FLIGHT ARC
      </span>
      <span
        title={cameraInfo.zoom < 3 ? "Drag globe · Scroll to zoom" : "Right-drag to rotate · Scroll to zoom"}
        style={{
          fontFamily: FONT.data,
          fontSize: SIZE.minor,
          letterSpacing: ".04em",
          color: tokens.fg3,
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "auto",
        }}
      >
        {lat} {lng} · z{cameraInfo.zoom.toFixed(1)} · 俯角 {cameraInfo.pitch}° · 方位 {cameraInfo.bearing}°
      </span>
    </div>
  );
}

function OrientationOrb({
  bearing,
  pitch,
  isDarkTheme,
  onReset,
}: {
  bearing: number;
  pitch: number;
  isDarkTheme: boolean;
  onReset: () => void;
}) {
  const axisScale = Math.max(0.38, Math.cos((pitch * Math.PI) / 180));
  const bearingRad = (bearing * Math.PI) / 180;
  const axisLength = 15 * axisScale;
  const labelLength = axisLength + 4;
  const northX = 22 - axisLength * Math.sin(bearingRad);
  const northY = 22 - axisLength * Math.cos(bearingRad);
  const southX = 22 + axisLength * Math.sin(bearingRad);
  const southY = 22 + axisLength * Math.cos(bearingRad);
  const northLabelX = 22 - labelLength * Math.sin(bearingRad);
  const northLabelY = 22 - labelLength * Math.cos(bearingRad) + 1.8;
  const southLabelX = 22 + labelLength * Math.sin(bearingRad);
  const southLabelY = 22 + labelLength * Math.cos(bearingRad) + 1.8;
  const isUpright = Math.abs(bearing) < 1 && Math.abs(pitch) < 1;
  const C = isDarkTheme ? COMPASS.dark : COMPASS.light;
  const { stroke, dim, text } = C;

  return (
    <button
      type="button"
      onClick={onReset}
      aria-label="恢復北上南下、無傾斜的地球方向"
      title="Reset orientation · North up"
      style={{
        display: "block",
        width: 52,
        height: 52,
        padding: 3,
        borderRadius: "50%",
        border: `1px solid ${isUpright ? COMPASS.uprightBorder : stroke}`,
        background: C.bg,
        boxShadow: C.shadow,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        cursor: "pointer",
        transition: "border-color 180ms ease, transform 180ms ease, background 180ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {/* N／S 是 44 單位 viewBox 內的圖示字形（非文字），fontSize 6/5.5 為 viewBox 單位，不套 chrome 字級 */}
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" style={{ display: "block" }}>
        <circle cx="22" cy="22" r="18.5" fill="none" stroke={stroke} strokeWidth="1" />
        <ellipse cx="22" cy="22" rx="17" ry="6" fill="none" stroke={dim} strokeWidth="0.8" />
        <path d="M5 22h34" fill="none" stroke={dim} strokeWidth="0.65" strokeDasharray="1.5 2.5" />
        <line x1={northX} y1={northY} x2={southX} y2={southY} stroke={COMPASS.northLine} strokeWidth="1" />
        <circle cx={northX} cy={northY} r="2.5" fill={COMPASS.north} />
        <circle cx={southX} cy={southY} r="2" fill={C.south} />
        <text x={northLabelX} y={northLabelY} textAnchor="middle" fill={COMPASS.northLabel} fontSize={6 /* glyph */} fontFamily={FONT.ui} fontWeight="700">N</text>
        <text x={southLabelX} y={southLabelY} textAnchor="middle" fill={text} fontSize={5.5 /* glyph */} fontFamily={FONT.ui}>S</text>
        <circle cx="22" cy="22" r="1.5" fill={isUpright ? COMPASS.north : text} />
      </svg>
    </button>
  );
}

// Phase 2-2：依 zoom band 換 LOD 層（門檻推導見 docs/backlog/render-performance-status.md §Phase 2）。
// > 9.5 → L0（全解析度）；7.2–9.5 → L1（eps 50 m）；≤ 7.2 → L2（eps 250 m）。
// 帶 ±0.3 hysteresis：只有離開目前band 超過 0.3 才切層，避免邊界抖動反覆重載。
const LOD_L1_UP_THRESHOLD = 9.5; // l1 → l0 的嚴格門檻
const LOD_L2_UP_THRESHOLD = 7.2; // l2 → l1 的嚴格門檻
const LOD_HYSTERESIS = 0.3;

/** 嚴格 band（不帶 hysteresis）：用於初始落地／跨兩層以上的大跳躍。 */
function strictLodBand(zoom: number): LodLevel {
  if (zoom > LOD_L1_UP_THRESHOLD) return "l0";
  if (zoom > LOD_L2_UP_THRESHOLD) return "l1";
  return "l2";
}

/** 依目前 band + 新 zoom 算出下一個 band；離開目前 band 需超過 hysteresis 邊界。 */
function computeLodBand(zoom: number, current: LodLevel): LodLevel {
  if (current === "l0") {
    if (zoom > LOD_L1_UP_THRESHOLD - LOD_HYSTERESIS) return "l0";
    return strictLodBand(zoom);
  }
  if (current === "l1") {
    if (zoom > LOD_L1_UP_THRESHOLD + LOD_HYSTERESIS) return "l0";
    if (zoom <= LOD_L2_UP_THRESHOLD - LOD_HYSTERESIS) return strictLodBand(zoom);
    return "l1";
  }
  // current === "l2"
  if (zoom <= LOD_L2_UP_THRESHOLD + LOD_HYSTERESIS) return "l2";
  return strictLodBand(zoom);
}

/** 錄影畫面的失敗提示：右上 16:9／Grid（top 32、高約 28）與手機退出鈕（top 16、48）之下 */
const CAPTURE_STATUS_TOP = 72;
/** 手機狀態條右距（參考 Pulse 手機規則 right 10） */
const MOBILE_STATUS_RIGHT = 10;

// 「探索地圖總覽」地球 icon 展開時飛去的固定俯瞰視角
/** 探索面板區域 chip 的順序（原頂部 Region 按鈕列） */
const REGION_ORDER: Region[] = ["TW", "JP", "HK", "KR", "TH", "US", "UK", "CN", "world", "all"];

const EXPLORE_OVERVIEW_CAMERA = {
  center: [119.0049, 22.5292] as [number, number],
  zoom: 2.5,
  pitch: 0,
  bearing: 0,
};

/** P6 網址套用序列讀的「最新」state 與 handler（每次 render 寫進 urlLiveRef） */
type UrlLive = Pick<ReturnType<typeof useFlightData>, "loading" | "airportCatalog" | "hasFused" | "allFlights" | "selectedAirport"> & {
  airportMeta: Record<string, AirportMeta>;
  availableDates: string[];
  dataSource: DataSource;
  scope: Scope;
  region: Region;
  airportSet: string[] | null;
  airspaceDate: string | undefined;
  airspaceRangeDays: number;
  airspaceSelectedDates: string[];
  timeline: ReturnType<typeof useTimeline>;
  depArrDisabledReason: string | null;
  openAirport: (icao: string) => void;
  applySavedSet: (set: SavedAirportSet) => void;
  handleRegionSelect: (r: Region) => void;
  handleScopeChange: (s: Scope) => void;
  handleTrajColorByChange: (v: TrajColorBy) => void;
  handleColorThemeChange: (key: string) => void;
};

export default function App() {
  const [dataSource, setDataSource] = useState<DataSource>("api");
  const [scope, setScope] = useState<Scope>("airport");
  const [region, setRegion] = useState<Region>("TW");
  // Selection-first：null = 單一機場，陣列 = 明確的多機場 selection。
  const [airportSet, setAirportSet] = useState<string[] | null>(null);
  const [setName, setSetName] = useState<string | null>(null);

  // 與 timeline 解耦的 loader 日期快照；初始主資料日先走日期 shard／日期篩選。
  const [airspaceDate, setAirspaceDate] = useState<string | undefined>("2026-02-18");
  const [airspaceRangeDays, setAirspaceRangeDays] = useState(1);
  const [airspaceSelectedDates, setAirspaceSelectedDates] = useState<string[]>([]);

  // Phase 2-2：依 zoom band 自動換 LOD 層（airport scope／airport set 適用；region scope
  // 忽略這個值）。lodRef 供 hysteresis 計算與 debug hook 同步讀寫，避免依賴 state 的 stale closure。
  const [lod, setLod] = useState<LodLevel>("l0");
  const lodRef = useRef<LodLevel>("l0");
  // 非 null 時暫停自動換層，強制固定在該層（驗收 band 邊界用）。
  const lodOverrideRef = useRef<LodLevel | null>(null);

  const {
    allFlights,
    airports,
    airportCatalog,
    selectedAirport,
    setSelectedAirport,
    loading,
    loadingProgress,
    hasFused,
    airspaceDates,
    regionDatesMap,
    regionFullDatesMap,
    loadError,
    retryLoad,
  } = useFlightData(
    dataSource,
    scope,
    region,
    airspaceDate,
    airspaceRangeDays,
    airportSet,
    airspaceSelectedDates,
    lod,
  );
  // 機場 metadata（座標/名稱/國家，含無 preset 的長尾機場）— 一次性載入，失敗回空物件
  const [airportMeta, setAirportMeta] = useState<Record<string, AirportMeta>>({});
  useEffect(() => {
    loadAirportMeta().then(setAirportMeta);
  }, []);

  const [trackMode, setTrackMode] = useState<TrackMode>("stack");
  const [timeWindow, setTimeWindow] = useState(false);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [mapStyleId, setMapStyleId] = useState("dark");
  const isDarkTheme = !["light", "streets"].includes(mapStyleId);
  const [renderMode, setRenderMode] = useState<RenderMode>("3d");
  const [altExaggeration, setAltExaggeration] = useState(3);
  const [altOffset, setAltOffset] = useState(50);
  const [staticOpacity, setStaticOpacity] = useState(0.1);
  const [orbScale, setOrbScale] = useState(0.000005);
  const [airportOpacity, setAirportOpacity] = useState(0.12);
  const [airportGlow, setAirportGlow] = useState(0.8);
  const [trailLineWidth, setTrailLineWidth] = useState(1);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("trails");
  // Far View 遠景增強：低 zoom 時光點按 zoom 反比補償放大 + 軌跡 alpha 加成
  const [farView, setFarView] = useState(false);
  const [farViewBoost, setFarViewBoost] = useState(7.5);
  // Multi-condition filters（Deep Analysis 面板掌控；scene preset 也會寫入）
  const [flightFilters, setFlightFilters] = useState<FlightFilters>(EMPTY_FILTERS);
  const [depArrFilter, setDepArrFilter] = useState<DepArrFilter>("all");
  const [captureMode, setCaptureMode] = useState(false);
  const [showTerminator, setShowTerminator] = useState(false);
  // 每次載入皆從 default theme + Compare Airports off 開始（不沿用 localStorage 偏好）
  const [colorThemeKey, setColorThemeKey] = useState(DEFAULT_THEME_KEY);
  const [colorThemeOverride, setColorThemeOverride] = useState<import("./types/colorTheme").ColorTheme | null>(null);
  const [colorBy, setColorBy] = useState<AirportColorMode>("theme");
  // 把 ScenePreset 舊版 aircraftFilter 翻譯成新 multi-select Set
  const aircraftFilterKeyToSet = (key: AircraftFilterKey | undefined): Set<string> => {
    if (!key || key === "all") return new Set();
    if (key === "all-special") {
      return new Set(Object.values(AIRCRAFT_CATEGORIES).flatMap((c) => c.types));
    }
    if (key.startsWith("cat:")) {
      const cat = key.slice(4) as AircraftCategory;
      return new Set(AIRCRAFT_CATEGORIES[cat]?.types ?? []);
    }
    if (key.startsWith("type:")) return new Set([key.slice(5)]);
    return new Set();
  };
  // 🔬 Deep Analysis colorBy（機型/航司/用途/時長/航線）— 與 airport colorBy 正交
  const [analysisColorBy, setAnalysisColorBy] = useState<AnalysisColorBy>("none");
  // 工具列「染色：高度｜起降」（§7）；高度 = 原本的著色行為
  const [trajColorBy, setTrajColorBy] = useState<TrajColorBy>("altitude");
  // 🔬 Deep Analysis 點位大小依機型分類自動縮放
  const [scaleByAircraftSize, setScaleByAircraftSize] = useState(false);
  const [airportColorOverrides, setAirportColorOverrides] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem("flight-arc-airport-color-overrides");
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch { return {}; }
  });
  const [showGuide, setShowGuide] = useState(true);
  const [showGuideGrid, setShowGuideGrid] = useState(true);
  const [trailDisplay, setTrailDisplay] = useState<TrailDisplay>("full");
  const [viewshedOpacity, setViewshedOpacity] = useState(0.5);
  const [viewshedSharpness, setViewshedSharpness] = useState(0.5);
  const [showInfo, setShowInfo] = useState(false);
  // 左側 rail 面板（進站預設收起，Q6；圖說旁的引導入口也會開它）
  const [railPanel, setRailPanel] = useState<PanelId | null>(null);
  const [airspaceSelection, setAirspaceSelection] = useState<{ selected: AirspaceFeature; others: AirspaceFeature[] } | null>(null);
  const [airspaceSettings, setAirspaceSettings] = useState<AirspaceSettings>(() => {
    // 保留分類顯示 / opacity / heightScale / edgeGlow 等偏好，但每次載入強制 enabled=false
    try {
      const raw = localStorage.getItem("flight-arc-airspace");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AirspaceSettings>;
        const def = defaultAirspaceSettings();
        return {
          ...def,
          ...parsed,
          // 新加入的 category 要從 default 補上，避免舊 cache 沒有該 key
          visibility: { ...def.visibility, ...(parsed.visibility ?? {}) },
          enabled: false,
        };
      }
    } catch { /* ignore */ }
    return defaultAirspaceSettings();
  });
  // 右下 dock 航班卡（R1、Q5）：單擊航班出現；與單航班追蹤分開（退出追蹤卡片還在）。
  // dock 同時只一張卡：開航班卡會關空域卡，反之亦然。
  const [flightCardId, setFlightCardId] = useState<string | null>(null);
  // 點擊處的選取圈：固定在點擊位置，相機一動就收掉
  const [selectionRing, setSelectionRing] = useState<{ x: number; y: number } | null>(null);
  const trackingRef = useRef(false);
  trackingRef.current = trackMode === "single" && selectedFlightId !== null;
  const [atlasVisible, setAtlasVisible] = useState(false);
  // 機場點按鈕是否曾被使用者啟用過（用來決定待按小紅點是否顯示，啟用一次後永久消失）
  const [atlasEverEnabled, setAtlasEverEnabled] = useState(() => {
    try {
      return localStorage.getItem("flight-arc-atlas-ever-enabled") === "1";
    } catch {
      return false;
    }
  });
  const [atlasGlowVisible, setAtlasGlowVisible] = useState(false);
  const [atlasColorMode, setAtlasColorMode] = useState<AtlasColorMode>("flow");
  const [atlasGlowSize, setAtlasGlowSize] = useState(1.6);
  const [cameraInfo, setCameraInfo] = useState({ lng: 0, lat: 0, zoom: 0, pitch: 0, bearing: 0 });
  const { isMobile, isLandscape } = useIsMobile();

  // Phase 2-2：cameraInfo.zoom 變動時依 hysteresis band 重算 LOD 層（setLodOverride 期間暫停）。
  // zoom<=0 是尚未收到第一次 map "move" 事件的初始 sentinel（handleMapReady 才會設定真實值），
  // 略過避免 mount 瞬間誤判成極遠 zoom 而先切到 l2 又立刻切回。
  useEffect(() => {
    if (lodOverrideRef.current !== null) return;
    if (cameraInfo.zoom <= 0) return;
    const next = computeLodBand(cameraInfo.zoom, lodRef.current);
    if (next !== lodRef.current) {
      lodRef.current = next;
      setLod(next);
    }
  }, [cameraInfo.zoom]);

  // Region 相關 helper
  const KNOWN_REGIONS = ["RC", "RJ", "RO", "VH", "K", "EG"];
  // 中國大陸：ICAO 開頭 Z，排除北韓 ZK、蒙古 ZM
  const isChinaIcao = (icao: string) =>
    icao.startsWith("Z") && !icao.startsWith("ZK") && !icao.startsWith("ZM");
  const isKnownRegion = (icao: string) =>
    KNOWN_REGIONS.some((p) => icao.startsWith(p)) || isChinaIcao(icao);

  type RegionCfg = {
    title: string;
    label: string;
    icaoMatch: (icao: string) => boolean;
    /** 預設機場視角（點 region pill 時飛到的位置） */
    camera: { center: [number, number]; zoom: number; pitch: number; bearing: number };
    /** All Region 視角 */
    regionCamera?: { center: [number, number]; zoom: number; pitch: number; bearing: number };
    defaultAirport?: string;
    /** 預設日期（切 region 時跳到的日期） */
    defaultDate?: string;
  };

  const REGION_CONFIG: Record<Region, RegionCfg> = {
    TW: {
      title: "Taiwan Flight Arc",
      label: "TW",
      icaoMatch: (icao) => icao.startsWith("RC"),
      camera: { center: [121.2281, 25.0927], zoom: 10.4, pitch: 57, bearing: 16 },
      regionCamera: { center: [120.1467, 23.4946], zoom: 7.4, pitch: 25, bearing: -10 },
      defaultAirport: "RCTP",
      defaultDate: "2026-02-18",
    },
    JP: {
      title: "Japan Flight Arc",
      label: "JP",
      icaoMatch: (icao) => icao.startsWith("RJ") || icao.startsWith("RO"),
      camera: { center: [139.7816, 35.5895], zoom: 10.2, pitch: 54, bearing: 109 },
      regionCamera: { center: [138.0288, 36.2247], zoom: 6.4, pitch: 40, bearing: 0 },
      defaultAirport: "RJTT",
      defaultDate: "2026-02-18",
    },
    HK: {
      title: "Hong Kong Flight Arc",
      label: "HK",
      icaoMatch: (icao) => icao.startsWith("VH"),
      camera: { center: [113.9184, 22.3094], zoom: 10.5, pitch: 62, bearing: 106 },
      defaultAirport: "VHHH",
      defaultDate: "2026-02-18",
    },
    KR: {
      title: "Korea Flight Arc",
      label: "KR",
      icaoMatch: (icao) => icao.startsWith("RK"),
      camera: { center: [126.4505, 37.4602], zoom: 9.8, pitch: 55, bearing: 0 },
      regionCamera: { center: [127.7669, 35.9078], zoom: 6.6, pitch: 30, bearing: 0 },
      defaultAirport: "RKSI",
      defaultDate: "2026-02-18",
    },
    TH: {
      title: "Thailand Flight Arc",
      label: "TH",
      icaoMatch: (icao) => icao.startsWith("VT"),
      camera: { center: [100.7501, 13.6900], zoom: 10.0, pitch: 55, bearing: 0 },
      regionCamera: { center: [101.0, 13.5], zoom: 5.6, pitch: 25, bearing: 0 },
      defaultAirport: "VTBS",
      defaultDate: "2026-02-18",
    },
    US: {
      title: "US Flight Arc",
      label: "US",
      icaoMatch: (icao) => icao.startsWith("K"),
      camera: { center: [-84.4277, 33.6407], zoom: 10.5, pitch: 55, bearing: 0 },
      regionCamera: { center: [-98.5795, 39.8283], zoom: 4.0, pitch: 25, bearing: 0 },
      defaultAirport: "KATL",
      defaultDate: "2026-02-18",
    },
    UK: {
      title: "UK Flight Arc",
      label: "UK",
      icaoMatch: (icao) => icao.startsWith("EG"),
      camera: { center: [-0.4614, 51.4700], zoom: 11, pitch: 55, bearing: -10 },
      regionCamera: { center: [-0.1, 51.6], zoom: 9, pitch: 40, bearing: 0 },
      defaultAirport: "EGLL",
      defaultDate: "2026-02-18",
    },
    CN: {
      title: "China Flight Arc",
      label: "CN",
      icaoMatch: (icao) => isChinaIcao(icao),
      camera: { center: [121.8053, 31.1443], zoom: 9.6, pitch: 55, bearing: 0 },
      regionCamera: { center: [110.0, 33.0], zoom: 4.0, pitch: 25, bearing: 0 },
      defaultAirport: "ZSPD",
      defaultDate: "2026-02-18",
    },
    world: {
      title: "World Flight Arc",
      label: "World",
      icaoMatch: (icao) => !isKnownRegion(icao),
      camera: { center: [-16.7745, 32.6942], zoom: 12, pitch: 55, bearing: 0 },
      defaultAirport: "LPMA",
      defaultDate: "2026-02-18",
    },
    all: {
      title: "Flight Arc",
      label: "All",
      icaoMatch: () => true,
      camera: { center: [127.0, 30.0], zoom: 4.5, pitch: 35, bearing: 0 },
      defaultAirport: "RCTP",
      defaultDate: "2026-02-18",
    },
  };

  const regionTitle = REGION_CONFIG[region].title;
  const selectionTitle = airportSet
    ? setName ?? (airportSet.length > 0
      ? `Flight Network · ${airportSet.length} Airport${airportSet.length === 1 ? "" : "s"}`
      : "Build a Flight Network")
    : airportMeta[selectedAirport]?.name ?? getAirportInfo(selectedAirport)?.name ?? selectedAirport;
  const selectionCodeLabel = airportSet
    ? airportSet.join(" · ")
    : (() => {
        const info = getAirportInfo(selectedAirport);
        return info ? `${info.name} / ${info.iata} / ${selectedAirport}` : selectedAirport;
      })();

  // 單一機場模式下的目錄資訊（manifest 的 isCore / dates / fullDates）
  const isAirportScope = dataSource !== "fused" && scope === "airport" && !airportSet;
  const airportEntry = isAirportScope ? airportCatalog[selectedAirport] : undefined;
  const airportDateCounts = useMemo(
    () => (airportEntry?.dates && Object.keys(airportEntry.dates).length > 0 ? airportEntry.dates : null),
    [airportEntry],
  );
  const selectionDateCounts = useMemo(() => {
    if (airportSet === null) return null;
    const counts: Record<string, number> = {};
    for (const icao of airportSet) {
      for (const [date, count] of Object.entries(airportCatalog[icao]?.dates ?? {})) {
        counts[date] = (counts[date] ?? 0) + count;
      }
    }
    return counts;
  }, [airportSet, airportCatalog]);
  const selectionFullDates = useMemo(() => {
    if (airportSet === null || airportSet.length === 0) return [];
    const [first, ...rest] = airportSet;
    const intersection = new Set(airportCatalog[first!]?.fullDates ?? []);
    for (const icao of rest) {
      const dates = new Set(airportCatalog[icao]?.fullDates ?? []);
      for (const date of intersection) {
        if (!dates.has(date)) intersection.delete(date);
      }
    }
    return [...intersection].sort();
  }, [airportSet, airportCatalog]);

  // 可用日期：單一機場模式用該機場的日期目錄，region/airspace 模式維持原邏輯
  const availableDates = useMemo(() => {
    const dates = new Set<string>();

    if (dataSource === "fused") {
      // 空域快照日期
      for (const d of airspaceDates) dates.add(d);
    } else if (selectionDateCounts) {
      return Object.keys(selectionDateCounts).sort();
    } else if (airportDateCounts) {
      // 單一機場：manifest 目錄即為權威日期清單
      return Object.keys(airportDateCounts).sort();
    } else {
      // 航線軌跡：當前 region 的日期
      const regionKey = region === "all" ? "TW" : region;
      const rd = regionDatesMap[regionKey] ?? [];
      for (const d of rd) dates.add(d);
    }

    // 也加入已載入航班的日期（fallback）；sanity floor 1e9 擋掉接近 epoch 的壞時間戳
    for (const f of allFlights) {
      const t = f.dep_time || (f.path.length > 0 ? f.path.t(0) : undefined);
      if (t && t > 1e9) {
        const d = new Date(t * 1000 + 8 * 3600_000);
        dates.add(d.toISOString().slice(0, 10));
      }
    }

    return [...dates].sort();
  }, [dataSource, region, airspaceDates, regionDatesMap, allFlights, airportDateCounts, selectionDateCounts]);

  // 完整抓取日期：單一機場用該機場 fullDates，其餘維持 region 邏輯
  const fullDates = useMemo(() => {
    if (dataSource === "fused") return airspaceDates;
    if (airportSet !== null) return selectionFullDates;
    if (isAirportScope) return airportEntry?.fullDates ?? [];
    return regionFullDatesMap[region === "all" ? "TW" : region] ?? [];
  }, [dataSource, airspaceDates, airportSet, selectionFullDates, isAirportScope, airportEntry, regionFullDatesMap, region]);

  // 預設日期：優先 2026-02-18（主資料日），不在該機場 fullDates 時取第一個 fullDate，
  // 再 fallback 到該機場筆數最多的日期
  const preferredDate = useMemo(() => {
    if (fullDates.includes("2026-02-18")) return "2026-02-18";
    if (fullDates.length > 0) return fullDates[0]!;
    const counts = selectionDateCounts ?? airportDateCounts;
    if (counts) {
      let best: string | null = null;
      let bestCount = 0;
      for (const [d, c] of Object.entries(counts)) {
        if (c > bestCount) { best = d; bestCount = c; }
      }
      if (best) return best;
    }
    return "2026-02-18";
  }, [fullDates, airportDateCounts, selectionDateCounts]);

  const mapRef = useRef<MapboxMap | null>(null);
  // Phase 1-3：播放時鐘留在 ref，rAF 每幀呼叫（不受 10 Hz state 節流影響）觸發 repaint。
  // 播放屬於「有活動」，走 notifyActivity（立即 triggerRepaint + 重置節流器閒置計時），
  // 不能讓它被 Phase 1-2 的裝飾動畫節流吃掉。
  const handleTimelineTick = useCallback(() => {
    notifyActivity(mapRef.current);
  }, []);
  const timeline = useTimeline({ availableDates, preferredDate, onTick: handleTimelineTick });

  // 切換機場時：若目前日期不在新機場的可用日期（availableDates）內，跳到該機場的 preferredDate。
  // 只在「機場改變」時觸發 —— 使用者手動點部分資料日期不會被蓋掉。
  const prevAirportRef = useRef(selectedAirport);
  const prevSelectionRef = useRef<string | null>(null);
  useEffect(() => {
    const selectionKey = airportSet?.join(",") ?? null;
    const airportChanged = prevAirportRef.current !== selectedAirport;
    const selectionChanged = prevSelectionRef.current !== selectionKey;
    if (!airportChanged && !selectionChanged) return;
    prevAirportRef.current = selectedAirport;
    prevSelectionRef.current = selectionKey;
    if (!isAirportScope && airportSet === null) return;
    if (!availableDates.includes(timeline.selectedDate)) {
      timeline.setSelectedDate(preferredDate);
    }
  }, [selectedAirport, airportSet, isAirportScope, availableDates, preferredDate, timeline]);
  const cinema = useCinemaCamera({ map: mapRef.current, active: captureMode });
  const recorder = useCanvasRecorder({ map: mapRef.current });
  const isRecording = recorder.recordingState === "recording";
  const isExporting = isRecording || recorder.recordingState === "hq";

  // 手機狀態條／航班卡位置：header（44）＋固定在其下的時間軸，取時間軸實際底邊 + 8（時間軸高度隨日期面板等變動）
  const mobileTimelineRef = useRef<HTMLDivElement>(null);
  const [mobileStatusTop, setMobileStatusTop] = useState(52);
  useEffect(() => {
    if (!isMobile || captureMode) return;
    const el = mobileTimelineRef.current;
    if (!el) return;
    const update = () => setMobileStatusTop(Math.round(el.getBoundingClientRect().bottom) + SPACE.s8);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, captureMode]);

  // ── Dynamic overlay provider: reads live map state each frame ──
  const selectedAirportRef = useRef(selectedAirport);
  const overlayTitleRef = useRef(airportSet !== null ? selectionTitle : regionTitle);
  const overlaySelectionLabelRef = useRef(selectionCodeLabel);
  const speedRef = useRef(timeline.speed);
  selectedAirportRef.current = selectedAirport;
  overlayTitleRef.current = airportSet !== null ? selectionTitle : regionTitle;
  overlaySelectionLabelRef.current = selectionCodeLabel;
  speedRef.current = timeline.speed;

  const getOverlay = useCallback(() => {
    const map = mapRef.current;
    const timeLabel = new Date(timeRef.current * 1000).toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    let cameraLabel = "";
    if (map) {
      const c = map.getCenter();
      cameraLabel = `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)} z${map.getZoom().toFixed(1)} pitch ${map.getPitch().toFixed(0)} bearing ${map.getBearing().toFixed(0)}`;
    }
    return {
      regionTitle: overlayTitleRef.current,
      airportLabel: overlaySelectionLabelRef.current,
      timeLabel,
      cameraLabel,
      speed: speedRef.current,
      flightCount: flightsRef.current.length,
    };
  }, []);

  const handleColorThemeChange = useCallback((key: string) => {
    setColorThemeKey(key);
    setColorThemeOverride(null);
    const theme = COLOR_THEMES[key];
    if (!theme) return;
    flightSceneRef.current?.setColorTheme(theme);
    setMapTrailColors(theme.mapTrailA, theme.mapTrailB);
  }, []);

  const handleColorThemeOverride = useCallback((theme: import("./types/colorTheme").ColorTheme) => {
    setColorThemeOverride(theme);
    flightSceneRef.current?.setColorTheme(theme);
    setMapTrailColors(theme.mapTrailA, theme.mapTrailB);
  }, []);

  // Apply initial color theme on scene ready
  useEffect(() => {
    const theme = COLOR_THEMES[colorThemeKey];
    if (theme && flightSceneRef.current) {
      flightSceneRef.current.setColorTheme(theme);
      setMapTrailColors(theme.mapTrailA, theme.mapTrailB);
    }
  }, [colorThemeKey]);

  const handleStartRecording = useCallback(() => {
    recorder.startRecording(getOverlay);
  }, [recorder, getOverlay]);

  const handleStartHQExport = useCallback(() => {
    recorder.startHQExport(
      getOverlay,
      cinema.keyframes,
      cinema.loop,
      cinema.pingpong,
    );
  }, [recorder, cinema.keyframes, cinema.loop, cinema.pingpong, getOverlay]);

  // 同步 timeline 日期給 loader；航線模式也使用同一份日期快照，避免初始先載 flat 全量。
  useEffect(() => {
    // availableDates 尚未建立時 useTimeline 會暫時使用今天，不能因此觸發第二次全檔 fallback。
    if (availableDates.length === 0 || !availableDates.includes(timeline.selectedDate)) return;
    setAirspaceDate(timeline.selectedDate);
    setAirspaceRangeDays(timeline.rangeDays);
    setAirspaceSelectedDates((current) => {
      const next = [...new Set(timeline.selectedDates)].sort();
      const unchanged = current.length === next.length
        && current.every((date, index) => date === next[index]);
      return unchanged ? current : next;
    });
  }, [availableDates, timeline.selectedDate, timeline.rangeDays, timeline.selectedDates]);

  // Airspace Scan 預設：切換時自動設定 region 範圍、1d、拉遠視角、低 opacity（切回 Route Tracks 亦為 1d）
  const prevDataSourceRef = useRef(dataSource);
  useEffect(() => {
    const prev = prevDataSourceRef.current;
    prevDataSourceRef.current = dataSource;
    if (prev === dataSource) return;

    if (dataSource === "fused") {
      // 切到 Airspace Scan
      setScope("region");
      timeline.setRangeDays(1);
      setStaticOpacity(0.04);
      // 拉遠到 region 視角
      const cam = REGION_CONFIG[region].camera;
      mapRef.current?.flyTo({ ...cam, duration: 2000 });
    } else {
      // 切回 Route Tracks
      setScope("airport");
      timeline.setRangeDays(1);
      setStaticOpacity(0.1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource]);

  // 根據 trackMode + 日期範圍決定要顯示的航班
  // （scope/region 篩選已由 useFlightData 處理）
  const displayedFlights = useMemo(() => {
    let base = allFlights;
    // 日期範圍篩選
    if (timeline.isMultiDateMode && timeline.dateWindowStarts.length > 0) {
      base = base.filter((f) => {
        const t = f.dep_time || (f.path.length > 0 ? f.path.t(0) : undefined);
        if (!t) return false;
        return timeline.dateWindowStarts.some(
          (start, i) => t >= start && t <= timeline.dateWindowEnds[i]!,
        );
      });
    } else {
      base = base.filter((f) => {
        const t = f.dep_time || (f.path.length > 0 ? f.path.t(0) : undefined);
        return t && t >= timeline.windowStart && t <= timeline.windowEnd;
      });
    }
    if (trackMode === "single" && selectedFlightId) {
      return base.filter((f) => f.fr24_id === selectedFlightId);
    }
    return base;
  }, [allFlights, trackMode, selectedFlightId,
      timeline.windowStart, timeline.windowEnd,
      timeline.isMultiDateMode, timeline.dateWindowStarts, timeline.dateWindowEnds]);

  // Compare 模式：每個日期對應一個固定顏色，產生 fr24_id → hex Map
  const compareColorMap = useMemo((): Map<string, string> | undefined => {
    if (!timeline.isMultiDateMode || timeline.dateWindowStarts.length === 0) return undefined;
    const map = new Map<string, string>();
    for (const f of displayedFlights) {
      const t = f.dep_time || (f.path.length > 0 ? f.path.t(0) : undefined);
      if (!t) continue;
      const idx = timeline.dateWindowStarts.findIndex(
        (start, i) => t >= start && t <= timeline.dateWindowEnds[i]!,
      );
      if (idx >= 0) map.set(f.fr24_id, COMPARE_COLORS[idx % COMPARE_COLORS.length]!);
    }
    return map;
  }, [timeline.isMultiDateMode, timeline.dateWindowStarts, timeline.dateWindowEnds, displayedFlights]);

  // Compare mode 開啟時自動停用 airport 分色
  const effectiveColorBy: AirportColorMode = timeline.isMultiDateMode ? "theme" : colorBy;

  // 一次性清除舊版 localStorage 偏好（color theme + colorBy 不再持久化）
  useEffect(() => {
    localStorage.removeItem("flight-arc-color-theme");
    localStorage.removeItem("flight-arc-color-by");
  }, []);
  // 自訂機場色仍持久化（Compare 開啟時還用得到）
  useEffect(() => {
    try { localStorage.setItem("flight-arc-airport-color-overrides", JSON.stringify(airportColorOverrides)); } catch { /* ignore */ }
  }, [airportColorOverrides]);
  // 機場點第一次啟用後永久記住，待按小紅點就不再顯示
  useEffect(() => {
    if (!atlasVisible || atlasEverEnabled) return;
    setAtlasEverEnabled(true);
    try { localStorage.setItem("flight-arc-atlas-ever-enabled", "1"); } catch { /* ignore */ }
  }, [atlasVisible, atlasEverEnabled]);

  // Multi-condition filter（機型/航司/用途/航線/時長/quick toggles）
  const analysisFilteredFlights = useMemo(
    () => applyFilters(displayedFlights, flightFilters),
    [displayedFlights, flightFilters],
  );

  // 組合模式 derived：set 模式時讀 airportSet，single 模式時讀 [selectedAirport]
  const activeIcaoSet = useMemo(
    () => new Set(airportSet ?? [selectedAirport]),
    [airportSet, selectedAirport],
  );

  // Set 模式：dep OR dest 在 set 內（先過濾再進 dep/arr toggle）
  const setFilteredFlights = useMemo(() => {
    if (!airportSet) return analysisFilteredFlights;
    return analysisFilteredFlights.filter(
      (f) => activeIcaoSet.has(f.origin_icao) || activeIcaoSet.has(f.dest_icao),
    );
  }, [analysisFilteredFlights, airportSet, activeIcaoSet]);

  // ── 組合模式：state mutation wrappers ─────────────────────────
  // 單選機場（包過所有原本 setSelectedAirport 入口）：自動退出 set 模式
  const selectAirportSingle = useCallback((icao: string) => {
    setAirportSet(null);
    setSetName(null);
    setSelectedAirport(icao);
  }, [setSelectedAirport]);

  // 套用 saved set：強制切到 region scope 才能載多機場航班
  const applySavedSet = useCallback((set: SavedAirportSet) => {
    setScope("region");
    setAirportSet([...set.icaos]);
    setSetName(set.shortName);
    const fb = computeFitBoundsForSet(set.icaos, getPresetByIcao);
    if (fb && mapRef.current) {
      if (fb.fallbackPreset) {
        mapRef.current.flyTo({
          center: fb.fallbackPreset.center,
          zoom: fb.fallbackPreset.zoom,
          pitch: fb.fallbackPreset.pitch,
          bearing: fb.fallbackPreset.bearing,
          duration: 1800,
        });
      } else {
        mapRef.current.fitBounds(fb.bounds, {
          padding: { top: 120, bottom: 80, left: 280, right: 80 },
          pitch: fb.pitch,
          bearing: fb.bearing,
          duration: 1800,
          maxZoom: 7,
        });
      }
    }
  }, []);

  const exitSetMode = useCallback(() => {
    setAirportSet(null);
    setSetName(null);
  }, []);

  const toggleAirportInSet = useCallback((icao: string) => {
    setAirportSet((prev) => {
      const base = prev ?? [selectedAirport];
      const has = base.includes(icao);
      const next = has ? base.filter((i) => i !== icao) : [...base, icao];
      return next;
    });
    // 自訂組合 → 失去 set name（不再對應某個 saved set）
    setSetName(null);
    // 切到 region scope（如果還在 airport scope，新加機場可能沒資料）
    setScope((s) => (s === "region" ? s : "region"));
  }, [selectedAirport]);

  const clearSet = useCallback(() => {
    setAirportSet([]);
    setSetName(null);
  }, []);

  // 開啟機場（R11／Q1）：機場面板點擊、搜尋結果、Atlas popup 的主動作 = 單選並飛過去。
  // 走 selectAirportSingle（退出組合）＋ 切回單一機場範圍；空域快照模式先切回航線軌跡
  // （否則選到的機場沒有軌跡可看）。同一座機場再點一次也要飛回去（preset 沒變 MapView 不會飛）。
  const openAirport = useCallback((icao: string) => {
    if (dataSource === "fused") {
      setDataSource("api");
    }
    setScope("airport");
    selectAirportSingle(icao);
    if (icao === selectedAirport && mapRef.current) {
      const m = airportMeta[icao];
      const cam = cameraForAirport(
        icao,
        m ? { lat: m.lat, lng: m.lng, name: m.name, flights: airportCatalog[icao]?.flights } : undefined,
      );
      if (cam) mapRef.current.flyTo({ center: cam.center, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing, duration: 2000 });
    }
  }, [dataSource, selectAirportSingle, selectedAirport, airportMeta, airportCatalog]);
  const openAirportRef = useRef(openAirport);
  openAirportRef.current = openAirport;

  // Dep/Arr filter（兼容 single + set）
  const finalFlights = useMemo(() => {
    if (depArrFilter === "all") return setFilteredFlights;
    return setFilteredFlights.filter((f) =>
      depArrFilter === "dep" ? activeIcaoSet.has(f.origin_icao) : activeIcaoSet.has(f.dest_icao)
    );
  }, [setFilteredFlights, depArrFilter, activeIcaoSet]);

  // 左下圖說：進場／離場數（定義同 Dep/Arr 篩選：dest／origin 在目前機場或組合內）
  const captionCounts = useMemo(() => {
    let arr = 0;
    let dep = 0;
    for (const f of finalFlights) {
      if (activeIcaoSet.has(f.dest_icao)) arr++;
      if (activeIcaoSet.has(f.origin_icao)) dep++;
    }
    return { arr, dep };
  }, [finalFlights, activeIcaoSet]);

  // 時間軸直方圖：每小時進場（arr_time）／離場（dep_time）數。多日 Compare 依各日窗口分段，
  // 避免跨月窗口產生上千格。
  const hourBins = useMemo<HourBin[]>(() => {
    const segs: Array<[number, number]> = timeline.isMultiDateMode && timeline.dateWindowStarts.length > 0
      ? timeline.dateWindowStarts.map((st, i) => [st, timeline.dateWindowEnds[i]!] as [number, number]).sort((a, b) => a[0] - b[0])
      : [[timeline.windowStart, timeline.windowEnd]];
    const bins: HourBin[] = [];
    const segIndex: Array<{ start: number; end: number; offset: number }> = [];
    for (const [st, en] of segs) {
      if (!(en > st)) continue;
      const offset = bins.length;
      for (let t = st; t <= en; t += 3600) bins.push({ start: t, arr: 0, dep: 0 });
      segIndex.push({ start: st, end: en, offset });
    }
    const add = (t: number, key: "arr" | "dep") => {
      if (!t) return;
      for (const sg of segIndex) {
        if (t >= sg.start && t <= sg.end) {
          const b = bins[sg.offset + Math.floor((t - sg.start) / 3600)];
          if (b) b[key]++;
          return;
        }
      }
    };
    // 區域範圍（非組合）沒有「本地機場」：每班的降落／起飛時刻都算
    const regionWide = scope === "region" && airportSet === null;
    for (const f of finalFlights) {
      if (regionWide || activeIcaoSet.has(f.dest_icao)) add(f.arr_time, "arr");
      if (regionWide || activeIcaoSet.has(f.origin_icao)) add(f.dep_time, "dep");
    }
    return bins;
  }, [finalFlights, activeIcaoSet, scope, airportSet, timeline.isMultiDateMode, timeline.dateWindowStarts, timeline.dateWindowEnds, timeline.windowStart, timeline.windowEnd]);

  // 用於 FlightPicker 的航班列表（airport filter；set 模式則 union 所有 set 機場）
  const pickableFlights = useMemo(() => {
    if (airportSet) {
      return allFlights.filter(
        (f) => activeIcaoSet.has(f.origin_icao) || activeIcaoSet.has(f.dest_icao),
      );
    }
    return filterByAirport(allFlights, selectedAirport);
  }, [allFlights, airportSet, activeIcaoSet, selectedAirport]);

  // Local 模式專用：依 region prefix 過濾 airports（避免外國機場混進來）
  // 注意：REGION_CONFIG 不能進 deps（每 render 是新物件），改用 region 字串 + isKnownRegion 工具
  const regionalAirports = useMemo(() => {
    const prefixes: Record<Region, (icao: string) => boolean> = {
      TW: (i) => i.startsWith("RC"),
      JP: (i) => i.startsWith("RJ") || i.startsWith("RO"),
      HK: (i) => i.startsWith("VH"),
      KR: (i) => i.startsWith("RK"),
      TH: (i) => i.startsWith("VT"),
      US: (i) => i.startsWith("K"),
      UK: (i) => i.startsWith("EG"),
      CN: (i) => isChinaIcao(i),
      world: (i) =>
        !["RC", "RJ", "RO", "VH", "RK", "VT", "EG"].some((p) => i.startsWith(p)) &&
        !i.startsWith("K") &&
        !isChinaIcao(i),
      all: () => true,
    };
    return airports.filter(prefixes[region]);
  }, [airports, region]);

  // Local 比較應以目前 Selection 為優先；只有純 region 總覽才使用 region 機場。
  // Saved set 可能跨國，且不會同步單一 region，不能用 stale region 推導本地端點。
  const localCompareAirportCodes = useMemo(() => {
    if (airportSet !== null) return airportSet;
    if (scope === "airport") return [selectedAirport];
    return regionalAirports;
  }, [airportSet, scope, selectedAirport, regionalAirports]);

  // 機場分色指派（依實際顯示的航班 + 使用者手動覆寫）
  const airportAssignment = useMemo((): AirportAssignment | null => {
    if (effectiveColorBy === "theme") return null;
    return assignAirportColors(finalFlights, effectiveColorBy, airportColorOverrides, localCompareAirportCodes);
  }, [effectiveColorBy, finalFlights, airportColorOverrides, localCompareAirportCodes]);

  // 🔬 Deep Analysis colorMap（按機型/用途/時長/航線/航司分色）
  const analysisColorMap = useMemo(
    () => computeAnalysisColorMap(finalFlights, analysisColorBy),
    [finalFlights, analysisColorBy],
  );

  // 起降染色（§7）：需要「選定的機場」（單機場或非空組合）；Compare 多日時日期分色優先 → 停用
  const depArrDisabledReason: string | null = timeline.isMultiDateMode
    ? "多日比較時停用（日期分色）"
    : dataSource === "fused" ||
        !((airportSet !== null && airportSet.length > 0) || (airportSet === null && scope === "airport"))
      ? "先選機場"
      : null;
  // 正在起降模式時切到 region／Compare → 自動回到高度（state 真的回去，Segmented 才不會顯示錯）
  useEffect(() => {
    if (trajColorBy === "deparr" && depArrDisabledReason !== null) setTrajColorBy("altitude");
  }, [trajColorBy, depArrDisabledReason]);
  const depArrActive = trajColorBy === "deparr" && depArrDisabledReason === null;
  const depArrColoring = useMemo(
    () => (depArrActive ? computeDepArrColoring(finalFlights, activeIcaoSet, isDarkTheme) : null),
    [depArrActive, finalFlights, activeIcaoSet, isDarkTheme],
  );
  const depArrColoringRef = useRef(depArrColoring);
  depArrColoringRef.current = depArrColoring;
  useEffect(() => {
    flightSceneRef.current?.setDepArrGradients(depArrColoring?.gradients ?? null, depArrColoring !== null);
  }, [depArrColoring]);

  // 染色方式互斥（§7）：選「起降」→ 機場配色回 theme、分析染色回 none；
  // 反之選了機場配色／分析染色 → 染色回「高度」。包在 handler 裡（同一次 commit），不用 effect。
  const handleTrajColorByChange = useCallback((v: TrajColorBy) => {
    setTrajColorBy(v);
    if (v === "deparr") {
      setColorBy("theme");
      setAnalysisColorBy("none");
    }
  }, []);
  const handleColorByChange = useCallback((v: AirportColorMode) => {
    setColorBy(v);
    if (v !== "theme") setTrajColorBy("altitude");
  }, []);
  const handleAnalysisColorByChange = useCallback((v: AnalysisColorBy) => {
    setAnalysisColorBy(v);
    if (v !== "none") setTrajColorBy("altitude");
  }, []);

  // 🔬 點位大小 multiplier（按機型分類）
  const perFlightScaleMap = useMemo((): Map<string, number> | null => {
    if (!scaleByAircraftSize) return null;
    const sizeByCat: Record<AcCat, number> = {
      widebody: 1.6,
      narrowbody: 1.0,
      regional: 0.8,
      prop: 0.7,
      bizjet: 0.55,
      heli: 0.55,
      military: 1.1,
      cargo: 1.3,
      other: 0.9,
    };
    const map = new Map<string, number>();
    for (const f of finalFlights) {
      const cat = getAircraftInfo(f.aircraft_type).category;
      map.set(f.fr24_id, sizeByCat[cat]);
    }
    return map;
  }, [finalFlights, scaleByAircraftSize]);

  useEffect(() => {
    flightSceneRef.current?.setPerFlightScaleMap(perFlightScaleMap);
  }, [perFlightScaleMap]);

  // 給 MapView + FlightScene 的最終 per-flight color map
  // 優先序：起降染色 > Analysis > Compare > Airport > theme（fallback undefined）
  // 起降染色與其他三者互斥（見 handler／depArrDisabledReason），放最前只是保險
  const perFlightColorMap = useMemo((): Map<string, string> | undefined => {
    if (depArrColoring) return depArrColoring.flat.size > 0 ? depArrColoring.flat : undefined;
    if (analysisColorMap && analysisColorMap.size > 0) return analysisColorMap;
    if (compareColorMap) return compareColorMap;
    if (airportAssignment && airportAssignment.flightColors.size > 0) return airportAssignment.flightColors;
    return undefined;
  }, [depArrColoring, analysisColorMap, compareColorMap, airportAssignment]);

  const perFlightColorMapRef = useRef(perFlightColorMap);
  perFlightColorMapRef.current = perFlightColorMap;

  // perFlightColorMap 變動時推到 FlightScene（重建靜態 3D mesh + 重上色動態 trail）
  useEffect(() => {
    flightSceneRef.current?.setPerFlightColorMap(perFlightColorMap ?? null);
  }, [perFlightColorMap]);


  const flightsRef = useRef(finalFlights);
  // Phase 1-3：不再自己維護一份「每次 render 從 state 複製」的 ref（那會被 10 Hz
  // 節流拖慢），直接沿用 useTimeline 內部的 timeRef —— 同一個物件，rAF 每幀寫入，
  // custom layer / 錄影 overlay / 晨昏線 / viewshed track-single 都讀到最新值。
  const timeRef = timeline.timeRef;
  const renderModeRef = useRef(renderMode);
  const altExagRef = useRef(altExaggeration);
  const altOffsetRef = useRef(altOffset);
  const staticOpacityRef = useRef(staticOpacity);
  const trailLineWidthRef = useRef(trailLineWidth);
  const airportGlowRef = useRef(airportGlow);
  const orbScaleRef = useRef(orbScale);
  const farViewRef = useRef(farView);
  const farViewBoostRef = useRef(farViewBoost);
  const isDarkThemeRef = useRef(isDarkTheme);
  const showTrailsRef = useRef(displayMode === "trails");
  const timeWindowRef = useRef(timeWindow);
  const trailDisplayRef = useRef(trailDisplay);
  const mapStyleIdRef = useRef(mapStyleId);
  const viewshedOpacityRef = useRef(viewshedOpacity);
  const viewshedSharpnessRef = useRef(viewshedSharpness);
  const airspaceSettingsRef = useRef(airspaceSettings);
  const flightSceneRef = useRef<FlightScene | null>(null);
  const clickBoundRef = useRef(false);
  const atlasPopupRef = useRef<mapboxgl.Popup | null>(null);
  const atlasGlowVisibleRef = useRef(atlasGlowVisible);
  const atlasColorModeRef = useRef(atlasColorMode);
  const atlasGlowSizeRef = useRef(atlasGlowSize);

  flightsRef.current = finalFlights;
  renderModeRef.current = renderMode;
  altExagRef.current = altExaggeration;
  altOffsetRef.current = altOffset;
  staticOpacityRef.current = staticOpacity;
  trailLineWidthRef.current = trailLineWidth;
  airportGlowRef.current = airportGlow;
  orbScaleRef.current = orbScale;
  farViewRef.current = farView;
  farViewBoostRef.current = farViewBoost;
  isDarkThemeRef.current = isDarkTheme;
  showTrailsRef.current = displayMode === "trails";
  timeWindowRef.current = timeWindow;
  trailDisplayRef.current = trailDisplay;
  mapStyleIdRef.current = mapStyleId;
  viewshedOpacityRef.current = viewshedOpacity;
  viewshedSharpnessRef.current = viewshedSharpness;
  airspaceSettingsRef.current = airspaceSettings;
  atlasGlowVisibleRef.current = atlasGlowVisible;
  atlasColorModeRef.current = atlasColorMode;
  atlasGlowSizeRef.current = atlasGlowSize;

  // repaint 閘控（customLayer）後，Mapbox 不再永續重繪；custom layer 每幀 pull 的狀態
  // 變更時要主動踢一下 repaint，否則完全 idle 時拖 slider / 按播放不會立即反應。
  // 這些都是「真的有事發生」（播放中時刻推進、控制項變更），走 notifyActivity：
  // 立即 triggerRepaint 之外，也重置節流器的閒置計時，避免裝飾動畫（光球呼吸等）
  // 誤判成已閒置 30 秒而停在半路。
  useEffect(() => {
    notifyActivity(mapRef.current);
  }, [
    timeline.currentTime, finalFlights, renderMode, altExaggeration, altOffset,
    staticOpacity, trailLineWidth, airportGlow, orbScale, farView, farViewBoost, isDarkTheme, displayMode, timeWindow, trailDisplay,
    atlasGlowVisible, atlasColorMode, atlasGlowSize, viewshedOpacity, viewshedSharpness,
    colorThemeKey, colorThemeOverride, perFlightColorMap, perFlightScaleMap, airspaceSettings,
  ]);

  // DEV-only 除錯掛鉤：效能量測腳本（scripts/perf/）用來取得 map / scene 與操控場景，
  // production build 會被 tree-shake 掉。不要在 UI 程式碼裡依賴它。
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __flightArcDebug?: unknown }).__flightArcDebug = {
      get map() { return mapRef.current; },
      get scene() { return flightSceneRef.current; },
      getFlights: () => flightsRef.current,
      getTime: () => timeRef.current,
      /** Phase 1-3 驗收用：currentTime state（節流 ~10 Hz）側的值，與 getTime()（ref，逐幀）對照 */
      getStateTime: () => timeline.currentTime,
      state: { scope, region, selectedAirport, airportSet, renderMode, displayMode, mapStyleId, playing: timeline.playing, speed: timeline.speed, lod: lodRef.current },
      /** Phase 2-2 驗收用：目前套用的 LOD 層（"l0"／"l1"／"l2"），依 zoom band 自動算出或被 setLodOverride 鎖定。 */
      getLod: () => lodRef.current,
      /**
       * Phase 2-2 驗收用：強制鎖定 LOD 層（band 邊界視覺比對）；傳 null 解除鎖定，
       * 回到依目前 zoom 自動換層（用嚴格 band，不帶 hysteresis，落地後續交給 zoom effect）。
       */
      setLodOverride: (value: LodLevel | null) => {
        lodOverrideRef.current = value;
        const next = value ?? strictLodBand(cameraInfo.zoom);
        lodRef.current = next;
        setLod(next);
        notifyActivity(mapRef.current);
      },
      selectAirportSingle,
      applySavedSet,
      toggleAirportInSet,
      exitSetMode,
      setScope,
      setRegion,
      setAirportGlow,
      setStaticOpacity,
      setDisplayMode,
      setFarView,
      setMapStyle: setMapStyleId,
      setTrailDisplay,
      setTimeWindow,
      /** 視覺回歸用：凍結所有 wall-clock 動畫（光球呼吸／閃爍、bloom、極光、CSS 動畫）到固定秒數；null 解除 */
      freezeAnimation: (t: number | null) => {
        setFrozenAnimTime(t);
        const styleId = "__flight-arc-freeze-css";
        const existing = document.getElementById(styleId);
        if (t === null) {
          existing?.remove();
        } else if (!existing) {
          const st = document.createElement("style");
          st.id = styleId;
          st.textContent = "*,*::before,*::after{animation-play-state:paused!important;transition:none!important}";
          document.head.appendChild(st);
        }
        // 凍結/解凍動畫是「控制項變更」，走 notifyActivity（視覺回歸截圖工具用，
        // 需要立即看到結果，不能被裝飾節流吃掉）。
        notifyActivity(mapRef.current);
      },
      /**
       * 視覺回歸用：重現 IconRailSidebar.tsx SummaryPanel 的 airportStats / regionStats 算式，
       * 回傳可 JSON.stringify 的快照。用來證明「改渲染（尤其換 LOD）後 Summary 數字沒變」。
       * 排序陣列（同分順序取決於航班疊代順序）一律轉成無序物件，避免載入順序改變造成假 diff。
       */
      summarySnapshot: async () => {
        const st = await import("./data/flightStats");
        const flights = flightsRef.current;

        const toCountMap = <T,>(
          arr: T[],
          keyFn: (item: T) => string,
          valFn: (item: T) => number,
        ): Record<string, number> => {
          const out: Record<string, number> = {};
          for (const item of arr) out[keyFn(item)] = valFn(item);
          return out;
        };

        // fr24_id 排序後 join，算簡單 32-bit hash（區分「統計算法變了」vs「載入的航班集合變了」）
        const sortedIds = flights.map((f) => f.fr24_id).sort();
        const idsJoined = sortedIds.join(",");
        let hash = 0;
        for (let i = 0; i < idsJoined.length; i++) {
          hash = (Math.imul(31, hash) + idsJoined.charCodeAt(i)) | 0;
        }

        const base = {
          scope,
          region,
          selectedAirport,
          airportSet,
          time: timeRef.current,
          rangeDays: timeline.rangeDays,
          flightCount: flights.length,
          flightIdsHash: hash,
        };

        const isAirportScope = scope === "airport";

        const airportStats = (() => {
          if (!isAirportScope || flights.length === 0) return null;
          const icao = selectedAirport;
          const depArr = st.getDepArrCount(flights, icao);
          const total = depArr.departures + depArr.arrivals;
          const hourly = st.computeHourlyStats(flights, icao);
          const peak = hourly.reduce((a, b) => (b.count > a.count ? b : a), { hour: 0, count: 0 });
          const daily = st.computeDailyStats(flights, icao);
          const days = st.getUniqueDays(flights, icao);
          const topRoutes = st.computeTopRoutes(flights, icao, 5);
          const airlines = st.getAirlineStats(flights, icao);
          const fleetMix = st.getFleetMix(flights, icao);
          const durations = st.getFlightDurationDistribution(flights, icao);

          return {
            departures: depArr.departures,
            arrivals: depArr.arrivals,
            total,
            days,
            peakHour: peak.hour,
            peakCount: peak.count,
            hourly: toCountMap(hourly, (h) => String(h.hour), (h) => h.count),
            daily: toCountMap(daily, (d) => d.date, (d) => d.total),
            dailyDep: toCountMap(daily, (d) => d.date, (d) => d.departures),
            dailyArr: toCountMap(daily, (d) => d.date, (d) => d.arrivals),
            topRoutes: toCountMap(topRoutes, (r) => r.destIcao, (r) => r.count),
            topRoutesOrdered: topRoutes.map((r) => r.destIcao),
            airlines: toCountMap(airlines, (a) => a.code, (a) => a.count),
            airlinesOrdered: airlines.map((a) => a.code),
            fleetMix: toCountMap(fleetMix, (f) => f.category, (f) => f.count),
            durations: toCountMap(durations, (d) => d.label, (d) => d.count),
          };
        })();

        const regionStats = (() => {
          if (isAirportScope || flights.length === 0) return null;
          const comparison = st.computeAirportComparison(flights);
          const totalFlights = flights.length;
          const domestic = flights.filter((f) => f.origin_icao.startsWith("RC") && f.dest_icao.startsWith("RC")).length;
          const international = totalFlights - domestic;
          const uniqueAirports = new Set([...flights.map((f) => f.origin_icao), ...flights.map((f) => f.dest_icao)]).size;

          return {
            totalFlights,
            domestic,
            international,
            uniqueAirports,
            comparison: toCountMap(comparison, (c) => c.icao, (c) => c.count),
            comparisonOrdered: comparison.map((c) => c.icao),
          };
        })();

        return { ...base, airportStats, regionStats };
      },
      timeline: { play: timeline.play, pause: timeline.pause, seek: timeline.seek, setSpeed: timeline.setSpeed, setSelectedDate: timeline.setSelectedDate },
      builtinSets: BUILTIN_SETS,
      /** T1-1 驗收用：累積的 GL buffer 上傳次數（bufferData/bufferSubData 呼叫數） */
      glStats: getGlStats,
      /** 歸零 glStats 計數器，通常在暫停/相機靜止測試前呼叫 */
      resetGlStats,
      /**
       * Phase 1-4 驗收用（preserveDrawingBuffer:false）：走真實錄製路徑
       * start/stopRecording，以及不落地成檔案、直接量測取像路徑像素內容的
       * captureFrameForTest／captureHQFrameForTest。
       */
      recorder: {
        startRecording: handleStartRecording,
        stopRecording: recorder.stopRecording,
        getState: () => recorder.recordingState,
        captureFrameForTest: recorder.captureFrameForTest,
        captureHQFrameForTest: recorder.captureHQFrameForTest,
      },
    };
  });

  // 持久化 airspace 設定
  useEffect(() => {
    try { localStorage.setItem("flight-arc-airspace", JSON.stringify(airspaceSettings)); } catch { /* ignore */ }
  }, [airspaceSettings]);

  // 海峽中線可見性跟隨 settings
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setMedianLineVisibility(map, airspaceSettings.enabled && airspaceSettings.showMedianLine);
  }, [airspaceSettings.enabled, airspaceSettings.showMedianLine]);

  // 海峽中線主題色跟隨暗/亮
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setMedianLineTheme(map, isDarkTheme);
  }, [isDarkTheme]);

  const showTerminatorRef = useRef(showTerminator);
  showTerminatorRef.current = showTerminator;

  // Toggle terminator layer (satellite only)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const isSatellite = mapStyleId === "satellite";
    if (showTerminator && isSatellite) {
      initTerminatorLayer(map, () => timeRef.current, isDarkTheme);
    } else {
      removeTerminatorLayer(map);
    }
  }, [showTerminator, isDarkTheme, mapStyleId]);

  const showTrails = displayMode === "trails";

  // 沒 preset 也沒座標時，保留上一個有效視角（不飛回桃園 CAMERA_PRESETS[0]）
  const lastPresetRef = useRef(CAMERA_PRESETS[0]!);
  const preset = useMemo(() => {
    const m = airportMeta[selectedAirport];
    const cam = cameraForAirport(
      selectedAirport,
      m ? { lat: m.lat, lng: m.lng, name: m.name, flights: airportCatalog[selectedAirport]?.flights } : undefined,
    );
    if (cam) {
      lastPresetRef.current = cam;
      return cam;
    }
    console.warn(`[Camera] ${selectedAirport} 無 preset 也無座標，維持目前視角`);
    return lastPresetRef.current;
  }, [selectedAirport, airportMeta, airportCatalog]);

  const styleUrl = useMemo(() => getStyleUrl(mapStyleId), [mapStyleId]);

  const addAirspaceLayer = (map: MapboxMap) => {
    if (map.getLayer("airspace-aurora")) {
      map.removeLayer("airspace-aurora");
    }
    const layer = createAirspaceLayer({
      getSettings: () => airspaceSettingsRef.current,
      getIsDarkTheme: () => isDarkThemeRef.current,
    });
    map.addLayer(layer);

    // 海峽中線（獨立 Mapbox line layer）
    removeMedianLineLayer(map);
    addMedianLineLayer(map, isDarkThemeRef.current);
    const s = airspaceSettingsRef.current;
    setMedianLineVisibility(map, s.enabled && s.showMedianLine);
  };

  const addFlightLayer = (map: MapboxMap) => {
    if (map.getLayer("flight-3d")) {
      map.removeLayer("flight-3d");
    }
    const layer = createFlightLayer({
      getCurrentTime: () => timeRef.current,
      getFlights: () => flightsRef.current,
      getRenderMode: () => renderModeRef.current,
      getAltExaggeration: () => altExagRef.current,
      getAltOffset: () => altOffsetRef.current,
      getStaticOpacity: () => staticOpacityRef.current,
      getStaticWidth: () => trailLineWidthRef.current,
      getGlowIntensity: () => airportGlowRef.current,
      getOrbScale: () => orbScaleRef.current,
      getFarView: () => farViewRef.current,
      getFarViewBoost: () => farViewBoostRef.current,
      getIsDarkTheme: () => isDarkThemeRef.current,
      getShowTrails: () => showTrailsRef.current,
      getTimeWindow: () => timeWindowRef.current,
      getTrailDisplay: () => trailDisplayRef.current,
      onSceneReady: (scene) => {
        flightSceneRef.current = scene;
        // 初次或 style 切換後重新套用 per-flight 顏色
        scene.setPerFlightColorMap(perFlightColorMapRef.current ?? null);
        scene.setDepArrGradients(depArrColoringRef.current?.gradients ?? null, depArrColoringRef.current !== null);
      },
    });
    map.addLayer(layer);
  };

  const addAtlasGlowLayer = (map: MapboxMap) => {
    if (map.getLayer(ATLAS_GLOW_LAYER_ID)) {
      map.removeLayer(ATLAS_GLOW_LAYER_ID);
    }
    const layer = createAtlasGlowLayer({
      getIsVisible: () => atlasGlowVisibleRef.current,
      getColorMode: () => atlasColorModeRef.current,
      getSizeMul: () => atlasGlowSizeRef.current,
    });
    map.addLayer(layer);
  };

  const handleMapReady = (map: MapboxMap) => {
    mapRef.current = map;
    addAirspaceLayer(map);
    addFlightLayer(map);
    addAtlasGlowLayer(map);
    if (showTerminatorRef.current) {
      initTerminatorLayer(map, () => timeRef.current, isDarkThemeRef.current);
    }
    const updateCamera = () => {
      const c = map.getCenter();
      const next = {
        lng: +c.lng.toFixed(4),
        lat: +c.lat.toFixed(4),
        zoom: +map.getZoom().toFixed(1),
        pitch: +map.getPitch().toFixed(0),
        bearing: +map.getBearing().toFixed(0),
      };
      // T0-4：四捨五入後數值沒變就沿用舊物件參考，避免相機移動期間每幀都觸發
      // App 整棵樹 reconcile（拖曳／orbit／cinema／flyTo 期間尤其密集）
      setCameraInfo((prev) =>
        prev.lng === next.lng &&
        prev.lat === next.lat &&
        prev.zoom === next.zoom &&
        prev.pitch === next.pitch &&
        prev.bearing === next.bearing
          ? prev
          : next,
      );
    };
    map.on("move", updateCamera);
    updateCamera();

    if (!clickBoundRef.current) {
      clickBoundRef.current = true;

      map.on("click", (e) => {
        const scene = flightSceneRef.current;
        const container = map.getContainer();
        const flightId = scene?.pickFlight(
          e.point.x, e.point.y,
          container.clientWidth, container.clientHeight,
        );
        if (flightId) {
          // 單擊航班 → dock 航班卡 + 選取圈（追蹤要按卡片上的「追蹤這班」，Q5）
          setFlightCardId(flightId);
          setSelectionRing({ x: e.point.x, y: e.point.y });
          setAirspaceSelection(null);
          return;
        }
        setSelectionRing(null);
        // 點到空白處收掉航班卡（追蹤中保留，用卡片或 Esc 退出）
        if (!trackingRef.current) setFlightCardId(null);
        // Atlas 機場點 pick（飛機之後、空域之前）
        atlasPopupRef.current?.remove();
        if (map.getLayer(ATLAS_LAYER)) {
          const atlasHits = map.queryRenderedFeatures(e.point, { layers: [ATLAS_LAYER] });
          if (atlasHits.length > 0 && atlasHits[0]!.properties) {
            const atlasProps = atlasHits[0]!.properties as AtlasProps;
            const popup = new mapboxgl.Popup({ offset: 10, maxWidth: "260px" })
              .setLngLat(e.lngLat)
              .setHTML(buildAtlasPopupHtml(atlasProps))
              .addTo(map);
            atlasPopupRef.current = popup;
            // 主動作：開啟機場（單選並飛過去，R11）；次動作：加入組合
            popup.getElement()?.querySelector<HTMLButtonElement>("[data-atlas-open]")?.addEventListener("click", () => {
              openAirportRef.current(atlasProps.icao);
              popup.remove();
            });
            popup.getElement()?.querySelector<HTMLButtonElement>("[data-atlas-add]")?.addEventListener("click", () => {
              setAirportSet((current) => {
                const base = current ?? [selectedAirportRef.current];
                return base.includes(atlasProps.icao) ? base : [...base, atlasProps.icao];
              });
              setSetName(null);
              setScope("region");
              popup.remove();
            });
            setAirspaceSelection(null);
            return;
          }
        }
        // 嘗試 pick airspace
        const features = getCachedAirspace();
        if (features && features.length > 0) {
          const { lng, lat } = e.lngLat;
          const hits = pickAirspace(lng, lat, features, airspaceSettingsRef.current);
          if (hits.length > 0) {
            setAirspaceSelection({ selected: hits[0]!, others: hits.slice(1) });
            setFlightCardId(null);
          } else {
            setAirspaceSelection(null);
          }
        }
      });

      map.on("move", () => setSelectionRing(null));
    }
  };

  // 航班資料或模式變更時重建 layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    addFlightLayer(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAirport, scope, trackMode, selectedFlightId]);

  // 換機場／組合時重置航班卡、選取圈與單航班模式（舊航班不在新資料裡）
  const prevFlightScopeRef = useRef<string>(`${selectedAirport}|${airportSet?.join(",") ?? ""}`);
  useEffect(() => {
    const key = `${selectedAirport}|${airportSet?.join(",") ?? ""}`;
    if (prevFlightScopeRef.current === key) return;
    prevFlightScopeRef.current = key;
    setFlightCardId(null);
    setSelectionRing(null);
    setTrackMode("stack");
    setSelectedFlightId(null);
  }, [selectedAirport, airportSet]);

  // 不論從哪進單航班模式（航班卡、顯示面板的航班選單、統計、手機航班清單），dock 都顯示該班的卡（停止追蹤）
  useEffect(() => {
    if (trackMode !== "single" || !selectedFlightId) return;
    setFlightCardId(selectedFlightId);
    setAirspaceSelection(null);
  }, [trackMode, selectedFlightId]);

  const startTracking = useCallback((id: string) => {
    setTrackMode("single");
    setSelectedFlightId(id);
  }, []);
  const stopTracking = useCallback(() => {
    setTrackMode("stack");
    setSelectedFlightId(null);
  }, []);
  const closeFlightCard = useCallback(() => {
    setFlightCardId(null);
    setSelectionRing(null);
  }, []);
  const cardFlight = useMemo(
    () => (flightCardId ? allFlights.find((f) => f.fr24_id === flightCardId) ?? null : null),
    [flightCardId, allFlights],
  );

  // Track Single 模式：相機鎖定飛機 + 動態視域扇形
  useEffect(() => {
    if (trackMode !== "single" || !selectedFlightId) return;
    const map = mapRef.current;
    if (!map) return;

    let animId: number;
    let lastLat = 0, lastLng = 0;
    // pre-allocated arrays 避免每幀 GC
    let cachedArcPts: [number, number][] = [];
    let cachedRings: { arc: [number, number][]; alpha: number }[] = [];

    const tick = () => {
      const styleId = mapStyleIdRef.current;
      const isSat = styleId.includes("satellite");
      const flight = flightsRef.current.find((f) => f.fr24_id === selectedFlightId);
      if (flight && flight.path.length > 0) {
        const t = timeRef.current;
        const path = flight.path;
        let lat: number, lng: number, alt = 0, heading = 0;
        if (t <= path.t(0)) {
          lat = path.lat(0); lng = path.lng(0); alt = path.alt(0);
          if (path.length > 1) heading = computeBearing(path.lat(0), path.lng(0), path.lat(1), path.lng(1));
        } else if (t >= path.t(path.length - 1)) {
          const last = path.length - 1;
          lat = path.lat(last); lng = path.lng(last); alt = path.alt(last);
          if (path.length > 1) {
            const n = path.length;
            heading = computeBearing(path.lat(n - 2), path.lng(n - 2), path.lat(n - 1), path.lng(n - 1));
          }
        } else {
          lat = path.lat(0); lng = path.lng(0);
          for (let i = 1; i < path.length; i++) {
            if (path.t(i) >= t) {
              const ai = i - 1, bi = i;
              const r = (t - path.t(ai)) / (path.t(bi) - path.t(ai));
              lat = path.lat(ai) + (path.lat(bi) - path.lat(ai)) * r;
              lng = path.lng(ai) + (path.lng(bi) - path.lng(ai)) * r;
              alt = path.alt(ai) + (path.alt(bi) - path.alt(ai)) * r;
              heading = computeBearing(path.lat(ai), path.lng(ai), path.lat(bi), path.lng(bi));
              break;
            }
          }
        }
        const moved = Math.abs(lat - lastLat) > 0.0001 || Math.abs(lng - lastLng) > 0.0001;
        if (moved) {
          map.setCenter([lng, lat]);
          lastLat = lat;
          lastLng = lng;

          // 位置有變才重算幾何（避免 ~1500 trig/幀白做）
          const arcs = getViewshedArcPoints(lat, lng, alt, heading);
          cachedArcPts = arcs.left.concat(arcs.right);
          const ringData = getViewshedRings(lat, lng, alt, heading, 5, 16, viewshedSharpnessRef.current);
          cachedRings = ringData ? ringData.left.concat(ringData.right) : [];
        }
        // Three.js buffer 更新（每幀，用快取的幾何資料）
        const scene = flightSceneRef.current;
        if (scene) {
          const vsOpacity = viewshedOpacityRef.current;
          scene.updateViewshedLines(cachedArcPts, lat, lng, alt, isSat, vsOpacity);
          if (cachedRings.length > 0) {
            scene.updateViewshedFans(cachedRings, lat, lng, isSat, vsOpacity);
          }
        }
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
      flightSceneRef.current?.clearViewshedLines();
    };
  }, [trackMode, selectedFlightId]);

  // ── 浮層互斥（R2）：只看「剛由關變開」的那個，關掉其他；Capture 進入時全關 ──
  const overlayState: OverlayState = useMemo(
    () => ({ rail: railPanel !== null, info: showInfo }),
    [railPanel, showInfo],
  );
  const prevOverlayRef = useRef<OverlayState>(ALL_OVERLAYS_CLOSED);
  const closeOverlay = useCallback((key: OverlayKey) => {
    if (key === "rail") setRailPanel(null);
    else setShowInfo(false);
  }, []);
  useEffect(() => {
    const prev = prevOverlayRef.current;
    prevOverlayRef.current = overlayState;
    const toClose = captureMode ? overlaysOpen(overlayState) : overlaysToClose(prev, overlayState);
    toClose.forEach(closeOverlay);
  }, [overlayState, captureMode, closeOverlay]);

  // ── Esc 分層（R7）：單一 handler，掛 window bubble 階段（Modal capture 階段、月曆 document 階段先攔）──
  const escStateRef = useRef({ captureMode, isExporting, showInfo, airspaceSelection, flightCardId, trackMode, railPanel });
  escStateRef.current = { captureMode, isExporting, showInfo, airspaceSelection, flightCardId, trackMode, railPanel };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const cur = escStateRef.current;
      const layer = escLayerToClose({
        defaultPrevented: e.defaultPrevented,
        editableTarget: isEditableTarget(e.target),
        captureMode: cur.captureMode,
        exporting: cur.isExporting,
        infoOpen: cur.showInfo,
        dockCardOpen: cur.airspaceSelection !== null || cur.flightCardId !== null,
        singleFlight: cur.trackMode === "single",
        // 航班卡在追蹤中一定是被追蹤那班（先開卡或隨追蹤打開）→ 先退出追蹤；
        // 空域卡和單航班同時開著 = 追蹤中才點開的（開空域卡會關航班卡）→ 先關卡
        dockNewerThanSingle: cur.airspaceSelection !== null,
        panelOpen: cur.railPanel !== null,
      });
      if (!layer) return;
      e.preventDefault();
      if (layer === "capture") setCaptureMode(false);
      else if (layer === "info") setShowInfo(false);
      else if (layer === "dock") {
        setAirspaceSelection(null);
        setFlightCardId(null);
        setSelectionRing(null);
      }
      else if (layer === "single") {
        // 同 SettingsPanel 的 Track 切換：回 Stack All 並清掉選取
        setTrackMode("stack");
        setSelectedFlightId(null);
      } else {
        setRailPanel(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // 資料載入完成後自動播放
  useEffect(() => {
    if (!loading && availableDates.length > 0) {
      timeline.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, availableDates.length]);

  // ── P6 網址記住狀態：進站時套用一次（R8）────────────────────────────────
  // 套用是跨多次 render 的序列（等目錄 → 選取對象 → 日期 → 等資料載完 → 其餘），
  // 每一步都走既有 handler，不直接塞 state 繞過副作用。讀 state 一律經 urlLiveRef
  // （每次 render 更新），不吃 effect closure —— loading 在 closure 裡會有一個 commit 的落差。
  // 無參數進站：什麼都不做，只在首次載完後打開「寫回網址」開關。
  const urlTargetRef = useRef<UrlState | null>(null);
  if (urlTargetRef.current === null) urlTargetRef.current = decodeUrlState(window.location.search);
  const urlLiveRef = useRef<UrlLive | null>(null);
  const [urlWriteEnabled, setUrlWriteEnabled] = useState(false);
  useEffect(() => {
    const target = urlTargetRef.current ?? {};
    let cancelled = false;
    const live = () => urlLiveRef.current!;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const waitFor = async (cond: () => boolean, timeoutMs: number) => {
      const t0 = Date.now();
      while (!cancelled && Date.now() - t0 < timeoutMs) {
        if (cond()) return true;
        await wait(100);
      }
      return false;
    };
    // 「載完且穩定」：loader 已拿到 timeline 的日期、loading 連續 4 次（~400ms）為 false
    const waitSettled = async (timeoutMs: number) => {
      let calm = 0;
      return waitFor(() => {
        const L = live();
        const synced = L.availableDates.length > 0 && L.airspaceDate === L.timeline.selectedDate
          && L.airspaceRangeDays === L.timeline.rangeDays
          && L.airspaceSelectedDates.length === new Set(L.timeline.selectedDates).size;
        calm = synced && !L.loading ? calm + 1 : 0;
        return calm >= 4;
      }, timeoutMs);
    };

    (async () => {
      const hasTarget = Object.keys(target).length > 0;
      if (hasTarget) {
        // 1. 等機場目錄、機場 metadata（否則 preset 晚到會再飛一次）與地圖
        await waitFor(() => {
          const L = live();
          return Object.keys(L.airportCatalog).length > 0 && Object.keys(L.airportMeta).length > 0 && mapRef.current !== null;
        }, 30000);
        if (cancelled) return;
        const catalog = live().airportCatalog;
        const regionKey = target.scope && (REGION_ORDER as string[]).includes(target.scope) ? target.scope as Region : null;

        // 2. 選取對象（資料來源 → 組合 / 區域 / 單一機場）
        if (target.dataSource === "airspace") {
          await waitFor(() => live().hasFused, 10000);
          if (live().hasFused) {
            if (regionKey) live().handleRegionSelect(regionKey);
            await wait(150);
            // 空域快照 effect：範圍切 region、1d、飛到 region 視角
            setDataSource("fused");
          }
        } else if (target.setId || target.setIcaos) {
          const builtin = target.setId ? BUILTIN_SETS.find((s) => s.id === target.setId) : undefined;
          const icaos = (builtin?.icaos ?? target.setIcaos ?? []).filter((i) => catalog[i]);
          if (builtin && icaos.length === builtin.icaos.length) live().applySavedSet(builtin);
          else if (icaos.length > 0) {
            live().applySavedSet({ id: "url", name: "", shortName: "", icaos });
            setSetName(null); // 自訂組合沒有名稱
          }
        } else if (regionKey) {
          live().handleRegionSelect(regionKey);
          await waitFor(() => live().region === regionKey, 2000);
          live().handleScopeChange("region");
        } else if (target.airport && catalog[target.airport] && target.airport !== live().selectedAirport) {
          live().openAirport(target.airport);
        }
        // 讓 dataSource／機場改變的 effect 先跑完（它們會改 rangeDays／日期）
        await wait(300);
        if (cancelled) return;

        // 3. 日期（只收這個選取對象有資料的日期；不合法就留在預設日）
        const avail = live().availableDates;
        const tl = live().timeline;
        const cmp = (target.compare ?? []).filter((d) => avail.includes(d));
        if (target.date && avail.includes(target.date) && target.date !== tl.selectedDate) tl.setSelectedDate(target.date);
        if (cmp.length > 0) {
          for (const d of cmp) tl.toggleMultiDate(d);
        } else if (target.days && [1, 3, 7].includes(target.days) && target.days !== tl.rangeDays) {
          tl.setRangeDays(target.days);
        }
        await wait(500);
      }

      // 4. 等資料載完（同時涵蓋「無參數進站」的首次載入與自動播放）
      await waitSettled(90000);
      if (cancelled) return;

      if (hasTarget) {
        // 5. 篩選、配色、染色
        if (target.depArr) setDepArrFilter(target.depArr);
        if (target.theme) live().handleColorThemeChange(target.theme);
        if (target.colorBy === "deparr" && live().depArrDisabledReason === null) live().handleTrajColorByChange("deparr");

        // 6. 播放時刻：有 t ＝ 暫停在該時刻（自動播放已在載完時觸發，這裡蓋掉）
        if (target.time) {
          const tl = live().timeline;
          tl.pause();
          tl.seek(tl.windowStart + target.time.dayOffset * 86400 + target.time.minutes * 60);
        }

        // 7. 鏡頭：在機場／組合／區域的預設飛行之後套用（先 stop 掉還在飛的動畫）
        const map = mapRef.current;
        if (target.camera && map) {
          map.stop();
          map.jumpTo({
            center: [target.camera.lng, target.camera.lat],
            zoom: target.camera.zoom,
            pitch: target.camera.pitch,
            bearing: target.camera.bearing,
          });
        }

        // 8. 選取的航班：資料裡找得到才開航班卡
        if (target.flight && live().allFlights.some((f) => f.fr24_id === target.flight)) {
          setFlightCardId(target.flight);
        }
      }
      setUrlWriteEnabled(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // 寫回網址：套用序列完成後才開始（否則首載前的中間狀態會弄髒網址）。
  // 鏡頭與其他狀態拆兩個 effect：播放中 currentTime 10 Hz 更新，若共用 debounce 鏡頭永遠寫不出去。
  const urlBuildRef = useRef<() => string>(() => "");
  const writeUrlNow = useCallback(() => {
    const search = urlBuildRef.current();
    if (search === window.location.search) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  }, []);
  const urlTimeKey = timeline.playing ? -1 : timeline.currentTime;
  useEffect(() => {
    if (!urlWriteEnabled) return;
    const id = setTimeout(writeUrlNow, 150);
    return () => clearTimeout(id);
  }, [
    urlWriteEnabled, writeUrlNow, dataSource, scope, region, selectedAirport, airportSet, setName,
    timeline.selectedDate, timeline.rangeDays, timeline.selectedDates, timeline.playing, urlTimeKey,
    depArrFilter, trajColorBy, depArrDisabledReason, colorThemeKey, flightCardId, selectedFlightId, trackMode,
  ]);
  useEffect(() => {
    if (!urlWriteEnabled) return;
    const id = setTimeout(writeUrlNow, 500);
    return () => clearTimeout(id);
  }, [urlWriteEnabled, writeUrlNow, cameraInfo]);

  // ── 左下圖說內容 ──
  const captionCode = airportSet !== null
    ? setName ?? "自訂組合"
    : scope === "region" ? REGION_CONFIG[region].label : selectedAirport;
  const captionName = airportSet !== null
    ? `${airportSet.length} 座機場`
    : scope === "region"
      ? regionTitle
      : airportMeta[selectedAirport]?.nameZh || airportMeta[selectedAirport]?.name || getAirportInfo(selectedAirport)?.name || "";
  // 首次進站 availableDates 未到時 timeline 暫用今天；圖說改顯示 loader 實際在載的日期
  const captionDate = availableDates.length === 0 ? (airspaceDate ?? timeline.selectedDate) : timeline.selectedDate;
  const captionMeta: CaptionMetaItem[] = [
    {
      label: `${captionDate} 週${"日一二三四五六"[new Date(`${captionDate}T00:00:00Z`).getUTCDay()] ?? ""}`
        + (timeline.rangeDays > 1 ? ` +${timeline.rangeDays - 1}d` : "")
        + (timeline.isMultiDateMode ? ` · Compare ${timeline.selectedDates.length} 日` : "")
        + " · 台灣時間",
    },
    { value: finalFlights.length.toLocaleString(), unit: "班" },
    ...(airportSet !== null || scope !== "region"
      ? [
          { label: "進場", value: captionCounts.arr.toLocaleString() },
          { label: "離場", value: captionCounts.dep.toLocaleString() },
        ]
      : []),
    ...(loadingProgress ? [{ label: "載入中", value: loadingProgress.loaded.toLocaleString() }] : []),
  ];

  // 狀態條的載入對象：機場／組合／區域 · 日期（R9：不露 region key 等內部代號）
  // 日期取 loader 實際在載的那份（airspaceDate 等），不是 timeline 的：首次進站 availableDates
  // 還沒到時 timeline 暫用今天，但 loader 載的是預設日（見上方「同步 timeline 日期給 loader」）
  const statusLabel = `${captionCode} · `
    + (airspaceSelectedDates.length > 0
      ? `${airspaceSelectedDates.length} 日`
      : `${airspaceDate ?? timeline.selectedDate}${airspaceRangeDays > 1 ? ` +${airspaceRangeDays - 1}d` : ""}`);

  // 範圍切換（設定面板）與 Region chip（探索面板）；網址套用（P6）也走這兩個
  const handleScopeChange = (s: Scope) => {
    setScope(s);
    if (s === "airport") {
      // 切回單一機場 scope → 退出組合模式
      exitSetMode();
    }
    if (s === "region") {
      const cam = REGION_CONFIG[region].regionCamera ?? REGION_CONFIG[region].camera;
      mapRef.current?.flyTo({ ...cam, duration: 2000 });
    }
  };
  const handleRegionSelect = (r: Region) => {
    setRegion(r);
    setScope("airport");
    const cfg = REGION_CONFIG[r];
    if (cfg.defaultAirport) selectAirportSingle(cfg.defaultAirport);
    // 日期：切機場後由「機場改變」effect 處理（目前日期不可用才跳 preferredDate）
    // 飛到預設機場視角
    mapRef.current?.flyTo({ ...cfg.camera, duration: 2000 });
  };

  // P6 網址套用時讀「最新」的 state 與 handler（套用是跨多次 render 的非同步序列）
  urlLiveRef.current = {
    loading, airportCatalog, airportMeta, hasFused, availableDates,
    dataSource, scope, region, selectedAirport, airportSet,
    airspaceDate, airspaceRangeDays, airspaceSelectedDates, timeline,
    depArrDisabledReason, allFlights,
    openAirport, applySavedSet, handleRegionSelect, handleScopeChange,
    handleTrajColorByChange, handleColorThemeChange,
  };

  // ── P6 網址記住狀態：狀態變動寫回網址（R8，只寫與預設不同的值）──
  // 單機場模式的「預設鏡頭」= 機場 preset；組合（fitBounds）與區域沒有穩定參照，鏡頭一律寫。
  const buildUrlSearch = (): string => {
    const st: UrlState = {};
    let defaultCamera: UrlState["camera"];
    if (dataSource === "fused") {
      st.dataSource = "airspace";
      st.scope = region;
    } else if (airportSet !== null && airportSet.length > 0) {
      const builtin = BUILTIN_SETS.find((b) => b.shortName === setName
        && b.icaos.length === airportSet.length && b.icaos.every((i) => airportSet.includes(i)));
      if (builtin) st.setId = builtin.id;
      else st.setIcaos = airportSet;
    } else if (scope === "region" && airportSet === null) {
      st.scope = region;
    } else {
      st.airport = selectedAirport;
      defaultCamera = { lat: preset.center[1], lng: preset.center[0], zoom: preset.zoom, pitch: preset.pitch, bearing: preset.bearing };
    }
    st.date = timeline.selectedDate;
    if (timeline.isMultiDateMode) st.compare = [...new Set(timeline.selectedDates)].sort();
    else st.days = timeline.rangeDays;
    st.depArr = depArrFilter;
    if (depArrActive) st.colorBy = "deparr";
    st.theme = colorThemeKey;
    // 有 t ＝ 暫停在該時刻；播放中不寫（不每幀改網址）
    if (!timeline.playing) {
      const rel = Math.max(0, Math.floor(timeline.currentTime - timeline.windowStart));
      st.time = { minutes: Math.floor((rel % 86400) / 60), dayOffset: Math.floor(rel / 86400) };
    }
    const map = mapRef.current;
    if (map) {
      const c = map.getCenter();
      st.camera = { lat: c.lat, lng: c.lng, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
    }
    const flight = trackMode === "single" && selectedFlightId ? selectedFlightId : flightCardId;
    if (flight) st.flight = flight;
    return buildSearch(encodeUrlState(st, { defaultCamera }));
  };
  urlBuildRef.current = buildUrlSearch;

  // 工具列「複製連結」：當下現算（鏡頭 debounce 可能還沒寫回），同時更新網址列
  const handleCopyLink = async (): Promise<boolean> => {
    const search = buildUrlSearch();
    const path = `${window.location.pathname}${search}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", path);
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // clipboard API 不可用（非安全來源等）→ 退回 execCommand
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  };

  return (
    <ThemeProvider isDark={isDarkTheme}>
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <MapView
        preset={preset}
        styleUrl={styleUrl}
        pureBlack={mapStyleId === "black"}
        flights={finalFlights}
        renderMode={renderMode}
        airportOpacity={airportOpacity}
        airportGlow={airportGlow}
        trailLineWidth={trailLineWidth}
        isDarkTheme={isDarkTheme}
        showTrails={showTrails}
        atlasVisible={atlasVisible}
        compareColorMap={perFlightColorMap}
        gradientColorMap={depArrColoring?.gradients}
        onMapReady={handleMapReady}
      />

      {/* ── 拍攝模式 vignette + 標題 ── */}
      {captureMode && (
        <>
          {/* 暗角 vignette — 錄製中由 composite canvas 繪製 */}
          {!isExporting && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: Z.panel,
                pointerEvents: "none",
                background:
                  CAP.vignette,
              }}
            />
          )}
          {/* 左上標題 — 錄製中由 composite canvas 繪製，HTML 版隱藏。字級 28/18/14/14 與 useCanvasRecorder 的錄影畫面一致（錄影內容，不屬 chrome 字級階層，刻意不換 SIZE） */}
          {!isExporting && (
            <div
              style={{
                position: "absolute",
                top: isMobile ? 16 : 32,
                left: isMobile ? 16 : 32,
                zIndex: Z.toolbar,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? 20 : 28,
                  fontFamily: FONT.ui,
                  fontWeight: 700,
                  color: CAP.title,
                  letterSpacing: isMobile ? 2 : 4,
                  textShadow: CAP.titleShadow,
                }}
              >
                {airportSet !== null ? selectionTitle : regionTitle}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontFamily: FONT.ui,
                  fontWeight: 600,
                  color: CAP.code,
                  letterSpacing: 2,
                  marginTop: 6,
                  textShadow: CAP.codeShadow,
                }}
              >
                {selectionCodeLabel}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontFamily: FONT.ui,
                  color: CAP.time,
                  letterSpacing: 1,
                  marginTop: 4,
                  textShadow: CAP.softShadow,
                }}
              >
                {new Date(timeline.currentTime * 1000).toLocaleString("zh-TW", {
                  timeZone: "Asia/Taipei",
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontFamily: FONT.ui,
                  color: CAP.coord,
                  letterSpacing: 1,
                  marginTop: 4,
                  textShadow: CAP.softShadow,
                }}
              >
                {cameraInfo.lat}, {cameraInfo.lng} z{cameraInfo.zoom} pitch {cameraInfo.pitch} bearing {cameraInfo.bearing}
              </div>
              {/* Trail 模式切換 — 放在標題欄內，座標行換行時也不會貼上來；錄製中隨標題一起隱藏 */}
              <div style={{ marginTop: SPACE.s12, pointerEvents: "auto", display: "flex" }}>
                <Button
                  onClick={() => setTrailDisplay(d => d === "full" ? "progressive" : "full")}
                  pressed={trailDisplay === "progressive"}
                >
                  Trail: {trailDisplay === "full" ? "Full" : "Progressive"}
                </Button>
              </div>
            </div>
          )}
          {/* 鏡頭控制列 — HTML overlay 不會被錄進影片 */}
          <CinemaBar
              isDarkTheme={isDarkTheme}
              cinemaMode={cinema.cinemaMode}
              onCinemaModeChange={cinema.setCinemaMode}
              orbitSpeed={cinema.orbitSpeed}
              onOrbitSpeedChange={cinema.setOrbitSpeed}
              orbitDirection={cinema.orbitDirection}
              onOrbitDirectionChange={cinema.setOrbitDirection}
              keyframes={cinema.keyframes}
              cinemaPhase={cinema.cinemaPhase}
              onAddKeyframe={cinema.addKeyframe}
              onRemoveKeyframe={cinema.removeKeyframe}
              onUpdateKeyframe={cinema.updateKeyframe}
              onMoveKeyframe={cinema.moveKeyframe}
              onPreviewKeyframe={cinema.previewKeyframe}
              onPlaySequence={cinema.playSequence}
              onStopSequence={cinema.stopSequence}
              sequenceProgress={cinema.sequenceProgress}
              currentKfIndex={cinema.currentKfIndex}
              onRecaptureKeyframe={cinema.recaptureKeyframe}
              loop={cinema.loop}
              onLoopChange={cinema.setLoop}
              pingpong={cinema.pingpong}
              onPingpongChange={cinema.setPingpong}
              totalDuration={cinema.totalDuration}
              savedSequences={cinema.savedSequences}
              onSaveSequence={cinema.saveSequence}
              onLoadSequence={cinema.loadSequence}
              onDeleteSequence={cinema.deleteSequence}
              onExportJSON={cinema.exportSequenceJSON}
              onImportJSON={cinema.importSequenceJSON}
              recordingState={recorder.recordingState}
              recordingTime={recorder.recordingTime}
              onStartRecording={handleStartRecording}
              onStopRecording={recorder.stopRecording}
              onStartHQExport={handleStartHQExport}
              onStopHQExport={recorder.stopHQExport}
              hqProgress={recorder.hqProgress}
            />
          {/* 退出按鈕 — 錄製中隱藏，避免誤按中斷 */}
          {!isExporting && (
            <Button
              onClick={() => setCaptureMode(false)}
              ariaLabel="離開錄影"
              icon={isMobile ? <IconClose size={14} /> : undefined}
              style={isMobile
                ? { position: "absolute", top: 16, right: 16, zIndex: Z.toolbar, width: 36, height: 36 }
                : { position: "absolute", bottom: 32, right: 32, zIndex: Z.toolbar }}
            >
              {isMobile ? null : "ESC"}
            </Button>
          )}
          {/* 攝影輔助框（HTML overlay，不會被錄進影片） */}
          <RecordingGuide visible={showGuide} showGrid={showGuideGrid} />
          {/* 輔助框切換按鈕 */}
          {!isExporting && (
            <div style={{
              position: "absolute",
              top: isMobile ? 16 : 32,
              right: isMobile ? 16 + 36 + SPACE.s6 : 32, // 手機：讓出右上角的離開鈕
              zIndex: Z.toast,
              display: "flex",
              gap: SPACE.s6,
            }}>
              <Button pressed={showGuide} onClick={() => setShowGuide(g => !g)}>16:9</Button>
              {showGuide && (
                <Button pressed={showGuideGrid} onClick={() => setShowGuideGrid(g => !g)}>Grid</Button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── 一般模式 UI ── */}
      {!captureMode && !isMobile && (
        <>
          {/* Icon Rail Sidebar */}
          <IconRailSidebar
            activePanel={railPanel}
            onActivePanelChange={setRailPanel}
            displayMode={displayMode}
            mapStyleId={mapStyleId}
            altExaggeration={altExaggeration}
            altOffset={altOffset}
            staticOpacity={staticOpacity}
            orbScale={orbScale}
            airportOpacity={airportOpacity}
            airportGlow={airportGlow}
            trailLineWidth={trailLineWidth}
            farView={farView}
            onFarViewChange={setFarView}
            farViewBoost={farViewBoost}
            onFarViewBoostChange={setFarViewBoost}
            onDisplayModeChange={setDisplayMode}
            onAltExaggerationChange={setAltExaggeration}
            onAltOffsetChange={setAltOffset}
            onStaticOpacityChange={setStaticOpacity}
            onOrbScaleChange={setOrbScale}
            onAirportOpacityChange={setAirportOpacity}
            onAirportGlowChange={setAirportGlow}
            onTrailLineWidthChange={setTrailLineWidth}
            viewshedOpacity={viewshedOpacity}
            onViewshedOpacityChange={setViewshedOpacity}
            viewshedSharpness={viewshedSharpness}
            onViewshedSharpnessChange={setViewshedSharpness}
            scope={scope}
            region={region}
            trackMode={trackMode}
            timeWindow={timeWindow}
            pickableFlights={pickableFlights}
            selectedFlightId={selectedFlightId}
            onScopeChange={handleScopeChange}
            onTrackModeChange={setTrackMode}
            onTimeWindowChange={setTimeWindow}
            onFlightSelect={setSelectedFlightId}
            airports={airports}
            airportCatalog={airportCatalog}
            airportMeta={airportMeta}
            selectedAirport={selectedAirport}
            onAirportChange={openAirport}
            onLocationJump={(icao) => {
              const m = airportMeta[icao];
              const cam = cameraForAirport(
                icao,
                m ? { lat: m.lat, lng: m.lng, name: m.name, flights: airportCatalog[icao]?.flights } : undefined,
              );
              if (cam && mapRef.current) {
                mapRef.current.flyTo({
                  center: cam.center,
                  zoom: cam.zoom,
                  pitch: cam.pitch,
                  bearing: cam.bearing,
                  duration: 2000,
                });
              } else if (!cam) {
                console.warn(`[LocationJump] 找不到 ${icao} 的座標，略過`);
              }
            }}
            onSceneSelect={(scene: ScenePreset) => {
              // 資料來源 & 範圍（跳過 dataSource useEffect 的自動設定）
              prevDataSourceRef.current = scene.dataSource;
              setDataSource(scene.dataSource);
              setScope(scene.scope);
              if (scene.airport) selectAirportSingle(scene.airport);
              else exitSetMode();
              if (scene.opacity != null) setStaticOpacity(scene.opacity);
              // 把 scene 的舊 aircraftFilter 翻譯成 multi-select set
              setFlightFilters((prev) => ({
                ...prev,
                aircraftTypes: aircraftFilterKeyToSet(scene.aircraftFilter),
              }));
              // 時間軸：計算 seek 目標（台灣 UTC+8）
              const seekUnix = timeToUnixTW(scene.date, scene.time);
              const dateChanged = timeline.selectedDate !== scene.date || timeline.rangeDays !== scene.rangeDays;
              if (dateChanged) {
                // 日期會變 → deferred seek（等 windowStart/windowEnd 更新後自動 seek）
                timeline.seekDeferred(seekUnix);
                timeline.setRangeDays(scene.rangeDays);
                timeline.setSelectedDate(scene.date);
              } else {
                // 日期不變 → 直接 seek
                timeline.seek(seekUnix);
              }
              // Camera
              mapRef.current?.flyTo({
                center: scene.camera.center,
                zoom: scene.camera.zoom,
                pitch: scene.camera.pitch,
                bearing: scene.camera.bearing,
                duration: 2000,
              });
            }}
            selectedDate={timeline.selectedDate}
            summaryFlights={finalFlights}
            rangeDays={timeline.rangeDays}
            statsAllFlights={allFlights}
            onStatsSelectAirport={openAirport}
            onStatsSelectFlight={(id) => {
              startTracking(id);
              setRailPanel(null);
            }}
            onCaptureClick={() => setCaptureMode(true)}
            showTerminator={showTerminator}
            onTerminatorChange={setShowTerminator}
            colorThemeKey={colorThemeKey}
            onColorThemeChange={handleColorThemeChange}
            colorThemeOverride={colorThemeOverride}
            onColorThemeOverride={handleColorThemeOverride}
            airspaceSettings={airspaceSettings}
            onAirspaceSettingsChange={setAirspaceSettings}
            colorBy={colorBy}
            onColorByChange={handleColorByChange}
            airportAssignment={airportAssignment}
            airportColorOverrides={airportColorOverrides}
            onAirportColorOverride={(icao, hex) => {
              setAirportColorOverrides((prev) => {
                const next = { ...prev };
                if (hex) next[icao] = hex;
                else delete next[icao];
                return next;
              });
            }}
            onAirportColorReset={() => setAirportColorOverrides({})}
            compareModeActive={timeline.isMultiDateMode}
            airportSet={airportSet}
            setName={setName}
            savedSets={BUILTIN_SETS}
            onApplySet={applySavedSet}
            onToggleAirportInSet={toggleAirportInSet}
            onClearSet={clearSet}
            onExitSetMode={exitSetMode}
            analysisFilteredFlights={finalFlights}
            analysisPreFilterFlights={displayedFlights}
            analysisColorBy={analysisColorBy}
            onAnalysisColorByChange={handleAnalysisColorByChange}
            flightFilters={flightFilters}
            onFlightFiltersChange={setFlightFilters}
            scaleByAircraftSize={scaleByAircraftSize}
            onScaleByAircraftSizeChange={setScaleByAircraftSize}
            atlasVisible={atlasVisible}
            onAtlasVisibleChange={setAtlasVisible}
            atlasEverEnabled={atlasEverEnabled}
            atlasGlowVisible={atlasGlowVisible}
            onAtlasGlowVisibleChange={setAtlasGlowVisible}
            atlasColorMode={atlasColorMode}
            onAtlasColorModeChange={setAtlasColorMode}
            atlasGlowSize={atlasGlowSize}
            onAtlasGlowSizeChange={setAtlasGlowSize}
            onExploreOpen={() => mapRef.current?.flyTo({ ...EXPLORE_OVERVIEW_CAMERA, duration: 2000 })}
            dataSource={dataSource}
            hasFused={hasFused}
            onDataSourceChange={setDataSource}
            regions={REGION_ORDER.map((r) => ({ id: r, label: REGION_CONFIG[r].label }))}
            onRegionSelect={handleRegionSelect}
          />

          {/* 左下圖說：在看什麼（機場／組合、日期、班數、進離場）+ 進站引導（Q6） */}
          <div
            style={{
              position: "absolute",
              left: LAYOUT.panelLeft + SPACE.s8,
              bottom: LAYOUT.mapBottomInset,
              zIndex: Z.mapOverlay,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: SPACE.s12,
              pointerEvents: "none",
            }}
          >
            <Caption
              code={captionCode}
              name={captionName}
              meta={captionMeta}
              notice={!loading && !loadingProgress && !loadError && displayedFlights.length === 0 ? "此日期範圍無航班資料" : undefined}
              onExit={airportSet ? exitSetMode : undefined}
              exitLabel="退出組合模式"
              actions={railPanel === null ? (
                <>
                  <Button onClick={() => setRailPanel("sets")}>選機場</Button>
                  <Button
                    onClick={() => {
                      setRailPanel("atlas");
                      mapRef.current?.flyTo({ ...EXPLORE_OVERVIEW_CAMERA, duration: 2000 });
                    }}
                  >
                    全部機場
                  </Button>
                </>
              ) : undefined}
              style={{ maxWidth: 520 }}
            />
            {/* 時間軸膠囊（R4；底邊 = mapBottomInset，與 dock 共用，R5） */}
            <Timeline
              playing={timeline.playing}
              speed={timeline.speed}
              progress={timeline.progress}
              currentTime={timeline.currentTime}
              windowStart={timeline.windowStart}
              windowEnd={timeline.windowEnd}
              selectedDate={timeline.selectedDate}
              rangeDays={timeline.rangeDays}
              availableDates={availableDates}
              fullDates={fullDates}
              dateCounts={selectionDateCounts ?? airportDateCounts ?? undefined}
              selectedDates={timeline.selectedDates}
              isMultiDateMode={timeline.isMultiDateMode}
              subjectLabel={captionCode}
              hourBins={hourBins}
              onToggle={timeline.toggle}
              onSpeedChange={timeline.setSpeed}
              onSeekByProgress={timeline.seekByProgress}
              onSeek={timeline.seek}
              onDateShift={timeline.shiftDate}
              onDateSelect={timeline.setSelectedDate}
              onRangeDaysChange={timeline.setRangeDays}
              onToggleMultiDate={timeline.toggleMultiDate}
              onClearMultiDates={timeline.clearMultiDates}
            />
          </div>

          {/* 左上：字標 + 相機 HUD */}
          <Brand cameraInfo={cameraInfo} />

          {/* 右下 dock：方位球 + 點擊資訊卡（R1、R5） */}
          <Dock>
            <DockItem align="end">
              <OrientationOrb
                bearing={cameraInfo.bearing}
                pitch={cameraInfo.pitch}
                isDarkTheme={isDarkTheme}
                onReset={() => {
                  mapRef.current?.easeTo({
                    bearing: 0,
                    pitch: 0,
                    duration: 800,
                  });
                }}
              />
            </DockItem>
            {cardFlight && (
              <DockItem>
                <FlightInfoCard
                  flight={cardFlight}
                  currentTime={timeline.currentTime}
                  tracking={trackMode === "single" && selectedFlightId === cardFlight.fr24_id}
                  onTrack={() => startTracking(cardFlight.fr24_id)}
                  onStopTrack={stopTracking}
                  onClose={closeFlightCard}
                />
              </DockItem>
            )}
            {airspaceSelection && (
              <DockItem>
                <AirspaceInfoCard
                  selected={airspaceSelection.selected}
                  others={airspaceSelection.others}
                  onSelect={(f) => {
                    setAirspaceSelection((prev) => {
                      if (!prev) return { selected: f, others: [] };
                      const others = [prev.selected, ...prev.others].filter((o) => o.id !== f.id);
                      return { selected: f, others };
                    });
                  }}
                  onClose={() => setAirspaceSelection(null)}
                  isDarkTheme={isDarkTheme}
                />
              </DockItem>
            )}
          </Dock>

          {/* 右上唯一工具列（R3） */}
          <Toolbar
            depArrFilter={depArrFilter}
            onDepArrChange={setDepArrFilter}
            trajColorBy={trajColorBy}
            onTrajColorByChange={handleTrajColorByChange}
            depArrColorDisabledReason={depArrDisabledReason}
            renderMode={renderMode}
            onRenderModeChange={setRenderMode}
            mapStyleId={mapStyleId}
            onMapStyleChange={setMapStyleId}
            onCapture={() => setCaptureMode(true)}
            onInfo={() => setShowInfo(true)}
            onCopyLink={handleCopyLink}
          />

        </>
      )}

      {/* ── 手機版 UI ── */}
      {!captureMode && isMobile && (
        <>
          {/* Compact Header */}
          <MobileHeader
            airports={airports}
            selectedAirport={selectedAirport}
            onAirportChange={selectAirportSingle}
            renderMode={renderMode}
            onRenderModeChange={setRenderMode}
            onCapture={() => setCaptureMode(true)}
            onInfo={() => setShowInfo(true)}
            onCopyLink={handleCopyLink}
          />

          {/* Timeline 固定在 header 下方 */}
          <div
            ref={mobileTimelineRef}
            style={{
              position: "absolute",
              top: `calc(${MOBILE_HEADER_HEIGHT}px + env(safe-area-inset-top, 0px))`,
              left: 0,
              right: 0,
              zIndex: Z.mapOverlay,
              padding: `${SPACE.s8}px ${SPACE.s12}px`,
              pointerEvents: "none",
            }}
          >
            <Timeline
              playing={timeline.playing}
              speed={timeline.speed}
              progress={timeline.progress}
              currentTime={timeline.currentTime}
              windowStart={timeline.windowStart}
              windowEnd={timeline.windowEnd}
              selectedDate={timeline.selectedDate}
              rangeDays={timeline.rangeDays}
              availableDates={availableDates}
              fullDates={fullDates}
              dateCounts={selectionDateCounts ?? airportDateCounts ?? undefined}
              selectedDates={timeline.selectedDates}
              isMultiDateMode={timeline.isMultiDateMode}
              subjectLabel={captionCode}
              hourBins={hourBins}
              fixedExpanded
              onToggle={timeline.toggle}
              onSpeedChange={timeline.setSpeed}
              onSeekByProgress={timeline.seekByProgress}
              onSeek={timeline.seek}
              onDateShift={timeline.shiftDate}
              onDateSelect={timeline.setSelectedDate}
              onRangeDaysChange={timeline.setRangeDays}
              onToggleMultiDate={timeline.toggleMultiDate}
              onClearMultiDates={timeline.clearMultiDates}
            />
          </div>

          {/* Bottom Sheet */}
          <MobileBottomSheet isLandscape={isLandscape}>
            {(level) => (
              <>
                {/* half: FlightPicker + Stats */}
                {(level === "half" || level === "full") && (
                  <div style={{ marginTop: SPACE.s4 }}>
                    <div style={{ display: "flex", gap: SPACE.s6, marginBottom: SPACE.s8, flexWrap: "wrap" }}>
                      <Segmented<DisplayMode>
                        ariaLabel="顯示模式"
                        options={[
                          { value: "trails", label: "Flight Trails" },
                          { value: "status", label: "Live Status" },
                        ]}
                        value={displayMode}
                        onChange={setDisplayMode}
                      />
                      <Segmented<DataSource>
                        ariaLabel="資料來源"
                        options={[
                          { value: "api", label: "航線軌跡" },
                          { value: "fused", label: "空域快照", disabled: !hasFused },
                        ]}
                        value={dataSource}
                        onChange={setDataSource}
                      />
                      <Segmented<DepArrFilter>
                        ariaLabel="起降"
                        options={[
                          { value: "all", label: "全部" },
                          { value: "arr", label: "進場" },
                          { value: "dep", label: "離場" },
                        ]}
                        value={depArrFilter}
                        onChange={setDepArrFilter}
                      />
                    </div>
                    <FlightPicker
                      flights={pickableFlights}
                      scope={scope}
                      trackMode={trackMode}
                      selectedFlightId={selectedFlightId}
                      onScopeChange={setScope}
                      onTrackModeChange={setTrackMode}
                      onFlightSelect={setSelectedFlightId}
                    />
                    <SheetNote>
                      {finalFlights.length} flights
                      {scope === "region" && ` (${REGION_CONFIG[region].label})`}
                    </SheetNote>
                  </div>
                )}

                {/* full: Sliders + StyleSelector */}
                {level === "full" && (
                  <div style={{ marginTop: SPACE.s12, paddingBottom: SPACE.s12, display: "flex", flexDirection: "column", gap: SPACE.s12 }}>
                    <Select<string>
                      label="Style"
                      ariaLabel="底圖"
                      options={MAP_STYLES.map((m) => ({ value: m.id, label: m.name }))}
                      value={mapStyleId}
                      onChange={setMapStyleId}
                    />
                    {[
                      { label: "Alt", fmt: (v: number) => `×${v.toFixed(1)}`, min: 1, max: 5, step: 0.5, value: altExaggeration, set: setAltExaggeration },
                      { label: "Z", fmt: (v: number) => `+${v}m`, min: 0, max: 1000, step: 50, value: altOffset, set: setAltOffset },
                      { label: "Opacity", fmt: (v: number) => v.toFixed(2), min: 0.02, max: 0.5, step: 0.02, value: staticOpacity, set: setStaticOpacity },
                      { label: "Orb", fmt: (v: number) => (v * 100000).toFixed(1), min: 0.000001, max: 0.00001, step: 0.000001, value: orbScale, set: setOrbScale },
                      { label: "APT", fmt: (v: number) => v.toFixed(2), min: 0, max: 0.3, step: 0.01, value: airportOpacity, set: setAirportOpacity },
                      { label: "Glow", fmt: (v: number) => v.toFixed(1), min: 0, max: 2, step: 0.1, value: airportGlow, set: setAirportGlow },
                    ].map((sl) => (
                      <Slider
                        key={sl.label}
                        label={sl.label}
                        format={sl.fmt}
                        min={sl.min}
                        max={sl.max}
                        step={sl.step}
                        value={sl.value}
                        onChange={sl.set}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </MobileBottomSheet>
        </>
      )}

      {/* 載入狀態條（R6）：單一實例跨模式。桌機＝工具列下方；手機＝header＋時間軸下方、右 10；
          錄影畫面＝只顯示失敗（角落精簡），錄影中（REC／HQ 匯出）不畫 */}
      <LoadingStatus
        loading={loading}
        label={statusLabel}
        count={allFlights.length}
        loaded={loadingProgress?.loaded}
        playing={timeline.playing}
        failed={loadError !== null}
        onRetry={retryLoad}
        top={captureMode ? CAPTURE_STATUS_TOP : isMobile ? mobileStatusTop : undefined}
        right={captureMode ? (isMobile ? SPACE.s16 : SPACE.s24 + SPACE.s8) : isMobile ? MOBILE_STATUS_RIGHT : undefined}
        failOnly={captureMode}
        hidden={captureMode && isExporting}
      />

      {/* ── 點擊處的選取圈（R1；固定在點擊位置，相機一動就收）── */}
      {!captureMode && selectionRing && cardFlight && <SelectionRing x={selectionRing.x} y={selectionRing.y} />}

      {/* ── 手機版航班卡（取代舊游標 tooltip；版面不重排，固定在時間軸底邊之下、與手機狀態條同一算法）── */}
      {!captureMode && isMobile && cardFlight && (
        <div style={{ position: "absolute", top: mobileStatusTop, right: SPACE.s12, zIndex: Z.panel, maxWidth: `calc(100vw - ${SPACE.s12 * 2}px)` }}>
          <FlightInfoCard
            flight={cardFlight}
            currentTime={timeline.currentTime}
            tracking={trackMode === "single" && selectedFlightId === cardFlight.fr24_id}
            onTrack={() => startTracking(cardFlight.fr24_id)}
            onStopTrack={stopTracking}
            onClose={closeFlightCard}
          />
        </div>
      )}

      {/* ── Info Modal ── */}
      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} isMobile={isMobile} />

    </div>
    </ThemeProvider>
  );
}
