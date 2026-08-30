import type { Map as MapboxMap, GeoJSONSource } from "mapbox-gl";
import type { Flight } from "../types";

const SOURCE_ID = "static-trails";
const LAYER_ID = "static-trails-line";
const GLOW_LAYER_ID = "static-trails-glow";
const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * 將 fr24_id hash 成 0~1 的穩定值
 */
function hashToUnit(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return (hash % 10000) / 10000;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

/** 產生 lerp 函式，在兩個 hex 色之間插值 */
function makeLerpColor(hexA: string, hexB: string): (t: number) => string {
  const [ar, ag, ab] = parseHex(hexA);
  const [br, bg, bb] = parseHex(hexB);
  return (t: number) => {
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const b = Math.round(ab + (bb - ab) * t);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  };
}

// Default fallbacks
const lerpColorDark = makeLerpColor("#ffffff", "#ff8833");
const lerpColorLight = makeLerpColor("#1a3a8a", "#8a1a2a");

// Custom theme colors (mutable)
let customLerpDark: ((t: number) => string) | null = null;

// 線寬倍率（user-controlled），預設 1.0
let lineWidthMultiplier = 1;
const BASE_LINE_WIDTH = 1;
const BASE_GLOW_WIDTH = 3;

/** 設定 2D 軌跡的自訂顏色 */
export function setMapTrailColors(hexA: string, hexB: string) {
  customLerpDark = makeLerpColor(hexA, hexB);
}

/**
 * 將航班路徑轉為 GeoJSON FeatureCollection
 */
function flightsToGeoJSON(
  flights: Flight[],
  isDark = true,
  compareColorMap?: Map<string, string>,
): GeoJSON.FeatureCollection {
  const lerpColor = isDark ? (customLerpDark ?? lerpColorDark) : lerpColorLight;
  return {
    type: "FeatureCollection",
    features: flights
      .filter((f) => f.path.length >= 2)
      .map((f) => ({
        type: "Feature" as const,
        properties: {
          callsign: f.callsign,
          origin: f.origin_iata,
          dest: f.dest_iata,
          color: compareColorMap?.get(f.fr24_id) ?? lerpColor(hashToUnit(f.fr24_id)),
        },
        geometry: {
          type: "LineString" as const,
          // path 格式: [lat, lng, alt, ts] → GeoJSON 要 [lng, lat]
          coordinates: f.path.map((pt) => [pt[1], pt[0]]),
        },
      })),
  };
}

/**
 * 新增或更新靜態軌跡圖層
 * @param background - 3D 模式下作為背景路線，降低透明度
 * @param compareColorMap - Compare 模式下，fr24_id → 日期色對應表
 */
export function updateStaticTrails(
  map: MapboxMap,
  flights: Flight[],
  isDark = true,
  background = false,
  compareColorMap?: Map<string, string>,
) {
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;

  const scale = background ? 0 : 1.0;
  const lineOpacity = (isDark ? 0.25 : 0.5) * scale;
  const glowOpacity = (isDark ? 0.08 : 0.15) * scale;

  if (source) {
    // 目前 3D 全程由 Three.js 畫軌跡，calc2dTrailOpacity 也固定為 0。
    // 清空 Mapbox source 避免同一批完整 path 同時佔用兩套 GPU/JS buffers。
    source.setData(background ? EMPTY_GEOJSON : flightsToGeoJSON(flights, isDark, compareColorMap));
    if (map.getLayer(LAYER_ID)) {
      map.setPaintProperty(LAYER_ID, "line-opacity", lineOpacity);
    }
    if (map.getLayer(GLOW_LAYER_ID)) {
      map.setPaintProperty(GLOW_LAYER_ID, "line-opacity", glowOpacity);
    }
  } else {
    const geojson = background ? EMPTY_GEOJSON : flightsToGeoJSON(flights, isDark, compareColorMap);
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: geojson,
    });

    // 外層 glow（較寬、較透明）
    map.addLayer({
      id: GLOW_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": ["get", "color"],
        "line-width": BASE_GLOW_WIDTH * lineWidthMultiplier,
        "line-opacity": glowOpacity,
        "line-blur": 4,
      },
    });

    // 內層線條（較細、較亮）
    map.addLayer({
      id: LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": ["get", "color"],
        "line-width": BASE_LINE_WIDTH * lineWidthMultiplier,
        "line-opacity": lineOpacity,
        "line-blur": 1,
      },
    });
  }
}

/**
 * 設定 2D 軌跡線寬倍率（即時更新已建立的圖層）
 */
export function setStaticTrailsLineWidth(map: MapboxMap, multiplier: number) {
  lineWidthMultiplier = multiplier;
  if (map.getLayer(LAYER_ID)) {
    map.setPaintProperty(LAYER_ID, "line-width", BASE_LINE_WIDTH * multiplier);
  }
  if (map.getLayer(GLOW_LAYER_ID)) {
    map.setPaintProperty(GLOW_LAYER_ID, "line-width", BASE_GLOW_WIDTH * multiplier);
  }
}

/**
 * 移除靜態軌跡圖層
 */
export function removeStaticTrails(map: MapboxMap) {
  if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
  if (map.getLayer(GLOW_LAYER_ID)) map.removeLayer(GLOW_LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

/**
 * 設定靜態軌跡圖層可見性（用於 Display Mode 切換）
 */
export function setStaticTrailsVisible(map: MapboxMap, visible: boolean) {
  const visibility = visible ? "visible" : "none";
  if (map.getLayer(LAYER_ID)) {
    map.setLayoutProperty(LAYER_ID, "visibility", visibility);
  }
  if (map.getLayer(GLOW_LAYER_ID)) {
    map.setLayoutProperty(GLOW_LAYER_ID, "visibility", visibility);
  }
}

/**
 * 直接設定靜態軌跡透明度（用於 zoom-based crossfade）
 */
export function setStaticTrailsOpacity(map: MapboxMap, lineOpacity: number, glowOpacity: number) {
  if (map.getLayer(LAYER_ID)) {
    map.setPaintProperty(LAYER_ID, "line-opacity", lineOpacity);
  }
  if (map.getLayer(GLOW_LAYER_ID)) {
    map.setPaintProperty(GLOW_LAYER_ID, "line-opacity", glowOpacity);
  }
}
