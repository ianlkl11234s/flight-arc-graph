/**
 * Color Theme System
 * 控制所有 3D/2D 渲染元素的配色
 */

export interface ColorTheme {
  name: string;
  /** 動態光軌 5 色（暗色主題用，Additive Blending） */
  trailColors: [string, string, string, string, string];
  /** 靜態軌跡漸層色（低空 → 中空 → 高空，2~5 個色停） */
  staticGradient: string[];
  /** 光球 glow 色 */
  orbGlow: string;
  /** 2D Mapbox 軌跡色 A（t=0） */
  mapTrailA: string;
  /** 2D Mapbox 軌跡色 B（t=1） */
  mapTrailB: string;
}

export const COLOR_THEMES: Record<string, ColorTheme> = {
  default: {
    name: "Default",
    trailColors: ["#4d99ff", "#33ccee", "#8066ff", "#4de6b3", "#9980ff"],
    staticGradient: ["#fbe2bc", "#ffc880", "#80bfff"],
    orbGlow: "#4d99ff",
    mapTrailA: "#ffffff",
    mapTrailB: "#ff8833",
  },
  warm: {
    name: "Warm",
    trailColors: ["#ff9944", "#ffcc33", "#ff6633", "#ffaa66", "#ff7744"],
    staticGradient: ["#ffdd66", "#ff8833", "#ff5533"],
    orbGlow: "#ffaa44",
    mapTrailA: "#fff4e0",
    mapTrailB: "#ff6622",
  },
  ocean: {
    name: "Ocean",
    trailColors: ["#2288cc", "#22ccaa", "#3366bb", "#44ddbb", "#2299aa"],
    staticGradient: ["#44ddbb", "#2299aa", "#1144aa"],
    orbGlow: "#33bbdd",
    mapTrailA: "#ccffee",
    mapTrailB: "#1155aa",
  },
  neon: {
    name: "Neon",
    trailColors: ["#ff44cc", "#44ff88", "#44ddff", "#ffff44", "#cc44ff"],
    staticGradient: ["#44ff88", "#44ddff", "#cc44ff"],
    orbGlow: "#ff44cc",
    mapTrailA: "#eeffcc",
    mapTrailB: "#ff22aa",
  },
  mono: {
    name: "Mono",
    trailColors: ["#cccccc", "#aaaaaa", "#dddddd", "#bbbbbb", "#eeeeee"],
    staticGradient: ["#ffffff", "#cccccc", "#888888"],
    orbGlow: "#cccccc",
    mapTrailA: "#ffffff",
    mapTrailB: "#999999",
  },
  sunset: {
    name: "Sunset",
    trailColors: ["#ff4466", "#ff8844", "#cc44aa", "#ff6655", "#aa44cc"],
    staticGradient: ["#ff6644", "#cc44aa", "#6633bb"],
    orbGlow: "#ff5577",
    mapTrailA: "#ffccaa",
    mapTrailB: "#8833cc",
  },
};

export const DEFAULT_THEME_KEY = "default";

/** hex → THREE.Color 用的 helper */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

/**
 * 起降染色的資料色（docs/backlog/studio-design-system.md §7）：
 * 進場（dest 在選定機場內）/ 離場（origin 在選定機場內）。
 * 組合內互飛航線沿路由 dep → arr 漸層。暗色底圖用亮色、淡色底圖用深色。
 * 這是資料色，與 COLOR_THEMES 同樣集中在此檔（不屬於 UI chrome tokens）。
 */
export const TRAJ = {
  dark: { arr: "#5fb4ff", dep: "#ff9b55" },
  light: { arr: "#1f6fbf", dep: "#c4561b" },
} as const;
