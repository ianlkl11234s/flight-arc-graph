import type { CSSProperties } from "react";
import type { ColorTokens } from "../styles/tokens";

/**
 * 把當前主題色寫成元件 root 上的 CSS 變數（--fa-*），供 src/styles/ui.css 的偽元素／thumb 取用。
 * 不依賴 <html data-theme>：同頁並排兩個 ThemeProvider（活元件頁）時各自正確。
 */
export function themeVars(t: ColorTokens): CSSProperties {
  return {
    "--fa-accent": t.accent,
    "--fa-accent-ink": t.accentInk,
    "--fa-fg1": t.fg1,
    "--fa-fg3": t.fg3,
    "--fa-border": t.border,
  } as CSSProperties;
}

/** 在 token 色上取透明度（不寫死色碼）。 */
export function mix(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

/** 眉標共用字樣：9px、字距 .18em、大寫、mono */
export const EYEBROW_LETTER_SPACING = ".18em";
