import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { type Map as MapboxMap } from "mapbox-gl";
import type { Scope, TrackMode, RenderMode, DisplayMode, DataSource, Flight, Region, TrailDisplay, SavedAirportSet } from "./types";
import { computeFitBoundsForSet } from "./map/fitBoundsForSet";
import { BUILTIN_SETS } from "./map/savedSets";
import type { FlightScene } from "./three/FlightScene";
import { MapView, ATLAS_LAYER } from "./map/MapView";
import { useFlightData } from "./hooks/useFlightData";
import { useTimeline } from "./hooks/useTimeline";
import { useIsMobile } from "./hooks/useIsMobile";
import { CAMERA_PRESETS, getPresetByIcao, getAirportInfo, cameraForAirport } from "./map/cameraPresets";
import { loadAirportMeta, type AirportMeta } from "./data/airportMeta";
import { createFlightLayer } from "./map/customLayer";
import { createAtlasGlowLayer, ATLAS_GLOW_LAYER_ID, type AtlasColorMode } from "./map/atlasGlowLayer";
import { createAirspaceLayer } from "./map/airspaceAurora";
import { addMedianLineLayer, removeMedianLineLayer, setMedianLineVisibility, setMedianLineTheme } from "./map/medianLine";
import { defaultAirspaceSettings, type AirspaceSettings } from "./types/airspace";
import { getCachedAirspace, type AirspaceFeature } from "./data/airspaceLoader";
import { pickAirspace } from "./map/airspacePicker";
import { AirspaceInfoCard } from "./components/AirspaceInfoCard";
import { filterByAirport } from "./data/flightLoader";
import { timeToUnixTW } from "./utils/dateUtils";
import { LoadingScreen } from "./components/LoadingScreen";
import { AirportSelector } from "./components/AirportSelector";
import { FlightPicker } from "./components/FlightPicker";
import { TimelineControls } from "./components/TimelineControls";
import { StyleSelector, getStyleUrl } from "./components/StyleSelector";
import { MobileBottomSheet } from "./components/MobileBottomSheet";
import { FlightStatsPanel } from "./components/FlightStatsPanel";
import { DataSourceToggle } from "./components/DataSourceToggle";
import { DepArrToggle, type DepArrFilter } from "./components/DepArrToggle";
import { AIRCRAFT_CATEGORIES, type AircraftCategory, type AircraftFilterKey } from "./data/aircraftCategories";
import { type FlightFilters, EMPTY_FILTERS, applyFilters } from "./data/classify";
import { IconRailSidebar, type ScenePreset } from "./components/IconRailSidebar";
import { InfoModal } from "./components/InfoModal";
import { useCinemaCamera } from "./hooks/useCinemaCamera";
import { useCanvasRecorder } from "./hooks/useCanvasRecorder";
import { computeBearing, getViewshedArcPoints, getViewshedRings } from "./map/viewshedOverlay";
import { CinemaBar } from "./components/CinemaBar";
import { RecordingGuide } from "./components/RecordingGuide";
import { COLOR_THEMES, DEFAULT_THEME_KEY } from "./types/colorTheme";
import { assignAirportColors, type AirportColorMode, type AirportAssignment } from "./types/airportColors";
import { computeAnalysisColorMap, type AnalysisColorBy } from "./data/analysisColors";
import { getAircraftInfo, type AircraftCategory as AcCat } from "./data/aircraftDatabase";
import { setMapTrailColors } from "./map/staticTrails";
import { initTerminatorLayer, removeTerminatorLayer } from "./map/terminatorOverlay";

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
const ATLAS_STATUS_META: Record<string, { label: string; color: string }> = {
  complete: { label: "完整資料", color: "#2ecc71" },
  "core-partial": { label: "核心（部分）", color: "#f1c40f" },
  partial: { label: "部分（附帶）", color: "#4a90d9" },
  planned: { label: "僅規劃（未抓）", color: "#8894a3" },
};
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}
function buildAtlasPopupHtml(p: AtlasProps): string {
  const st = ATLAS_STATUS_META[p.status] ?? { label: p.status, color: "#888" };
  const rankLine = p.rank
    ? `Top-1000 排名 #${p.rank}`
    : "非前 1000（被動觸及）";
  const capt =
    p.capturedFlights != null ? `${p.capturedFlights.toLocaleString()} 條` : "—";
  const est = p.estDaily != null ? `${p.estDaily} 班/日（估）` : "—";
  return `<div style="font-family:system-ui,-apple-system,sans-serif;min-width:180px;color:#1a1a1a">
    <div style="font-weight:700;font-size:14px;margin-bottom:2px">${escapeHtml(p.name)}</div>
    <div style="font-size:11px;color:#666;margin-bottom:6px">${p.icao}${p.iata ? " / " + p.iata : ""}${p.country ? " · " + p.country : ""}${p.continent ? " " + p.continent : ""}</div>
    <div style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;margin-bottom:6px">
      <span style="width:9px;height:9px;border-radius:50%;background:${st.color};display:inline-block"></span>${st.label}
    </div>
    <div style="font-size:12px;color:#333;line-height:1.6">${rankLine}<br/>已抓軌跡：${capt}<br/>單日流量：${est}</div>
    ${p.status !== "planned" ? `<button data-atlas-add="${escapeHtml(p.icao)}" style="margin-top:8px;width:100%;padding:6px 8px;border:1px solid #3b82f6;border-radius:6px;background:#eaf3ff;color:#174ea6;font:600 11px monospace;cursor:pointer">+ 加入 Selection</button>` : ""}
  </div>`;
}

