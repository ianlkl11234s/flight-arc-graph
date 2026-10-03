/**
 * 開場雷達（BootScreen）的所有可調參數，集中一處。
 * 調整頁：dev server 下開 /boot-tuner.html，調好按「複製設定」把整段貼回這裡（取代 BOOT_LAYOUT）。
 * 正式站只讀這裡的預設值，不讀 localStorage（調整頁的暫存值只屬於調整頁）。
 */
import { SIZE } from "../../styles/tokens";

export interface BootLayout {
  /** 雷達直徑，佔畫面高度（vh） */
  radarVh: number;
  /** 雷達直徑上限，佔畫面寬度（vw；手機直立時由這個決定） */
  radarMaxVw: number;
  /** 雷達中心相對畫面中心的位移（vw／vh，正值往右／往下） */
  offsetXVw: number;
  offsetYVh: number;
  /** 距離環數 */
  rings: number;
  /** 掃描一圈秒數 */
  sweepS: number;
  /** 最外圈代表的實際距離（km）：只畫這個半徑內的真實機場 */
  radiusKm: number;
  /** 機場點半徑（px，剛被掃到時會再放大一點） */
  dotPx: number;
  /** 字標字級（px，最小 11） */
  wordmarkPx: number;
  /** 雷達下緣到字標的距離（px） */
  wordmarkGapPx: number;
  /** 字標整組（含狀態 chip）額外 Y 位移（px，正值往下） */
  wordmarkOffsetYPx: number;
  /** 字標到狀態 chip 的距離（px） */
  chipGapPx: number;
  /** 開場最少顯示時間（ms） */
  minShowMs: number;
  /** 進場（面板彈入）總時長倍率：1 = 0.85s 彈入、延遲 0–0.70s */
  enterScale: number;
}

export const BOOT_LAYOUT: BootLayout = {
  radarVh: 42,
  radarMaxVw: 86,
  offsetXVw: 0,
  offsetYVh: -9,
  rings: 3,
  sweepS: 1.6,
  radiusKm: 350,
  dotPx: 2.4,
  wordmarkPx: SIZE.caption,
  wordmarkGapPx: 28,
  wordmarkOffsetYPx: 0,
  chipGapPx: 18,
  minShowMs: 2000,
  enterScale: 1,
};

export interface BootLayoutField {
  key: keyof BootLayout;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

/** 調整頁的控制項（順序＝面板順序）；每個 BootLayout 參數一個 */
export const BOOT_LAYOUT_FIELDS: BootLayoutField[] = [
  { key: "radarVh", label: "雷達直徑", unit: "vh", min: 10, max: 80, step: 0.5 },
  { key: "radarMaxVw", label: "雷達直徑上限", unit: "vw", min: 30, max: 100, step: 1 },
  { key: "offsetXVw", label: "雷達中心 X 位移", unit: "vw", min: -40, max: 40, step: 0.5 },
  { key: "offsetYVh", label: "雷達中心 Y 位移", unit: "vh", min: -40, max: 40, step: 0.5 },
  { key: "rings", label: "距離環數", unit: "", min: 1, max: 8, step: 1 },
  { key: "sweepS", label: "掃描一圈", unit: "s", min: 0.4, max: 6, step: 0.1 },
  { key: "radiusKm", label: "外圈距離", unit: "km", min: 50, max: 1500, step: 10 },
  { key: "dotPx", label: "點的大小", unit: "px", min: 0.5, max: 8, step: 0.1 },
  { key: "wordmarkPx", label: "字標字級", unit: "px", min: 11, max: 72, step: 1 },
  { key: "wordmarkGapPx", label: "字標與雷達間距", unit: "px", min: 0, max: 160, step: 1 },
  { key: "wordmarkOffsetYPx", label: "字標 Y 位移", unit: "px", min: -200, max: 200, step: 1 },
  { key: "chipGapPx", label: "狀態 chip 間距", unit: "px", min: 0, max: 80, step: 1 },
  { key: "minShowMs", label: "最少顯示時間", unit: "ms", min: 0, max: 8000, step: 100 },
  { key: "enterScale", label: "進場總時長倍率", unit: "×", min: 0.25, max: 3, step: 0.05 },
];

/** 把任意物件收斂成合法的 BootLayout（缺值用預設、超出範圍夾回、非數字丟掉）。調整頁讀 localStorage 用。 */
export function sanitizeBootLayout(raw: unknown, base: BootLayout = BOOT_LAYOUT): BootLayout {
  const out: BootLayout = { ...base };
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const f of BOOT_LAYOUT_FIELDS) {
    const v = src[f.key];
    if (typeof v === "number" && Number.isFinite(v)) out[f.key] = Math.min(f.max, Math.max(f.min, v));
  }
  return out;
}

/** 輸出可直接貼回本檔取代 BOOT_LAYOUT 的 TS 文字 */
export function formatBootLayoutTs(layout: BootLayout): string {
  const lines = BOOT_LAYOUT_FIELDS.map((f) => `  ${f.key}: ${+layout[f.key].toFixed(4)},`);
  return `export const BOOT_LAYOUT: BootLayout = {\n${lines.join("\n")}\n};\n`;
}

export interface BootGeometry {
  /** 雷達直徑（px） */
  diameter: number;
  /** 雷達中心（px，相對開場畫面左上） */
  cx: number;
  cy: number;
  /** 字標整組的上緣（px） */
  footTop: number;
}

/** 依畫面實際寬高（px）算雷達與字標位置。 */
export function bootGeometry(layout: BootLayout, width: number, height: number): BootGeometry {
  const vh = height / 100;
  const vw = width / 100;
  const diameter = Math.max(0, Math.min(layout.radarVh * vh, layout.radarMaxVw * vw));
  const cx = width / 2 + layout.offsetXVw * vw;
  const cy = height / 2 + layout.offsetYVh * vh;
  return {
    diameter,
    cx,
    cy,
    footTop: cy + diameter / 2 + layout.wordmarkGapPx + layout.wordmarkOffsetYPx,
  };
}
