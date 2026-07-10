import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { CameraPreset, Flight, RenderMode } from "../types";
import { updateStaticTrails, setStaticTrailsOpacity, setStaticTrailsVisible, setStaticTrailsLineWidth } from "./staticTrails";

interface MapViewProps {
  preset: CameraPreset;
  styleUrl: string;
  flights: Flight[];
  renderMode: RenderMode;
  airportOpacity: number;
  airportGlow: number;
  trailLineWidth?: number;
  isDarkTheme?: boolean;
  showTrails?: boolean;
  atlasVisible?: boolean;
  compareColorMap?: Map<string, string>;
  onMapReady?: (map: mapboxgl.Map) => void;
}

const AIRPORT_SOURCE = "airport-boundaries";
const AIRPORT_FILL = "airport-fill";
const AIRPORT_LINE = "airport-outline";
const AIRPORT_GLOW_1 = "airport-glow-1";
const AIRPORT_GLOW_2 = "airport-glow-2";

// Atlas 機場總覽點層（大小=dailyProxy、顏色=完整度）
export const ATLAS_SOURCE = "atlas-points";
export const ATLAS_LAYER = "atlas-points-circle";

function atlasStrokeColor(isDark: boolean) {
  return isDark ? "rgba(255,255,255,0.55)" : "rgba(20,20,20,0.45)";
}

function addAtlasPoints(map: mapboxgl.Map, isDark: boolean, visible: boolean) {
  if (map.getSource(ATLAS_SOURCE)) return;
  map.addSource(ATLAS_SOURCE, { type: "geojson", data: "./airport-points.geojson" });
  map.addLayer({
    id: ATLAS_LAYER,
    type: "circle",
    source: ATLAS_SOURCE,
    layout: { visibility: visible ? "visible" : "none" },
    paint: {
      // 半徑：sqrt(日均代理值) 線性映射（面積正比流量）
      "circle-radius": [
        "interpolate", ["linear"],
        ["sqrt", ["max", ["get", "dailyProxy"], 1]],
        1, 2.5,
        22, 18,
      ],
      // 顏色：完整度 4 級
      "circle-color": [
        "match", ["get", "status"],
        "complete", "#2ecc71",
        "core-partial", "#f1c40f",
        "partial", "#4a90d9",
        "planned", "#8894a3",
        "#888888",
      ],
      "circle-opacity": ["match", ["get", "status"], "planned", 0.4, 0.82],
      "circle-stroke-width": 1,
      "circle-stroke-color": atlasStrokeColor(isDark),
      "circle-stroke-opacity": ["match", ["get", "status"], "planned", 0.45, 0.8],
    },
  });
}

function setAtlasVisible(map: mapboxgl.Map, visible: boolean) {
  if (!map.getLayer(ATLAS_LAYER)) return;
  map.setLayoutProperty(ATLAS_LAYER, "visibility", visible ? "visible" : "none");
}


function addAirportOverlay(map: mapboxgl.Map, opacity: number, glow: number, isDark: boolean) {
  const color = isDark ? "#ffffff" : "#c89520";
  const glowColor = isDark ? "#ffffff" : "#daa520";

  if (map.getSource(AIRPORT_SOURCE)) return;

  map.addSource(AIRPORT_SOURCE, {
    type: "geojson",
    data: "./airports.geojson",
  });

  // 外層光暈（寬、模糊）
  map.addLayer({
    id: AIRPORT_GLOW_2,
    type: "line",
    source: AIRPORT_SOURCE,
    paint: {
      "line-color": glowColor,
      "line-width": 30,
      "line-blur": 15,
      "line-opacity": glow * (isDark ? 0.06 : 0.15),
    },
  });

  // 內層光暈
  map.addLayer({
    id: AIRPORT_GLOW_1,
    type: "line",
    source: AIRPORT_SOURCE,
    paint: {
      "line-color": glowColor,
      "line-width": 10,
      "line-blur": 5,
      "line-opacity": glow * (isDark ? 0.15 : 0.3),
    },
  });

  // 填充
  map.addLayer({
    id: AIRPORT_FILL,
    type: "fill",
    source: AIRPORT_SOURCE,
    paint: {
      "fill-color": color,
      "fill-opacity": isDark ? opacity : opacity * 1.5,
    },
  });

  // 邊框線
  map.addLayer({
    id: AIRPORT_LINE,
    type: "line",
    source: AIRPORT_SOURCE,
    paint: {
      "line-color": color,
      "line-width": isDark ? 1.5 : 2,
      "line-opacity": Math.min(opacity * 3, isDark ? 0.5 : 0.7),
    },
  });
}