function LoadingIndicator({ loadingProgress, isDarkTheme }: {
  loadingProgress: { loaded: number; label: string } | null;
  isDarkTheme: boolean;
}) {
  const [fadeOut, setFadeOut] = useState(false);
  const [visible, setVisible] = useState(false);
  const [lastCount, setLastCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (loadingProgress) {
      setVisible(true);
      setFadeOut(false);
      setLastCount(loadingProgress.loaded);
    } else if (visible) {
      setFadeOut(true);
      timerRef.current = setTimeout(() => setVisible(false), 1200);
    }
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!loadingProgress, loadingProgress?.loaded]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 15,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 28px",
        background: isDarkTheme ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.8)",
        backdropFilter: "blur(12px)",
        borderRadius: 10,
        border: `1px solid ${isDarkTheme ? "rgba(180,60,60,0.6)" : "rgba(180,60,60,0.5)"}`,
        opacity: fadeOut ? 0 : 1,
        transition: "opacity 1s ease-out",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: fadeOut ? "#4a4" : "#c44",
          animation: fadeOut ? "none" : "pulse 1s ease-in-out infinite",
        }}
      />
      <span style={{
        fontSize: 15,
        fontFamily: "monospace",
        fontWeight: 500,
        color: isDarkTheme ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)",
      }}>
        {fadeOut ? `${lastCount} flights loaded` : `Loading ${loadingProgress?.label ?? "..."}` }
      </span>
      <style>{`@keyframes pulse { 0%,100% { opacity:0.3 } 50% { opacity:1 } }`}</style>
    </div>
  );
}

