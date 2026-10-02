/**
 * 資料色／地圖疊層色 SSOT（與 colorTheme.ts 並列，兩者都在 design-guard 排除清單內）。
 * chrome 色（面板、文字、邊框）一律走 src/styles/tokens.ts；這裡只放「顏色本身是資料語意」
 * 或「疊在地圖／錄影畫面上、不隨 chrome 主題」的顏色。數值不可隨意改，改了等於改圖例意義。
 */

/** Atlas 完整度離散色（與 map/atlasGlowLayer 的 circle 版、popup、legend 同步） */
export const ATLAS_STATUS_META: Record<string, { label: string; color: string; opacity: number }> = {
  complete: { label: "完整資料", color: "#3FB8A5", opacity: 0.85 },
  "core-partial": { label: "核心（部分）", color: "#f1c40f", opacity: 0.7 },
  partial: { label: "部分（附帶）", color: "#4C84B6", opacity: 0.5 },
  planned: { label: "僅規劃（未抓）", color: "#3E434A", opacity: 0.3 },
};
export const ATLAS_STATUS_FALLBACK_COLOR = "#888";

/** Atlas 流量模式漸層圖例（低 白 → 中 橘 → 樞紐 紅） */
export const ATLAS_FLOW_GRADIENT = "linear-gradient(90deg, #ffffff 0%, #ff8c1a 50%, #ff1e1e 100%)";

/** Atlas 機場 popup（Mapbox popup 固定淺底，不隨 chrome 主題） */
export const ATLAS_POPUP = {
  ink: "#1a1a1a",
  dim: "#666",
  body: "#333",
  btnLine: "#3b82f6",
  btnSoft: "#eaf3ff",
  btnInk: "#174ea6",
} as const;

/** 日期 Compare 模式：每個日期一色 */
export const COMPARE_COLORS = ["#4488ff", "#ff4444", "#f5a623", "#44cc88"];

/** InfoModal 說明頁：視覺元素色條（對應地圖上實際元素的顏色） */
export const INFO_ELEMENT_COLORS = {
  trail: "#64aaff",
  orb: "#ffcc00",
  strobe: "#ff4444",
  staticTrail: "#8888ff",
} as const;

/** InfoModal 說明頁：資料來源色條 */
export const INFO_SOURCE_COLORS = {
  fr24: "#64aaff",
  opensky: "#1ad9e5",
  openaip: "#ff5977",
  caaEaip: "#ffbf40",
  osm: "#66bb6a",
  mapbox: "#ab47bc",
} as const;

/** 空域：類別色是 0–1 的 RGB 三元組，轉 CSS 色字串 */
export function rgbCss(rgb: readonly number[]): string {
  return `rgb(${Math.round(rgb[0]! * 255)}, ${Math.round(rgb[1]! * 255)}, ${Math.round(rgb[2]! * 255)})`;
}
export const AIRSPACE_FALLBACK_COLOR = "#888";
/** 海峽中線（地圖上畫白線，圖例同色） */
export const MEDIAN_LINE_COLOR = "#ffffff";

/** 羅盤（地球方位重置鈕）：疊在地圖上的 HUD，藍色 = 北 */
export const COMPASS = {
  north: "#64aaff",
  northLabel: "#9acbff",
  northLine: "rgba(100,170,255,0.72)",
  uprightBorder: "rgba(100,170,255,0.65)",
  dark: {
    stroke: "rgba(255,255,255,0.34)",
    dim: "rgba(255,255,255,0.18)",
    text: "rgba(255,255,255,0.82)",
    south: "rgba(255,255,255,0.58)",
    bg: "radial-gradient(circle at 34% 28%, rgba(100,170,255,0.16), rgba(0,0,0,0.55) 66%)",
    shadow: "0 5px 18px rgba(0,0,0,0.34), inset 0 0 12px rgba(100,170,255,0.08)",
  },
  light: {
    stroke: "rgba(20,30,45,0.35)",
    dim: "rgba(20,30,45,0.16)",
    text: "rgba(20,30,45,0.82)",
    south: "rgba(20,30,45,0.52)",
    bg: "radial-gradient(circle at 34% 28%, rgba(100,170,255,0.2), rgba(255,255,255,0.7) 66%)",
    shadow: "0 5px 18px rgba(30,60,90,0.14), inset 0 0 12px rgba(100,170,255,0.12)",
  },
} as const;

/** 拍攝模式疊層（暗角 + 標題文字）：錄影內容，與 useCanvasRecorder 的錄影畫面一致，不隨 chrome 主題 */
export const CAPTURE_OVERLAY = {
  vignette: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.35) 80%, rgba(0,0,0,0.6) 100%)",
  title: "#fff",
  titleShadow: "0 2px 12px rgba(0,0,0,0.6)",
  code: "rgba(255,255,255,0.7)",
  codeShadow: "0 1px 8px rgba(0,0,0,0.5)",
  time: "rgba(255,255,255,0.4)",
  coord: "rgba(255,255,255,0.3)",
  softShadow: "0 1px 6px rgba(0,0,0,0.5)",
} as const;