function updateAirportStyle(map: mapboxgl.Map, opacity: number, glow: number, isDark: boolean) {
  if (!map.getSource(AIRPORT_SOURCE)) return;
  const color = isDark ? "#ffffff" : "#c89520";
  const glowColor = isDark ? "#ffffff" : "#daa520";

  map.setPaintProperty(AIRPORT_FILL, "fill-color", color);
  map.setPaintProperty(AIRPORT_FILL, "fill-opacity", isDark ? opacity : opacity * 1.5);
  map.setPaintProperty(AIRPORT_LINE, "line-color", color);
  map.setPaintProperty(AIRPORT_LINE, "line-width", isDark ? 1.5 : 2);
  map.setPaintProperty(AIRPORT_LINE, "line-opacity", Math.min(opacity * 3, isDark ? 0.5 : 0.7));
  map.setPaintProperty(AIRPORT_GLOW_1, "line-color", glowColor);
  map.setPaintProperty(AIRPORT_GLOW_1, "line-opacity", glow * (isDark ? 0.15 : 0.3));
  map.setPaintProperty(AIRPORT_GLOW_2, "line-color", glowColor);
  map.setPaintProperty(AIRPORT_GLOW_2, "line-opacity", glow * (isDark ? 0.06 : 0.15));
}

/**
 * 3D 模式下，根據 zoom 計算 2D 軌跡應有的透明度
 * zoom >= FADE_OUT → 完全隱藏（只看 3D）
 * zoom <= FADE_IN  → 完全顯示（3D 自然不可見）
 */
const ZOOM_FADE_IN = 3;
const ZOOM_FADE_OUT = 5;

function calc2dTrailOpacity(zoom: number, isDark: boolean) {
  const t = Math.max(0, Math.min(1, (zoom - ZOOM_FADE_IN) / (ZOOM_FADE_OUT - ZOOM_FADE_IN)));
  const fade = 1 - t;
  return {
    line: (isDark ? 0.25 : 0.5) * fade,
    glow: (isDark ? 0.08 : 0.15) * fade,
  };
}

function setupTerrain(map: mapboxgl.Map) {
  if (!map.getSource("mapbox-dem")) {
    map.addSource("mapbox-dem", {
      type: "raster-dem",
      url: "mapbox://mapbox.mapbox-terrain-dem-v1",
      tileSize: 512,
      maxzoom: 14,
    });
  }
  map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
}