function OrientationOrb({
  bearing,
  pitch,
  isDarkTheme,
  avoidAirspaceCard,
  onReset,
}: {
  bearing: number;
  pitch: number;
  isDarkTheme: boolean;
  avoidAirspaceCard: boolean;
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
  const stroke = isDarkTheme ? "rgba(255,255,255,0.34)" : "rgba(20,30,45,0.35)";
  const dim = isDarkTheme ? "rgba(255,255,255,0.18)" : "rgba(20,30,45,0.16)";
  const text = isDarkTheme ? "rgba(255,255,255,0.82)" : "rgba(20,30,45,0.82)";

  return (
    <button
      type="button"
      onClick={onReset}
      aria-label="恢復北上南下、無傾斜的地球方向"
      title="Reset orientation · North up"
      style={{
        position: "absolute",
        right: avoidAirspaceCard ? 398 : 18,
        bottom: 92,
        zIndex: 12,
        width: 52,
        height: 52,
        padding: 3,
        borderRadius: "50%",
        border: `1px solid ${isUpright ? "rgba(100,170,255,0.65)" : stroke}`,
        background: isDarkTheme
          ? "radial-gradient(circle at 34% 28%, rgba(100,170,255,0.16), rgba(0,0,0,0.55) 66%)"
          : "radial-gradient(circle at 34% 28%, rgba(100,170,255,0.2), rgba(255,255,255,0.7) 66%)",
        boxShadow: isDarkTheme
          ? "0 5px 18px rgba(0,0,0,0.34), inset 0 0 12px rgba(100,170,255,0.08)"
          : "0 5px 18px rgba(30,60,90,0.14), inset 0 0 12px rgba(100,170,255,0.12)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        cursor: "pointer",
        transition: "right 220ms ease, border-color 180ms ease, transform 180ms ease, background 180ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" style={{ display: "block" }}>
        <circle cx="22" cy="22" r="18.5" fill="none" stroke={stroke} strokeWidth="1" />
        <ellipse cx="22" cy="22" rx="17" ry="6" fill="none" stroke={dim} strokeWidth="0.8" />
        <path d="M5 22h34" fill="none" stroke={dim} strokeWidth="0.65" strokeDasharray="1.5 2.5" />
        <line x1={northX} y1={northY} x2={southX} y2={southY} stroke="rgba(100,170,255,0.72)" strokeWidth="1" />
        <circle cx={northX} cy={northY} r="2.5" fill="#64aaff" />
        <circle cx={southX} cy={southY} r="2" fill={isDarkTheme ? "rgba(255,255,255,0.58)" : "rgba(20,30,45,0.52)"} />
        <text x={northLabelX} y={northLabelY} textAnchor="middle" fill="#9acbff" fontSize="6" fontFamily="monospace" fontWeight="700">N</text>
        <text x={southLabelX} y={southLabelY} textAnchor="middle" fill={text} fontSize="5.5" fontFamily="monospace">S</text>
        <circle cx="22" cy="22" r="1.5" fill={isUpright ? "#64aaff" : text} />
      </svg>
    </button>
  );
}

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
  } = useFlightData(
    dataSource,
    scope,
    region,
    airspaceDate,
    airspaceRangeDays,
    airportSet,
    airspaceSelectedDates,
  );
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);

  useEffect(() => {
    if (!loading) setHasCompletedInitialLoad(true);
  }, [loading]);

  // 機場 metadata（座標/名稱/國家，含無 preset 的長尾機場）— 一次性載入，失敗回空物件
  const [airportMeta, setAirportMeta] = useState<Record<string, AirportMeta>>({});
  useEffect(() => {
    loadAirportMeta().then(setAirportMeta);
  }, []);

  const [trackMode, setTrackMode] = useState<TrackMode>("stack");
  const [timeWindow, setTimeWindow] = useState(false);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [mapStyleId, setMapStyleId] = useState("dark");
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
  const [showStats, setShowStats] = useState(false);
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
  const [tooltipInfo, setTooltipInfo] = useState<{ flight: Flight; x: number; y: number; altitude: number | null } | null>(null);
  const [atlasVisible, setAtlasVisible] = useState(false);
  const [atlasGlowVisible, setAtlasGlowVisible] = useState(false);
  const [atlasColorMode, setAtlasColorMode] = useState<AtlasColorMode>("flow");
  const [atlasGlowSize, setAtlasGlowSize] = useState(1.6);
  const [cameraInfo, setCameraInfo] = useState({ lng: 0, lat: 0, zoom: 0, pitch: 0, bearing: 0 });
  const { isMobile, isLandscape } = useIsMobile();

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
  const selectionEyebrow = airportSet
    ? "FLIGHT ARC / NETWORK STUDY"
    : "FLIGHT ARC / AIRPORT VIEW";
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
      const t = f.dep_time || f.path[0]?.[3];
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

  const timeline = useTimeline({ availableDates, preferredDate });

  // 切換機場時：若目前日期不是新機場的完整資料日，跳到該機場的 preferredDate。
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
  const mapRef = useRef<MapboxMap | null>(null);
  const cinema = useCinemaCamera({ map: mapRef.current, active: captureMode });
  const recorder = useCanvasRecorder({ map: mapRef.current });
  const isRecording = recorder.recordingState === "recording";
  const isExporting = isRecording || recorder.recordingState === "hq";

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
    setAirspaceSelectedDates(timeline.selectedDates);
  }, [availableDates, timeline.selectedDate, timeline.rangeDays, timeline.selectedDates]);

  // Airspace Scan 預設：切換時自動設定 All Taiwan、7d、拉遠視角、低 opacity
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
        const t = f.dep_time || f.path[0]?.[3];
        if (!t) return false;
        return timeline.dateWindowStarts.some(
          (start, i) => t >= start && t <= timeline.dateWindowEnds[i]!,
        );
      });
    } else {
      base = base.filter((f) => {
        const t = f.dep_time || f.path[0]?.[3];
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
  const COMPARE_COLORS = ["#4488ff", "#ff4444", "#f5a623", "#44cc88"];
  const compareColorMap = useMemo((): Map<string, string> | undefined => {
    if (!timeline.isMultiDateMode || timeline.dateWindowStarts.length === 0) return undefined;
    const map = new Map<string, string>();
    for (const f of displayedFlights) {
      const t = f.dep_time || f.path[0]?.[3];
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

  // Dep/Arr filter（兼容 single + set）
  const finalFlights = useMemo(() => {
    if (depArrFilter === "all") return setFilteredFlights;
    return setFilteredFlights.filter((f) =>
      depArrFilter === "dep" ? activeIcaoSet.has(f.origin_icao) : activeIcaoSet.has(f.dest_icao)
    );
  }, [setFilteredFlights, depArrFilter, activeIcaoSet]);

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

  // 機場分色指派（依實際顯示的航班 + 使用者手動覆寫）
  const airportAssignment = useMemo((): AirportAssignment | null => {
    if (effectiveColorBy === "theme") return null;
    return assignAirportColors(finalFlights, effectiveColorBy, airportColorOverrides, regionalAirports);
  }, [effectiveColorBy, finalFlights, airportColorOverrides, regionalAirports]);

  // 🔬 Deep Analysis colorMap（按機型/用途/時長/航線/航司分色）
  const analysisColorMap = useMemo(
    () => computeAnalysisColorMap(finalFlights, analysisColorBy),
    [finalFlights, analysisColorBy],
  );

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
  // 優先序：Analysis > Compare > Airport > theme（fallback undefined）
  const perFlightColorMap = useMemo((): Map<string, string> | undefined => {
    if (analysisColorMap && analysisColorMap.size > 0) return analysisColorMap;
    if (compareColorMap) return compareColorMap;
    if (airportAssignment && airportAssignment.flightColors.size > 0) return airportAssignment.flightColors;
    return undefined;
  }, [analysisColorMap, compareColorMap, airportAssignment]);

  const perFlightColorMapRef = useRef(perFlightColorMap);
  perFlightColorMapRef.current = perFlightColorMap;

  // perFlightColorMap 變動時推到 FlightScene（重建靜態 3D mesh + 重上色動態 trail）
  useEffect(() => {
    flightSceneRef.current?.setPerFlightColorMap(perFlightColorMap ?? null);
  }, [perFlightColorMap]);

  const isDarkTheme = !["light", "streets"].includes(mapStyleId);

  const flightsRef = useRef(finalFlights);
  const timeRef = useRef(timeline.currentTime);
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
  timeRef.current = timeline.currentTime;
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
  useEffect(() => {
    mapRef.current?.triggerRepaint();
  }, [
    timeline.currentTime, finalFlights, renderMode, altExaggeration, altOffset,
    staticOpacity, trailLineWidth, airportGlow, orbScale, farView, farViewBoost, isDarkTheme, displayMode, timeWindow, trailDisplay,
    atlasGlowVisible, atlasColorMode, atlasGlowSize, viewshedOpacity, viewshedSharpness,
    colorThemeKey, colorThemeOverride, perFlightColorMap, perFlightScaleMap, airspaceSettings,
  ]);

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
      setCameraInfo({
        lng: +c.lng.toFixed(4),
        lat: +c.lat.toFixed(4),
        zoom: +map.getZoom().toFixed(1),
        pitch: +map.getPitch().toFixed(0),
        bearing: +map.getBearing().toFixed(0),
      });
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
          const flight = flightsRef.current.find((f) => f.fr24_id === flightId);
          if (flight) {
            let altitude: number | null = null;
            const t = timeRef.current;
            for (let i = flight.path.length - 1; i >= 0; i--) {
              if (flight.path[i]![3] <= t) { altitude = Math.round(flight.path[i]![2]); break; }
            }
            setTooltipInfo({ flight, x: e.point.x, y: e.point.y, altitude });
            setAirspaceSelection(null);
          }
          return;
        }
        setTooltipInfo(null);
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
          } else {
            setAirspaceSelection(null);
          }
        }
      });

      map.on("dblclick", (e) => {
        const scene = flightSceneRef.current;
        if (!scene) return;
        const container = map.getContainer();
        const flightId = scene.pickFlight(
          e.point.x, e.point.y,
          container.clientWidth, container.clientHeight,
        );
        if (flightId) {
          e.preventDefault();
          setTrackMode("single");
          setSelectedFlightId(flightId);
          setTooltipInfo(null);
        }
      });

      map.on("move", () => setTooltipInfo(null));
    }
  };

  // 航班資料或模式變更時重建 layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    addFlightLayer(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAirport, scope, trackMode, selectedFlightId]);

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
        if (t <= path[0]![3]) {
          lat = path[0]![0]; lng = path[0]![1]; alt = path[0]![2];
          if (path.length > 1) heading = computeBearing(path[0]![0], path[0]![1], path[1]![0], path[1]![1]);
        } else if (t >= path[path.length - 1]![3]) {
          lat = path[path.length - 1]![0]; lng = path[path.length - 1]![1]; alt = path[path.length - 1]![2];
          if (path.length > 1) {
            const n = path.length;
            heading = computeBearing(path[n - 2]![0], path[n - 2]![1], path[n - 1]![0], path[n - 1]![1]);
          }
        } else {
          lat = path[0]![0]; lng = path[0]![1];
          for (let i = 1; i < path.length; i++) {
            if (path[i]![3] >= t) {
              const a = path[i - 1]!;
              const b = path[i]!;
              const r = (t - a[3]) / (b[3] - a[3]);
              lat = a[0] + (b[0] - a[0]) * r;
              lng = a[1] + (b[1] - a[1]) * r;
              alt = a[2] + (b[2] - a[2]) * r;
              heading = computeBearing(a[0], a[1], b[0], b[1]);
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

  // ESC 退出拍攝模式
  useEffect(() => {
    if (!captureMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCaptureMode(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [captureMode]);

  // 資料載入完成後自動播放
  useEffect(() => {
    if (!loading && availableDates.length > 0) {
      timeline.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, availableDates.length]);

  if (!hasCompletedInitialLoad && loading && allFlights.length === 0) {
    return <LoadingScreen />;
  }

  return (
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
                zIndex: 20,
                pointerEvents: "none",
                background:
                  "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.35) 80%, rgba(0,0,0,0.6) 100%)",
              }}
            />
          )}
          {/* 左上標題 — 錄製中由 composite canvas 繪製，HTML 版隱藏 */}
          {!isExporting && (
            <div
              style={{
                position: "absolute",
                top: isMobile ? 16 : 32,
                left: isMobile ? 16 : 32,
                zIndex: 21,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? 20 : 28,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  color: "#fff",
                  letterSpacing: isMobile ? 2 : 4,
                  textShadow: "0 2px 12px rgba(0,0,0,0.6)",
                }}
              >
                {airportSet !== null ? selectionTitle : regionTitle}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontFamily: "monospace",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.7)",
                  letterSpacing: 2,
                  marginTop: 6,
                  textShadow: "0 1px 8px rgba(0,0,0,0.5)",
                }}
              >
                {selectionCodeLabel}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: 1,
                  marginTop: 4,
                  textShadow: "0 1px 6px rgba(0,0,0,0.5)",
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
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.3)",
                  letterSpacing: 1,
                  marginTop: 4,
                  textShadow: "0 1px 6px rgba(0,0,0,0.5)",
                }}
              >
                {cameraInfo.lat}, {cameraInfo.lng} z{cameraInfo.zoom} pitch {cameraInfo.pitch} bearing {cameraInfo.bearing}
              </div>
            </div>
          )}
          {/* Trail 模式切換 — 錄製中隱藏 */}
          {!isExporting && (
            <button
              onClick={() => setTrailDisplay(d => d === "full" ? "progressive" : "full")}
              style={{
                position: "absolute",
                top: isMobile ? 120 : 140,
                left: isMobile ? 16 : 32,
                zIndex: 21,
                padding: "5px 14px",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.2)",
                background: trailDisplay === "progressive" ? "rgba(255,255,255,0.15)" : "rgba(60,60,60,0.4)",
                color: trailDisplay === "progressive" ? "#fff" : "rgba(255,255,255,0.6)",
                fontSize: 13,
                fontFamily: "monospace",
                cursor: "pointer",
                backdropFilter: "blur(8px)",
              }}
            >
              Trail: {trailDisplay === "full" ? "Full" : "Progressive"}
            </button>
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
            <button
              onClick={() => setCaptureMode(false)}
              style={isMobile ? {
                position: "absolute",
                top: 16,
                right: 16,
                zIndex: 21,
                width: 48,
                height: 48,
                borderRadius: 24,
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                fontSize: 22,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(8px)",
              } : {
                position: "absolute",
                bottom: 32,
                right: 32,
                zIndex: 21,
                padding: "4px 12px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 4,
                color: "rgba(255,255,255,0.4)",
                fontSize: 11,
                fontFamily: "monospace",
                cursor: "pointer",
              }}
            >
              {isMobile ? "✕" : "ESC"}
            </button>
          )}
          {/* 攝影輔助框（HTML overlay，不會被錄進影片） */}
          <RecordingGuide visible={showGuide} showGrid={showGuideGrid} />
          {/* 輔助框切換按鈕 */}
          {!isExporting && (
            <div style={{
              position: "absolute",
              top: isMobile ? 16 : 32,
              right: isMobile ? 16 : 32,
              zIndex: 51,
              display: "flex",
              gap: 6,
            }}>
              <button
                onClick={() => setShowGuide(g => !g)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: `1px solid ${showGuide ? "rgba(255,80,80,0.4)" : "rgba(255,255,255,0.15)"}`,
                  background: showGuide ? "rgba(255,80,80,0.15)" : "rgba(255,255,255,0.08)",
                  color: showGuide ? "rgba(255,80,80,0.8)" : "rgba(255,255,255,0.4)",
                  fontSize: 11,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  backdropFilter: "blur(8px)",
                }}
              >
                16:9
              </button>
              {showGuide && (
                <button
                  onClick={() => setShowGuideGrid(g => !g)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    border: `1px solid ${showGuideGrid ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)"}`,
                    background: showGuideGrid ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.08)",
                    color: showGuideGrid ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.4)",
                    fontSize: 11,
                    fontFamily: "monospace",
                    cursor: "pointer",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  Grid
                </button>
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
            isDarkTheme={isDarkTheme}
            displayMode={displayMode}
            renderMode={renderMode}
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
            onDisplayModeChange={(m) => { setDisplayMode(m); setTooltipInfo(null); }}
            onRenderModeChange={setRenderMode}
            onMapStyleChange={setMapStyleId}
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
            onScopeChange={(s) => {
              setScope(s);
              if (s === "airport") {
                // 切回單一機場 scope → 退出組合模式
                exitSetMode();
              }
              if (s === "region") {
                const cam = REGION_CONFIG[region].regionCamera ?? REGION_CONFIG[region].camera;
                mapRef.current?.flyTo({ ...cam, duration: 2000 });
              }
            }}
            onTrackModeChange={setTrackMode}
            onTimeWindowChange={setTimeWindow}
            onFlightSelect={setSelectedFlightId}
            airports={airports}
            airportCatalog={airportCatalog}
            airportMeta={airportMeta}
            selectedAirport={selectedAirport}
            onAirportChange={selectAirportSingle}
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
            availableDates={availableDates}
            fullDates={fullDates}
            dateCounts={selectionDateCounts ?? airportDateCounts ?? undefined}
            selectedDate={timeline.selectedDate}
            onDateSelect={timeline.setSelectedDate}
            summaryFlights={finalFlights}
            rangeDays={timeline.rangeDays}
            onStatsClick={() => setShowStats(true)}
            onCaptureClick={() => setCaptureMode(true)}
            onInfoClick={() => setShowInfo(true)}
            showTerminator={showTerminator}
            onTerminatorChange={setShowTerminator}
            colorThemeKey={colorThemeKey}
            onColorThemeChange={handleColorThemeChange}
            colorThemeOverride={colorThemeOverride}
            onColorThemeOverride={handleColorThemeOverride}
            airspaceSettings={airspaceSettings}
            onAirspaceSettingsChange={setAirspaceSettings}
            colorBy={colorBy}
            onColorByChange={setColorBy}
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
            onAnalysisColorByChange={setAnalysisColorBy}
            flightFilters={flightFilters}
            onFlightFiltersChange={setFlightFilters}
            scaleByAircraftSize={scaleByAircraftSize}
            onScaleByAircraftSizeChange={setScaleByAircraftSize}
            atlasVisible={atlasVisible}
            onAtlasVisibleChange={setAtlasVisible}
            atlasGlowVisible={atlasGlowVisible}
            onAtlasGlowVisibleChange={setAtlasGlowVisible}
            atlasColorMode={atlasColorMode}
            onAtlasColorModeChange={setAtlasColorMode}
            atlasGlowSize={atlasGlowSize}
            onAtlasGlowSizeChange={setAtlasGlowSize}
          />

          {/* 頂部控制列（sidebar 右邊） */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 72,
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ minWidth: 210 }}>
                <div style={{ fontSize: 9, color: "#64aaff", fontFamily: "monospace", letterSpacing: 1.8 }}>
                  {selectionEyebrow}
                </div>
                <h1
                  style={{
                    margin: "2px 0 0",
                    fontSize: 26,
                    color: isDarkTheme ? "#fff" : "#333",
                    fontFamily: "monospace",
                    letterSpacing: 0.5,
                  }}
                >
                  {selectionTitle}
                </h1>
              </div>
              <div
                style={{
                  padding: "4px 8px 4px 10px",
                  background: isDarkTheme ? "rgba(100,170,255,0.14)" : "rgba(59,130,246,0.1)",
                  border: `1px solid ${isDarkTheme ? "rgba(100,170,255,0.36)" : "#3B82F6"}`,
                  borderRadius: 14,
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: isDarkTheme ? "rgba(255,255,255,0.78)" : "#1a1a1a",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
                title={airportSet?.join(", ") ?? selectedAirport}
              >
                <span>{airportSet?.length ?? 1} airport{(airportSet?.length ?? 1) === 1 ? "" : "s"} · {finalFlights.length} flights · {timeline.selectedDate}</span>
                {airportSet && (
                  <button
                    onClick={exitSetMode}
                    style={{
                      width: 16, height: 16, padding: 0, borderRadius: "50%",
                      background: "transparent",
                      border: `1px solid ${isDarkTheme ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}`,
                      color: "inherit",
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, lineHeight: 1,
                    }}
                    title="退出組合模式"
                  >
                    ✕
                  </button>
                )}
              </div>
              <DataSourceToggle
                dataSource={dataSource}
                hasFused={hasFused}
                isDarkTheme={isDarkTheme}
                onChange={setDataSource}
              />
              <DepArrToggle
                filter={depArrFilter}
                isDarkTheme={isDarkTheme}
                onChange={setDepArrFilter}
              />
            </div>
            {/* Region shortcuts only appear while explicitly browsing a region. */}
            {scope === "region" && airportSet === null && <div style={{ display: "flex", gap: 4 }}>
              {(["TW", "JP", "HK", "KR", "TH", "US", "UK", "CN", "world", "all"] as Region[]).map((r) => {
                const isActive = region === r;
                return (
                  <button
                    key={r}
                    onClick={() => {
                      setRegion(r);
                      setScope("airport");
                      const cfg = REGION_CONFIG[r];
                      if (cfg.defaultAirport) selectAirportSingle(cfg.defaultAirport);
                      // 跳到有資料的日期
                      if (cfg.defaultDate) timeline.setSelectedDate(cfg.defaultDate);
                      // 飛到預設機場視角
                      mapRef.current?.flyTo({ ...cfg.camera, duration: 2000 });
                    }}
                    style={{
                      padding: "3px 10px",
                      fontSize: 11,
                      fontFamily: "monospace",
                      fontWeight: isActive ? 600 : 400,
                      letterSpacing: 1,
                      border: `1px solid ${isActive ? "#64aaff" : isDarkTheme ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                      borderRadius: 4,
                      background: isActive ? "rgba(100,170,255,0.2)" : "transparent",
                      color: isActive ? "#fff" : isDarkTheme ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {REGION_CONFIG[r].label}
                  </button>
                );
              })}
            </div>}
          </div>

          {/* 時間軸 */}
          <TimelineControls
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
            isDarkTheme={isDarkTheme}
            onToggle={timeline.toggle}
            onSpeedChange={timeline.setSpeed}
            onSeekByProgress={timeline.seekByProgress}
            onDateShift={timeline.shiftDate}
            onDateSelect={timeline.setSelectedDate}
            onRangeDaysChange={timeline.setRangeDays}
            onToggleMultiDate={timeline.toggleMultiDate}
            onClearMultiDates={timeline.clearMultiDates}
          />

          <OrientationOrb
            bearing={cameraInfo.bearing}
            pitch={cameraInfo.pitch}
            isDarkTheme={isDarkTheme}
            avoidAirspaceCard={airspaceSelection !== null}
            onReset={() => {
              mapRef.current?.easeTo({
                bearing: 0,
                pitch: 0,
                duration: 800,
              });
            }}
          />

          {/* 右上角按鈕群 */}
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setCaptureMode(true)}
                style={{
                  padding: "6px 14px",
                  background: isDarkTheme ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
                  border: `1px solid ${isDarkTheme ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)"}`,
                  borderRadius: 6,
                  color: isDarkTheme ? "#fff" : "#333",
                  fontSize: 12,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  backdropFilter: "blur(8px)",
                  letterSpacing: 1,
                }}
              >
                Capture
              </button>
              <button
                onClick={() => setRenderMode((m) => (m === "3d" ? "2d" : "3d"))}
                style={{
                  padding: "6px 14px",
                  background: renderMode === "3d"
                    ? (isDarkTheme ? "rgba(80,140,255,0.2)" : "rgba(80,140,255,0.1)")
                    : (isDarkTheme ? "rgba(255,170,68,0.2)" : "rgba(255,170,68,0.1)"),
                  border: `1px solid ${renderMode === "3d"
                    ? (isDarkTheme ? "rgba(80,140,255,0.5)" : "rgba(80,140,255,0.4)")
                    : (isDarkTheme ? "rgba(255,170,68,0.5)" : "rgba(255,170,68,0.4)")}`,
                  borderRadius: 6,
                  color: isDarkTheme ? "#fff" : "#333",
                  fontSize: 12,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  backdropFilter: "blur(8px)",
                  letterSpacing: 1,
                }}
              >
                {renderMode === "3d" ? "3D Altitude" : "2D Flat"}
              </button>
            </div>
            <button
              onClick={() => setShowInfo(true)}
              style={{
                padding: "6px 14px",
                background: isDarkTheme ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
                border: `1px solid ${isDarkTheme ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)"}`,
                borderRadius: 6,
                color: isDarkTheme ? "#fff" : "#333",
                fontSize: 12,
                fontFamily: "monospace",
                cursor: "pointer",
                backdropFilter: "blur(8px)",
                letterSpacing: 1,
              }}
            >
              Info
            </button>
            <div
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                color: isDarkTheme ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)",
                letterSpacing: 0.5,
              }}
            >
              {cameraInfo.zoom < 3
                ? "Drag globe · Scroll to zoom"
                : "Right-drag to rotate · Scroll to zoom"}
            </div>
          </div>

          {/* Loading indicator — 畫面中央，完成後淡出 */}
          <LoadingIndicator loadingProgress={loadingProgress} isDarkTheme={isDarkTheme} />

          {/* 航班數 + 相機資訊 */}
          <div
            style={{
              position: "absolute",
              top: 76,
              left: 72,
              zIndex: 10,
              background: isDarkTheme ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.35)",
              backdropFilter: "blur(8px)",
              borderRadius: 6,
              padding: "4px 10px",
            }}
          >
            <div style={{ color: isDarkTheme ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.45)", fontSize: 11, fontFamily: "monospace" }}>
              {finalFlights.length} flights
              {airportSet !== null
                ? ` (${setName ?? `${airportSet.length} airports`})`
                : scope === "region" && ` (${REGION_CONFIG[region].label})`}
              {loadingProgress && ` · loading ${loadingProgress.loaded}...`}
              {` · ${timeline.selectedDate}`}
              {timeline.rangeDays > 1 && ` +${timeline.rangeDays - 1}d`}
            </div>
            <div style={{ color: isDarkTheme ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", fontSize: 11, fontFamily: "monospace" }}>
              {cameraInfo.lat}, {cameraInfo.lng} z{cameraInfo.zoom} pitch {cameraInfo.pitch} bearing {cameraInfo.bearing}
            </div>
            {!loading && !loadingProgress && displayedFlights.length === 0 && (
              <div style={{ color: isDarkTheme ? "rgba(255,180,80,0.55)" : "rgba(180,120,0,0.6)", fontSize: 10, fontFamily: "monospace", marginTop: 2 }}>
                此日期範圍無航班資料
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 手機版 UI ── */}
      {!captureMode && isMobile && (
        <>
          {/* Compact Header */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 44,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              paddingTop: "env(safe-area-inset-top, 0px)",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <AirportSelector
              airports={airports}
              selected={selectedAirport}
              isDarkTheme={true}
              onChange={selectAirportSingle}
            />

            <div style={{ flex: 1 }} />

            {loading && (
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "monospace" }}>
                Loading...
              </span>
            )}

            <button
              onClick={() => setShowInfo(true)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                fontSize: 12,
                fontFamily: "monospace",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              Info
            </button>

            <button
              onClick={() => setCaptureMode(true)}
              style={{
                height: 36,
                padding: "0 10px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                fontSize: 12,
                fontFamily: "monospace",
                cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              Capture
            </button>

            <button
              onClick={() => setRenderMode((m) => (m === "3d" ? "2d" : "3d"))}
              style={{
                height: 36,
                padding: "0 10px",
                borderRadius: 8,
                background: renderMode === "3d"
                  ? "rgba(80,140,255,0.25)"
                  : "rgba(255,170,68,0.25)",
                border: `1px solid ${renderMode === "3d" ? "rgba(80,140,255,0.5)" : "rgba(255,170,68,0.5)"}`,
                color: "#fff",
                fontSize: 12,
                fontFamily: "monospace",
                cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              {renderMode === "3d" ? "3D" : "2D"}
            </button>
          </div>

          {/* Timeline 固定在 header 下方 */}
          <div
            style={{
              position: "absolute",
              top: 44,
              left: 0,
              right: 0,
              zIndex: 10,
              padding: "8px 12px",
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <TimelineControls
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
              isDarkTheme={true}
              isMobile={true}
              onToggle={timeline.toggle}
              onSpeedChange={timeline.setSpeed}
              onSeekByProgress={timeline.seekByProgress}
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
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                      {(["trails", "status"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => { setDisplayMode(mode); setTooltipInfo(null); }}
                          style={{
                            background: displayMode === mode
                              ? "rgba(100,170,255,0.3)" : "rgba(0,0,0,0.6)",
                            color: "#fff",
                            border: `1px solid ${displayMode === mode
                              ? "rgba(100,170,255,0.6)" : "rgba(255,255,255,0.2)"}`,
                            borderRadius: 4,
                            padding: "8px 12px",
                            fontSize: 12,
                            cursor: "pointer",
                            fontFamily: "monospace",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {mode === "trails" ? "Flight Trails" : "Live Status"}
                        </button>
                      ))}
                      <span style={{ color: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center" }}>|</span>
                      <DataSourceToggle
                        dataSource={dataSource}
                        hasFused={hasFused}
                        isDarkTheme={true}
                        onChange={setDataSource}
                      />
                      <DepArrToggle
                        filter={depArrFilter}
                        isDarkTheme={true}
                        onChange={setDepArrFilter}
                      />
                    </div>
                    <FlightPicker
                      flights={pickableFlights}
                      scope={scope}
                      trackMode={trackMode}
                      selectedFlightId={selectedFlightId}
                      isDarkTheme={true}
                      isMobile={true}
                      onScopeChange={setScope}
                      onTrackModeChange={setTrackMode}
                      onFlightSelect={setSelectedFlightId}
                    />
                    <div
                      style={{
                        marginTop: 8,
                        color: "rgba(255,255,255,0.4)",
                        fontSize: 11,
                        fontFamily: "monospace",
                      }}
                    >
                      {finalFlights.length} flights
                      {scope === "region" && ` (${REGION_CONFIG[region].label})`}
                    </div>
                  </div>
                )}

                {/* full: Sliders + StyleSelector */}
                {level === "full" && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "monospace" }}>Style</span>
                      <StyleSelector
                        selected={mapStyleId}
                        isDarkTheme={true}
                        onChange={setMapStyleId}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { label: `Alt ×${altExaggeration.toFixed(1)}`, min: 1, max: 5, step: 0.5, value: altExaggeration, set: setAltExaggeration },
                        { label: `Z +${altOffset}m`, min: 0, max: 1000, step: 50, value: altOffset, set: setAltOffset },
                        { label: `Opacity ${staticOpacity.toFixed(2)}`, min: 0.02, max: 0.5, step: 0.02, value: staticOpacity, set: setStaticOpacity },
                        { label: `Orb ${(orbScale * 100000).toFixed(1)}`, min: 0.000001, max: 0.00001, step: 0.000001, value: orbScale, set: setOrbScale },
                        { label: `APT ${airportOpacity.toFixed(2)}`, min: 0, max: 0.3, step: 0.01, value: airportOpacity, set: setAirportOpacity },
                        { label: `Glow ${airportGlow.toFixed(1)}`, min: 0, max: 2, step: 0.1, value: airportGlow, set: setAirportGlow },
                      ].map((s) => (
                        <label key={s.label} style={{
                          color: "rgba(255,255,255,0.6)",
                          fontSize: 11,
                          fontFamily: "monospace",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}>
                          <span style={{ minWidth: 90 }}>{s.label}</span>
                          <input type="range" min={s.min} max={s.max} step={s.step} value={s.value}
                            onChange={(e) => s.set(Number(e.target.value))}
                            style={{ flex: 1, height: 6, accentColor: "rgba(255,255,255,0.6)" }} />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </MobileBottomSheet>
        </>
      )}

      {/* ── 飛機 Tooltip ── */}
      {tooltipInfo && (
        <div
          style={{
            position: "absolute",
            left: tooltipInfo.x + 12,
            top: tooltipInfo.y - 10,
            zIndex: 30,
            background: isDarkTheme ? "rgba(10,10,20,0.9)" : "rgba(255,255,255,0.95)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${isDarkTheme ? "rgba(100,170,255,0.4)" : "rgba(59,130,246,0.3)"}`,
            borderRadius: 8,
            padding: "10px 14px",
            pointerEvents: "none",
            fontFamily: "monospace",
            minWidth: 160,
            boxShadow: isDarkTheme ? "none" : "0 2px 12px rgba(0,0,0,0.1)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: isDarkTheme ? "#fff" : "#1a1a1a", letterSpacing: 1 }}>
            {tooltipInfo.flight.callsign}
          </div>
          <div style={{ fontSize: 11, color: isDarkTheme ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)", marginTop: 4 }}>
            {tooltipInfo.flight.origin_iata} → {tooltipInfo.flight.dest_iata}
          </div>
          <div style={{ fontSize: 11, color: isDarkTheme ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)", marginTop: 2 }}>
            {tooltipInfo.flight.aircraft_type}
            {tooltipInfo.altitude != null && ` · ${tooltipInfo.altitude}m`}
          </div>
          <div style={{ fontSize: 10, color: isDarkTheme ? "rgba(100,170,255,0.6)" : "rgba(59,130,246,0.6)", marginTop: 4 }}>
            double-click to track
          </div>
        </div>
      )}

      {/* ── Stats 面板 ── */}
      {showStats && !isMobile && (
        <FlightStatsPanel
          allFlights={allFlights}
          filteredFlights={finalFlights}
          selectedAirport={selectedAirport}
          isDarkTheme={isDarkTheme}
          onClose={() => setShowStats(false)}
          onSelectAirport={(icao) => {
            selectAirportSingle(icao);
          }}
          onSelectFlight={(id) => {
            setTrackMode("single");
            setSelectedFlightId(id);
            setShowStats(false);
          }}
        />
      )}

      {/* ── Info Modal ── */}
      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} isMobile={isMobile} />

      {/* ── Airspace Info Card ── */}
      {!captureMode && !isMobile && airspaceSelection && (
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
      )}
    </div>
  );
}
