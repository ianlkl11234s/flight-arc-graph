/**
 * Studio design tokens（A 塔台儀表 · 琥珀）。
 * 數值來源：docs/backlog/studio-design-system.md §1。
 * 與 tokens.css 必須同值，由 scripts/design/check-tokens-sync.mjs 檢查。
 * 只用於 chrome（面板／工具列／對話框）；軌跡渲染配色（colorTheme）不屬於此處。
 */

export interface ColorTokens {
  panel: string;
  border: string;
  fg1: string;
  fg2: string;
  fg3: string;
  ctl: string;
  accent: string;
  accentInk: string;
  rail: string;
  mapBg: string;
  /** 語意色：錯誤／刪除 */
  danger: string;
  /** 語意色：錄影紅（兩色同） */
  rec: string;
  /** 語意色：警示（空域限航提示等；兩色同） */
  warn: string;
  /** accent 12–16% 透明，選中底 */
  accentSoft: string;
}

export const COLOR: { dark: ColorTokens; light: ColorTokens } = {
  dark: {
    panel: "rgba(11,13,15,.62)",
    border: "rgba(214,222,230,.16)",
    fg1: "#e7ebee",
    fg2: "#a2abb3",
    fg3: "#69727a",
    ctl: "rgba(255,255,255,.05)",
    accent: "#f2a93b",
    accentInk: "#1a1206",
    rail: "rgba(7,9,11,.8)",
    mapBg: "#05070a",
    danger: "#ff6b6b",
    rec: "#e5484d",
    warn: "#f59e0b",
    accentSoft: "rgba(242,169,59,.14)",
  },
  light: {
    panel: "rgba(248,249,250,.78)",
    border: "rgba(18,24,30,.18)",
    fg1: "#10151a",
    fg2: "#4c555d",
    fg3: "#7d868e",
    ctl: "rgba(0,0,0,.04)",
    accent: "#a86200",
    accentInk: "#fff8ee",
    rail: "rgba(240,242,244,.85)",
    mapBg: "#e8eaec",
    danger: "#c62828",
    rec: "#e5484d",
    warn: "#f59e0b",
    accentSoft: "rgba(168,98,0,.12)",
  },
};

export const BLUR = 10; // px

export const FONT = {
  ui: '"JetBrains Mono","PingFang TC","Noto Sans TC",monospace',
  data: '"JetBrains Mono",ui-monospace,monospace',
} as const;

/**
 * 字級（px），key 是角色名（2026-10 最小字級 11 拍板）：
 * eyebrow 11 眉標 / minor 11.5 次要 / body 12.5 正文 / sub 13 小標 / title 15 面板標題 / large 18 大字 / caption 30 圖說機場碼
 */
export const SIZE = {
  eyebrow: 11,
  minor: 11.5,
  body: 12.5,
  sub: 13,
  title: 15,
  large: 18,
  caption: 30,
} as const;

/** 間距（px） */
export const SPACE = {
  s2: 2,
  s4: 4,
  s6: 6,
  s8: 8,
  s12: 12,
  s16: 16,
  s24: 24,
} as const;

/** 圓角（px） */
export const RADIUS = {
  base: 2,
  pill: 99,
} as const;

/** z-index 六層（照 Pulse）＋開場遮罩 */
export const Z = {
  mapOverlay: 10,
  panel: 20,
  toolbar: 25,
  popover: 30,
  modal: 40,
  toast: 50,
  /** 開場遮罩（BootScreen）：唯一高於 toast 的一層，只在首次載入期間存在 */
  boot: 60,
} as const;

/** 版面常數（px） */
export const LAYOUT = {
  railWidth: 56,
  panelWidth: 288,
  /** 寬面板（分析 › 統計：圖表 300 + 左右留白） */
  panelWidthWide: 360,
  panelLeft: 64,
  panelTop: 52,
  mapBottomInset: 64,
  dockWidth: 260,
  /** 左下圖說 + 時間軸（展開，單日、無 Compare 清單）的高度；左側面板 maxHeight 往上讓出這一塊 */
  leftBottomReserve: 184,
} as const;