export function MapView({ preset, styleUrl, flights, renderMode, airportOpacity, airportGlow, trailLineWidth = 1, isDarkTheme = true, showTrails = true, atlasVisible = false, compareColorMap, onMapReady }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const readyRef = useRef(false);

  // 用 ref 保存最新 props，讓永久 style.load handler 能讀到最新值
  const onMapReadyRef = useRef(onMapReady);
  const presetRef = useRef(preset);
  const airportOpacityRef = useRef(airportOpacity);
  const airportGlowRef = useRef(airportGlow);
  const renderModeRef = useRef(renderMode);
  const flightsRef = useRef(flights);
  const isDarkThemeRef = useRef(isDarkTheme);
  const showTrailsRef = useRef(showTrails);
  const compareColorMapRef = useRef(compareColorMap);
  const trailLineWidthRef = useRef(trailLineWidth);

  onMapReadyRef.current = onMapReady;
  presetRef.current = preset;
  airportOpacityRef.current = airportOpacity;
  airportGlowRef.current = airportGlow;
  renderModeRef.current = renderMode;
  flightsRef.current = flights;
  isDarkThemeRef.current = isDarkTheme;
  showTrailsRef.current = showTrails;
  compareColorMapRef.current = compareColorMap;
  trailLineWidthRef.current = trailLineWidth;

  const atlasVisibleRef = useRef(atlasVisible);
  atlasVisibleRef.current = atlasVisible;

  useEffect(() => {
    if (!containerRef.current) return;

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: presetRef.current.center,
      zoom: presetRef.current.zoom,
      pitch: presetRef.current.pitch,
      bearing: presetRef.current.bearing,
      antialias: true,
      preserveDrawingBuffer: true,
    });

    // 唯一的 style.load handler：每次底圖切換都會觸發，重建所有圖層
    map.on("style.load", () => {
      setupTerrain(map);
      addAirportOverlay(map, airportOpacityRef.current, airportGlowRef.current, isDarkThemeRef.current);
      addAtlasPoints(map, isDarkThemeRef.current, atlasVisibleRef.current);

      // 永遠保留 Mapbox 原生靜態軌跡
      const is3d = renderModeRef.current === "3d";
      updateStaticTrails(map, flightsRef.current, isDarkThemeRef.current, is3d, compareColorMapRef.current);
      setStaticTrailsLineWidth(map, trailLineWidthRef.current);
      // 3D 模式：根據當前 zoom 設定 2D 軌跡透明度
      if (is3d) {
        const { line, glow } = calc2dTrailOpacity(map.getZoom(), isDarkThemeRef.current);
        setStaticTrailsOpacity(map, line, glow);
      }

      // Live Status 模式：隱藏 2D 軌跡
      if (!showTrailsRef.current) {
        setStaticTrailsVisible(map, false);
      }

      // 初次載入後，每次樣式切換都重建 flight layer
      if (readyRef.current) {
        onMapReadyRef.current?.(map);
      }
    });

    map.on("load", () => {
      mapRef.current = map;
      readyRef.current = true;
      onMapReadyRef.current?.(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切換底圖樣式
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setStyle(styleUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  // 切換 Atlas 機場總覽點層顯示
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    setAtlasVisible(map, atlasVisible);
  }, [atlasVisible]);

  // 切換機場時平滑飛行 + 更新標記
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    map.flyTo({
      center: preset.center,
      zoom: preset.zoom,
      pitch: preset.pitch,
      bearing: preset.bearing,
      duration: 2000,
    });
  }, [preset]);

  // 2D/3D 渲染模式切換：更新軌跡資料，3D 模式由 zoom handler 控制透明度
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.isStyleLoaded()) return;

    const is3d = renderMode === "3d";
    updateStaticTrails(map, flights, isDarkTheme, is3d, compareColorMap);
    if (is3d) {
      const { line, glow } = calc2dTrailOpacity(map.getZoom(), isDarkTheme);
      setStaticTrailsOpacity(map, line, glow);
    }
  }, [renderMode, flights, isDarkTheme, compareColorMap]);

  // 3D 模式：zoom 驅動 2D 軌跡 crossfade（近看隱藏 2D，拉遠顯示 2D）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (renderMode !== "3d") return;

    const onZoom = () => {
      if (!map.isStyleLoaded()) return;
      const { line, glow } = calc2dTrailOpacity(map.getZoom(), isDarkThemeRef.current);
      setStaticTrailsOpacity(map, line, glow);
    };

    map.on("zoom", onZoom);
    return () => { map.off("zoom", onZoom); };
  }, [renderMode]);

  // showTrails 切換：控制 2D 軌跡可見性
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.isStyleLoaded()) return;
    setStaticTrailsVisible(map, showTrails);
  }, [showTrails]);

  // 機場圖層樣式即時更新
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.isStyleLoaded()) return;
    updateAirportStyle(map, airportOpacity, airportGlow, isDarkTheme);
  }, [airportOpacity, airportGlow, isDarkTheme]);

  // 2D 軌跡線寬即時更新
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.isStyleLoaded()) return;
    setStaticTrailsLineWidth(map, trailLineWidth);
  }, [trailLineWidth]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
