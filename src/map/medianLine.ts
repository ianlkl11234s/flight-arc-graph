import type { Map as MapboxMap } from "mapbox-gl";

/**
 * 海峽中線（Davis Line）
 *
 * 國防部 2019 年首次公開之座標，3 段折線：
 *   (121°23′E, 26°30′N) → (119°59′E, 24°50′N) → (117°51′E, 23°17′N)
 * 實務上常延伸到南北端：北 (122°E, 27°N)、南 (118°E, 23°N)
 *
 * 視覺定位：純參考線（非法律邊界），以虛白線呈現，與 ADIZ polygon 區隔。
 */
const MEDIAN_LINE_COORDS: [number, number][] = [
  [122.0, 27.0],          // 延伸北端
  [121.3833, 26.5],       // 121°23′E, 26°30′N
  [119.9833, 24.8333],    // 119°59′E, 24°50′N
  [117.85, 23.2833],      // 117°51′E, 23°17′N
  [118.0, 23.0],          // 延伸南端
];

const SRC_ID = "taiwan-median-line-src";
const GLOW_ID = "taiwan-median-line-glow";
const LINE_ID = "taiwan-median-line";

function geojson() {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {
          name_zh: "海峽中線",
          name_en: "Taiwan Strait Median Line",
        },
        geometry: {
          type: "LineString" as const,
          coordinates: MEDIAN_LINE_COORDS,
        },
      },
    ],
  };
}

/**
 * 加入海峽中線到地圖（若已存在則略過）。
 * 同時建立發光底線 + 主虛線。
 */
export function addMedianLineLayer(map: MapboxMap, isDarkTheme: boolean) {
  if (map.getSource(SRC_ID)) return;

  map.addSource(SRC_ID, { type: "geojson", data: geojson() });

  const lineColor = isDarkTheme ? "#ffffff" : "#1a1a1a";
  const glowColor = isDarkTheme ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.18)";

  map.addLayer({
    id: GLOW_ID,
    type: "line",
    source: SRC_ID,
    paint: {
      "line-color": glowColor,
      "line-width": 6,
      "line-blur": 4,
      "line-opacity": 0.8,
    },
  });

  map.addLayer({
    id: LINE_ID,
    type: "line",
    source: SRC_ID,
    paint: {
      "line-color": lineColor,
      "line-width": 1.5,
      "line-dasharray": [3, 3],
      "line-opacity": 0.9,
    },
  });
}

/** 移除圖層（source 一併清掉） */
export function removeMedianLineLayer(map: MapboxMap) {
  if (map.getLayer(LINE_ID)) map.removeLayer(LINE_ID);
  if (map.getLayer(GLOW_ID)) map.removeLayer(GLOW_ID);
  if (map.getSource(SRC_ID)) map.removeSource(SRC_ID);
}

/** 切換可見性（保留 source / layer） */
export function setMedianLineVisibility(map: MapboxMap, visible: boolean) {
  const v = visible ? "visible" : "none";
  if (map.getLayer(LINE_ID)) map.setLayoutProperty(LINE_ID, "visibility", v);
  if (map.getLayer(GLOW_ID)) map.setLayoutProperty(GLOW_ID, "visibility", v);
}

/** 主題切換時更新顏色 */
export function setMedianLineTheme(map: MapboxMap, isDarkTheme: boolean) {
  const lineColor = isDarkTheme ? "#ffffff" : "#1a1a1a";
  const glowColor = isDarkTheme ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.18)";
  if (map.getLayer(LINE_ID)) map.setPaintProperty(LINE_ID, "line-color", lineColor);
  if (map.getLayer(GLOW_ID)) map.setPaintProperty(GLOW_ID, "line-color", glowColor);
}
