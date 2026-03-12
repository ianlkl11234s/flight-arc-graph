import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import type { Scope, TrackMode, RenderMode, DisplayMode, DataSource, Flight } from "./types";
import type { FlightScene } from "./three/FlightScene";
import { MapView } from "./map/MapView";
import { useFlightData } from "./hooks/useFlightData";
import { useTimeline } from "./hooks/useTimeline";
import { useIsMobile } from "./hooks/useIsMobile";
import { CAMERA_PRESETS, getPresetByIcao, getAirportInfo } from "./map/cameraPresets";
import { createFlightLayer } from "./map/customLayer";
import { filterByAirport } from "./data/flightLoader";
import { AirportSelector } from "./components/AirportSelector";
import { FlightPicker } from "./components/FlightPicker";
import { TimelineControls } from "./components/TimelineControls";
import { StyleSelector, getStyleUrl } from "./components/StyleSelector";
import { MobileBottomSheet } from "./components/MobileBottomSheet";
import { FlightStatsPanel } from "./components/FlightStatsPanel";
import { DataSourceToggle } from "./components/DataSourceToggle";
import { AircraftTypeFilter } from "./components/AircraftTypeFilter";
import { filterByAircraftType, type AircraftFilterKey } from "./data/aircraftCategories";
import { IconRailSidebar } from "./components/IconRailSidebar";
import { InfoModal } from "./components/InfoModal";

export default function App() {
  const [dataSource, setDataSource] = useState<DataSource>("api");
  const {
    allFlights,
    filteredFlights,
    airports,
    selectedAirport,
    setSelectedAirport,
    loading,
    hasFused,
  } = useFlightData(dataSource);

  const [scope, setScope] = useState<Scope>("airport");
  const [trackMode, setTrackMode] = useState<TrackMode>("stack");
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
  const [showInfo, setShowInfo] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [tooltipInfo, setTooltipInfo] = useState<{ flight: Flight; x: number; y: number; altitude: number | null } | null>(null);
  const [cameraInfo, setCameraInfo] = useState({ lng: 0, lat: 0, zoom: 0, pitch: 0, bearing: 0 });
  const { isMobile, isLandscape } = useIsMobile();

  // 本地資料可用日期（台灣時區）
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    for (const f of allFlights) {
      const t = f.dep_time || f.path[0]?.[3];
      if (t && t > 0) {
        const d = new Date(t * 1000);
        const tw = new Date(d.getTime() + 8 * 3600_000); // UTC+8
        dates.add(tw.toISOString().slice(0, 10));
      }
    }
    return [...dates].sort();
  }, [allFlights]);

  const timeline = useTimeline({ availableDates });

  // 根據 scope + trackMode + 日期範圍決定要顯示的航班
  const displayedFlights = useMemo(() => {
    let base = scope === "all-taiwan" ? allFlights : filteredFlights;
    // 日期範圍篩選（離散，只在使用者操作時改變）
    base = base.filter((f) => {
      const t = f.dep_time || f.path[0]?.[3];
      return t && t >= timeline.windowStart && t <= timeline.windowEnd;
    });
    if (trackMode === "single" && selectedFlightId) {
      return base.filter((f) => f.fr24_id === selectedFlightId);
    }
    return base;
  }, [allFlights, filteredFlights, scope, trackMode, selectedFlightId,
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

  const mapRef = useRef<MapboxMap | null>(null);
  const flightsRef = useRef(finalFlights);
  const timeRef = useRef(timeline.currentTime);
  const renderModeRef = useRef(renderMode);
  const altExagRef = useRef(altExaggeration);
  const altOffsetRef = useRef(altOffset);
  const staticOpacityRef = useRef(staticOpacity);
  const orbScaleRef = useRef(orbScale);
  const isDarkThemeRef = useRef(isDarkTheme);
  const showTrailsRef = useRef(displayMode === "trails");
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

  if (loading) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#0a0a14",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontFamily: "monospace",
          color: "#fff",
        }}
      >
        <div style={{ fontSize: 22, letterSpacing: 4, fontWeight: 700 }}>
          Taiwan Flight Arc
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>
          Loading flight data...
        </div>
        <div
          style={{
            width: 120,
            height: 2,
            background: "rgba(255,255,255,0.1)",
            borderRadius: 1,
            overflow: "hidden",
            marginTop: 8,
          }}
        >
          <div
            style={{
              width: "40%",
              height: "100%",
              background: "rgba(100,170,255,0.8)",
              borderRadius: 1,
              animation: "loadbar 1.2s ease-in-out infinite alternate",
            }}
          />
        </div>
        <style>{`@keyframes loadbar { from { margin-left: 0 } to { margin-left: 60% } }`}</style>
      </div>
    );
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
              Taiwan Flight Arc
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
            trackMode={trackMode}
            pickableFlights={pickableFlights}
            selectedFlightId={selectedFlightId}
            onScopeChange={setScope}
            onTrackModeChange={setTrackMode}
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
            availableDates={availableDates}
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
              gap: 8,
              alignItems: "center",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                color: isDarkTheme ? "#fff" : "#333",
                fontFamily: "monospace",
                letterSpacing: 2,
              }}
            >
              Taiwan Flight Arc
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

          {/* 航班數 + 相機資訊 */}
          <div
            style={{
              position: "absolute",
              top: 52,
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
              {scope === "all-taiwan" && " (all Taiwan)"}
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
                      {scope === "all-taiwan" && " (all Taiwan)"}
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
            background: "rgba(10,10,20,0.9)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(100,170,255,0.4)",
            borderRadius: 8,
            padding: "10px 14px",
            pointerEvents: "none",
            fontFamily: "monospace",
            minWidth: 160,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: 1 }}>
            {tooltipInfo.flight.callsign}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
            {tooltipInfo.flight.origin_iata} → {tooltipInfo.flight.dest_iata}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
            {tooltipInfo.flight.aircraft_type}
            {tooltipInfo.altitude != null && ` · ${tooltipInfo.altitude}m`}
          </div>
          <div style={{ fontSize: 10, color: "rgba(100,170,255,0.6)", marginTop: 4 }}>
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
