import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import type { Scope, TrackMode, RenderMode, DisplayMode, DataSource, Flight, Region, TrailDisplay } from "./types";
import type { FlightScene } from "./three/FlightScene";
import { MapView } from "./map/MapView";
import { useFlightData } from "./hooks/useFlightData";
import { useTimeline } from "./hooks/useTimeline";
import { useIsMobile } from "./hooks/useIsMobile";
import { CAMERA_PRESETS, getPresetByIcao, getAirportInfo } from "./map/cameraPresets";
import { createFlightLayer } from "./map/customLayer";
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
import { AircraftTypeFilter } from "./components/AircraftTypeFilter";
import { filterByAircraftType, type AircraftFilterKey } from "./data/aircraftCategories";
import { IconRailSidebar, type ScenePreset } from "./components/IconRailSidebar";
import { InfoModal } from "./components/InfoModal";
import { useCinemaCamera } from "./hooks/useCinemaCamera";
import { CinemaBar } from "./components/CinemaBar";

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
        {fadeOut ? `${lastCount} flights loaded` : `Loading ${loadingProgress?.loaded ?? 0} flights...`}
      </span>
      <style>{`@keyframes pulse { 0%,100% { opacity:0.3 } 50% { opacity:1 } }`}</style>
    </div>
  );
}

