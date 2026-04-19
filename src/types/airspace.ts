/* 空域分類與配色設定 */

export type AirspaceCategory =
  | "adiz"               // ADIZ 防空識別區（地緣政治邊界）
  | "restricted"         // RCR 限航區（最搶眼）
  | "prohibited"         // RCP 禁航 + RCD 危險
  | "training"           // DANGER 訓練空域 + ULZ 超輕型
  | "control"            // TMA / CTR / 管制區（Class C/D/E）
  | "fir";               // FIR 飛航情報區

export interface AirspaceCategoryConfig {
  id: AirspaceCategory;
  label: string;
  colorDark: [number, number, number];   // 深色主題 RGB (0~1)
  colorLight: [number, number, number];  // 淺色主題 RGB (0~1)
  defaultVisible: boolean;
  sortOrder: number; // 渲染順序（小→大 = 底 → 頂）
}

export const AIRSPACE_CATEGORIES: AirspaceCategoryConfig[] = [
  {
    id: "adiz",
    label: "ADIZ",
    colorDark: [1.0, 0.75, 0.25],   // 琥珀金
    colorLight: [0.85, 0.55, 0.1],
    defaultVisible: true,
    sortOrder: 6,
  },
  {
    id: "restricted",
    label: "Restricted (RCR)",
    colorDark: [1.0, 0.35, 0.45],   // 暖紅
    colorLight: [0.9, 0.2, 0.25],
    defaultVisible: true,
    sortOrder: 4,
  },
  {
    id: "prohibited",
    label: "Prohibited / Danger",
    colorDark: [1.0, 0.2, 0.8],     // 紫紅
    colorLight: [0.85, 0.1, 0.55],
    defaultVisible: true,
    sortOrder: 5,
  },
  {
    id: "training",
    label: "Training / ULZ",
    colorDark: [0.4, 1.0, 0.7],     // 青綠
    colorLight: [0.15, 0.7, 0.45],
    defaultVisible: true,
    sortOrder: 3,
  },
  {
    id: "control",
    label: "TMA / Control",
    colorDark: [0.35, 0.75, 1.0],   // 冷藍
    colorLight: [0.1, 0.45, 0.85],
    defaultVisible: false,
    sortOrder: 2,
  },
  {
    id: "fir",
    label: "FIR",
    colorDark: [0.85, 0.9, 1.0],    // 淡白
    colorLight: [0.55, 0.6, 0.75],
    defaultVisible: false,
    sortOrder: 1,
  },
];

export const AIRSPACE_CATEGORY_BY_ID: Record<AirspaceCategory, AirspaceCategoryConfig> =
  Object.fromEntries(AIRSPACE_CATEGORIES.map((c) => [c.id, c])) as Record<AirspaceCategory, AirspaceCategoryConfig>;

/** 依 eAIP layer 字串分類 */
export function classifyAirspace(layer: string): AirspaceCategory {
  const L = (layer || "").toUpperCase();
  if (L === "ADIZ") return "adiz";
  if (L === "RCR") return "restricted";
  if (L === "RCP" || L === "RCD") return "prohibited";
  if (L === "DANGER" || L === "ULZ") return "training";
  if (L === "TMA" || L.startsWith("CTR") || L === "C" || L === "D" || L === "E") return "control";
  if (L === "FIR") return "fir";
  return "control";
}

export interface AirspaceSettings {
  /** 總開關 */
  enabled: boolean;
  /** 各分類可見性 */
  visibility: Record<AirspaceCategory, boolean>;
  /** 整體不透明度 0~1 */
  opacity: number;
  /** 高度倍率 0.5~5 */
  heightScale: number;
  /** 頂邊發光強度 0~2 */
  edgeGlow: number;
  /** 海峽中線顯示（獨立於 polygon airspace，走 Mapbox line layer） */
  showMedianLine: boolean;
}

export function defaultAirspaceSettings(): AirspaceSettings {
  const visibility: Record<AirspaceCategory, boolean> = {
    adiz: true,
    restricted: true,
    prohibited: true,
    training: true,
    control: false,
    fir: false,
  };
  for (const c of AIRSPACE_CATEGORIES) visibility[c.id] = c.defaultVisible;
  return {
    enabled: false,     // 預設關閉，使用者從 Airspace 面板手動開啟
    visibility,
    opacity: 0.35,
    heightScale: 1.8,
    edgeGlow: 0.8,
    showMedianLine: true,
  };
}