export default function App() {
  const [dataSource, setDataSource] = useState<DataSource>("api");
  const [scope, setScope] = useState<Scope>("airport");
  const [region, setRegion] = useState<Region>("TW");

  // airspace 日期追蹤（避免與 timeline 循環依賴）
  const [airspaceDate, setAirspaceDate] = useState<string | undefined>();
  const [airspaceRangeDays, setAirspaceRangeDays] = useState(1);

  const {
    allFlights,
    airports,
    selectedAirport,
    setSelectedAirport,
    loading,
    loadingProgress,
    hasFused,
    airspaceDates,
    regionDatesMap,
    regionFullDatesMap,
  } = useFlightData(dataSource, scope, region, airspaceDate, airspaceRangeDays);
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
  const [displayMode, setDisplayMode] = useState<DisplayMode>("trails");
  const [aircraftFilter, setAircraftFilter] = useState<AircraftFilterKey>("all");
  const [captureMode, setCaptureMode] = useState(false);
  const [trailDisplay, setTrailDisplay] = useState<TrailDisplay>("full");
  const [showInfo, setShowInfo] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [tooltipInfo, setTooltipInfo] = useState<{ flight: Flight; x: number; y: number; altitude: number | null } | null>(null);
  const [cameraInfo, setCameraInfo] = useState({ lng: 0, lat: 0, zoom: 0, pitch: 0, bearing: 0 });
  const { isMobile, isLandscape } = useIsMobile();

  // Region 相關 helper
  const KNOWN_REGIONS = ["RC", "RJ", "RO", "VH"];
  const isKnownRegion = (icao: string) => KNOWN_REGIONS.some((p) => icao.startsWith(p));

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

  // 可用日期：根據 dataSource + region 從 manifest 取得
  const availableDates = useMemo(() => {
    const dates = new Set<string>();

    if (dataSource === "fused") {
      // 空域快照日期
      for (const d of airspaceDates) dates.add(d);
    } else {
      // 航線軌跡：當前 region 的日期
      const regionKey = region === "all" ? "TW" : region;
      const rd = regionDatesMap[regionKey] ?? [];
      for (const d of rd) dates.add(d);
    }

    // 也加入已載入航班的日期（fallback）
    for (const f of allFlights) {
      const t = f.dep_time || f.path[0]?.[3];
      if (t && t > 0) {
        const d = new Date(t * 1000 + 8 * 3600_000);
        dates.add(d.toISOString().slice(0, 10));
      }
    }

    return [...dates].sort();
  }, [dataSource, region, airspaceDates, regionDatesMap, allFlights]);

  const timeline = useTimeline({ availableDates });
  const mapRef = useRef<MapboxMap | null>(null);
  const cinema = useCinemaCamera({ map: mapRef.current, active: captureMode });

  // 同步 timeline 日期給 airspace 載入
  useEffect(() => {
    if (dataSource === "fused") {
      setAirspaceDate(timeline.selectedDate);
      setAirspaceRangeDays(timeline.rangeDays);
    }
  }, [dataSource, timeline.selectedDate, timeline.rangeDays]);

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
    base = base.filter((f) => {
      const t = f.dep_time || f.path[0]?.[3];
      return t && t >= timeline.windowStart && t <= timeline.windowEnd;
    });
    if (trackMode === "single" && selectedFlightId) {
      return base.filter((f) => f.fr24_id === selectedFlightId);
    }
    return base;
  }, [allFlights, trackMode, selectedFlightId,
      timeline.windowStart, timeline.windowEnd]);

  // Aircraft type filter
  const finalFlights = useMemo(
    () => filterByAircraftType(displayedFlights, aircraftFilter),
    [displayedFlights, aircraftFilter],
  );
  const availableTypes = useMemo(
    () => [...new Set(displayedFlights.map((f) => f.aircraft_type))].filter(Boolean).sort(),
    [displayedFlights],
  );

  // 用於 FlightPicker 的航班列表（always based on airport filter）
  const pickableFlights = useMemo(
    () => filterByAirport(allFlights, selectedAirport),
    [allFlights, selectedAirport],
  );

  const isDarkTheme = !["light", "streets"].includes(mapStyleId);

  const flightsRef = useRef(finalFlights);
  const timeRef = useRef(timeline.currentTime);
  const renderModeRef = useRef(renderMode);
  const altExagRef = useRef(altExaggeration);
  const altOffsetRef = useRef(altOffset);
  const staticOpacityRef = useRef(staticOpacity);
  const orbScaleRef = useRef(orbScale);
  const isDarkThemeRef = useRef(isDarkTheme);
  const showTrailsRef = useRef(displayMode === "trails");
  const timeWindowRef = useRef(timeWindow);
  const trailDisplayRef = useRef(trailDisplay);
  const flightSceneRef = useRef<FlightScene | null>(null);
  const clickBoundRef = useRef(false);

  flightsRef.current = finalFlights;
  timeRef.current = timeline.currentTime;
  renderModeRef.current = renderMode;
  altExagRef.current = altExaggeration;
  altOffsetRef.current = altOffset;
  staticOpacityRef.current = staticOpacity;
  orbScaleRef.current = orbScale;
  isDarkThemeRef.current = isDarkTheme;
  showTrailsRef.current = displayMode === "trails";
  timeWindowRef.current = timeWindow;
  trailDisplayRef.current = trailDisplay;

  const showTrails = displayMode === "trails";

  const preset = useMemo(
    () => getPresetByIcao(selectedAirport) ?? CAMERA_PRESETS[0]!,
    [selectedAirport],
  );

  const styleUrl = useMemo(() => getStyleUrl(mapStyleId), [mapStyleId]);

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
      getOrbScale: () => orbScaleRef.current,
      getIsDarkTheme: () => isDarkThemeRef.current,
      getShowTrails: () => showTrailsRef.current,
      getTimeWindow: () => timeWindowRef.current,
      getTrailDisplay: () => trailDisplayRef.current,
      onSceneReady: (scene) => { flightSceneRef.current = scene; },
    });
    map.addLayer(layer);
  };

  const handleMapReady = (map: MapboxMap) => {
    mapRef.current = map;
    addFlightLayer(map);
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
        if (!scene) { setTooltipInfo(null); return; }
        const container = map.getContainer();
        const flightId = scene.pickFlight(
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
          }
        } else {
          setTooltipInfo(null);
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

  // Track Single 模式：相機鎖定飛機，飛機固定在畫面中央
  useEffect(() => {
    if (trackMode !== "single" || !selectedFlightId) return;
    const map = mapRef.current;
    if (!map) return;

    let animId: number;
    const tick = () => {
      const flight = flightsRef.current.find((f) => f.fr24_id === selectedFlightId);
      if (flight && flight.path.length > 0) {
        const t = timeRef.current;
        const path = flight.path;
        // 線性插值取得精確位置
        let lat: number, lng: number;
        if (t <= path[0]![3]) {
          lat = path[0]![0]; lng = path[0]![1];
        } else if (t >= path[path.length - 1]![3]) {
          lat = path[path.length - 1]![0]; lng = path[path.length - 1]![1];
        } else {
          lat = path[0]![0]; lng = path[0]![1];
          for (let i = 1; i < path.length; i++) {
            if (path[i]![3] >= t) {
              const a = path[i - 1]!;
              const b = path[i]!;
              const r = (t - a[3]) / (b[3] - a[3]);
              lat = a[0] + (b[0] - a[0]) * r;
              lng = a[1] + (b[1] - a[1]) * r;
              break;
            }
          }
        }
        map.setCenter([lng, lat]);
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
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

  if (loading && allFlights.length === 0) {
    return <LoadingScreen />;
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <MapView
        preset={preset}
        styleUrl={styleUrl}
        flights={finalFlights}
        renderMode={renderMode}
        airportOpacity={airportOpacity}
        airportGlow={airportGlow}
        isDarkTheme={isDarkTheme}
        showTrails={showTrails}
        onMapReady={handleMapReady}
      />

      {/* ── 拍攝模式 vignette + 標題 ── */}
      {captureMode && (
        <>
          {/* 暗角 vignette */}
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
          {/* 左上標題 */}
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
              {regionTitle}
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
              {(() => {
                const info = getAirportInfo(selectedAirport);
                return info
                  ? `${info.name} / ${info.iata} / ${selectedAirport}`
                  : selectedAirport;
              })()}
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
          {/* Trail 模式切換 */}
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
          {/* 鏡頭控制列 */}
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
            totalDuration={cinema.totalDuration}
          />
          {/* 退出按鈕 */}
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
            onDisplayModeChange={(m) => { setDisplayMode(m); setTooltipInfo(null); }}
            onRenderModeChange={setRenderMode}
            onMapStyleChange={setMapStyleId}
            onAltExaggerationChange={setAltExaggeration}
            onAltOffsetChange={setAltOffset}
            onStaticOpacityChange={setStaticOpacity}
            onOrbScaleChange={setOrbScale}
            onAirportOpacityChange={setAirportOpacity}
            onAirportGlowChange={setAirportGlow}
            scope={scope}
            region={region}
            trackMode={trackMode}
            timeWindow={timeWindow}
            pickableFlights={pickableFlights}
            selectedFlightId={selectedFlightId}
            onScopeChange={(s) => {
              setScope(s);
              if (s === "region") {
                const cam = REGION_CONFIG[region].regionCamera ?? REGION_CONFIG[region].camera;
                mapRef.current?.flyTo({ ...cam, duration: 2000 });
              }
            }}
            onTrackModeChange={setTrackMode}
            onTimeWindowChange={setTimeWindow}
            onFlightSelect={setSelectedFlightId}
            airports={airports}
            selectedAirport={selectedAirport}
            onAirportChange={setSelectedAirport}
            onLocationJump={(icao) => {
              const p = getPresetByIcao(icao);
              if (p && mapRef.current) {
                mapRef.current.flyTo({
                  center: p.center,
                  zoom: p.zoom,
                  pitch: p.pitch,
                  bearing: p.bearing,
                  duration: 2000,
                });
              }
            }}
            onSceneSelect={(scene: ScenePreset) => {
              // 資料來源 & 範圍（跳過 dataSource useEffect 的自動設定）
              prevDataSourceRef.current = scene.dataSource;
              setDataSource(scene.dataSource);
              setScope(scene.scope);
              if (scene.airport) setSelectedAirport(scene.airport);
              if (scene.opacity != null) setStaticOpacity(scene.opacity);
              setAircraftFilter(scene.aircraftFilter ?? "all");
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
            fullDates={dataSource === "fused" ? airspaceDates : (regionFullDatesMap[region === "all" ? "TW" : region] ?? [])}
            selectedDate={timeline.selectedDate}
            onDateSelect={timeline.setSelectedDate}
            onStatsClick={() => setShowStats(true)}
            onInfoClick={() => setShowInfo(true)}
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
              <h1
                style={{
                  margin: 0,
                  fontSize: 18,
                  color: isDarkTheme ? "#fff" : "#333",
                  fontFamily: "monospace",
                  letterSpacing: 2,
                }}
              >
                {regionTitle}
              </h1>
              <DataSourceToggle
                dataSource={dataSource}
                hasFused={hasFused}
                isDarkTheme={isDarkTheme}
                onChange={setDataSource}
              />
              <AircraftTypeFilter
                filter={aircraftFilter}
                isDarkTheme={isDarkTheme}
                availableTypes={availableTypes}
                onChange={setAircraftFilter}
              />
            </div>
            {/* Region Pills */}
            <div style={{ display: "flex", gap: 4 }}>
              {(["TW", "JP", "HK", "world", "all"] as Region[]).map((r) => {
                const isActive = region === r;
                return (
                  <button
                    key={r}
                    onClick={() => {
                      setRegion(r);
                      setScope("airport");
                      const cfg = REGION_CONFIG[r];
                      if (cfg.defaultAirport) setSelectedAirport(cfg.defaultAirport);
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
            </div>
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
            isDarkTheme={isDarkTheme}
            onToggle={timeline.toggle}
            onSpeedChange={timeline.setSpeed}
            onSeekByProgress={timeline.seekByProgress}
            onDateShift={timeline.shiftDate}
            onRangeDaysChange={timeline.setRangeDays}
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
              Right-drag to rotate · Scroll to zoom
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
              {scope === "region" && ` (${REGION_CONFIG[region].label})`}
              {loadingProgress && ` · loading ${loadingProgress.loaded}...`}
              {` · ${timeline.selectedDate}`}
              {timeline.rangeDays > 1 && ` +${timeline.rangeDays - 1}d`}
            </div>
            <div style={{ color: isDarkTheme ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", fontSize: 11, fontFamily: "monospace" }}>
              {cameraInfo.lat}, {cameraInfo.lng} z{cameraInfo.zoom} pitch {cameraInfo.pitch} bearing {cameraInfo.bearing}
            </div>
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
              onChange={setSelectedAirport}
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
              isDarkTheme={true}
              isMobile={true}
              onToggle={timeline.toggle}
              onSpeedChange={timeline.setSpeed}
              onSeekByProgress={timeline.seekByProgress}
              onDateShift={timeline.shiftDate}
              onRangeDaysChange={timeline.setRangeDays}
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
                      <AircraftTypeFilter
                        filter={aircraftFilter}
                        isDarkTheme={true}
                        availableTypes={availableTypes}
                        onChange={setAircraftFilter}
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
                        { label: `Z +${altOffset}m`, min: 0, max: 200, step: 50, value: altOffset, set: setAltOffset },
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
          selectedAirport={selectedAirport}
          isDarkTheme={isDarkTheme}
          onClose={() => setShowStats(false)}
          onSelectAirport={(icao) => {
            setSelectedAirport(icao);
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
    </div>
  );
}
