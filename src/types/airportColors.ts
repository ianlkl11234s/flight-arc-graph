/**
 * 機場配色系統：依照起飛/目的地機場為每條航線指定顏色
 *
 * 擴充方式：在 AIRPORT_PALETTES 尾端新增項目即可（越多機場可同時上色）。
 * 分配邏輯：`assignAirportColors` 依航班數由多到少指派 palette，
 * 超出 palette 數量時，剩餘機場 fallback 到 palette[0]。
 */

import type { Flight } from "./index";

export interface AirportPalette {
  /** 顯示名稱 */
  name: string;
  /** 主色（trail、orb 用） */
  primary: string;
  /** 2D gradient A 端（低空 / 靠近 origin） */
  mapA: string;
  /** 2D gradient B 端（高空 / 靠近 dest） */
  mapB: string;
}

/** 10 組視覺上足夠分辨、且帶「夜空航班」一致調性的機場色票 */
export const AIRPORT_PALETTES: AirportPalette[] = [
  { name: "Amber",    primary: "#ffaa44", mapA: "#fff4e0", mapB: "#ff7722" },
  { name: "Cyan",     primary: "#33ccee", mapA: "#ccffee", mapB: "#1188cc" },
  { name: "Magenta",  primary: "#ff44cc", mapA: "#ffccee", mapB: "#cc1188" },
  { name: "Lime",     primary: "#88ee44", mapA: "#eeffcc", mapB: "#228822" },
  { name: "Violet",   primary: "#9966ff", mapA: "#e6d6ff", mapB: "#5522bb" },
  { name: "Coral",    primary: "#ff6655", mapA: "#ffccaa", mapB: "#cc2233" },
  { name: "Teal",     primary: "#22ccaa", mapA: "#ccffee", mapB: "#117788" },
  { name: "Gold",     primary: "#ffd633", mapA: "#fff7cc", mapB: "#cc9900" },
  { name: "Sky",      primary: "#4d99ff", mapA: "#cce0ff", mapB: "#1155bb" },
  { name: "Rose",     primary: "#ff77aa", mapA: "#ffd6e0", mapB: "#bb3366" },
];

export type AirportColorMode = "theme" | "local" | "origin" | "dest";

export interface AirportAssignment {
  /** 排序後的機場列表（依該維度計數由多到少）*/
  airports: { icao: string; count: number; palette: AirportPalette; isCustom: boolean }[];
  /** fr24_id → primary hex（給 3D trail + 2D line 用）*/
  flightColors: Map<string, string>;
  /** icao → palette（UI 顯示與 2D 漸層用）*/
  icaoToPalette: Map<string, AirportPalette>;
}

/**
 * 挑選航班端點：
 *  - local: 兩端中屬於 localAirportCodes 的那端
 *  - origin / dest: 固定該端
 */
function pickEndpoint(
  f: Flight,
  dimension: Exclude<AirportColorMode, "theme">,
  localAirportCodes: Set<string>,
): string | null {
  if (dimension === "origin") return f.origin_icao || null;
  if (dimension === "dest") return f.dest_icao || null;
  // local
  const originIn = !!f.origin_icao && localAirportCodes.has(f.origin_icao);
  const destIn = !!f.dest_icao && localAirportCodes.has(f.dest_icao);
  if (originIn) return f.origin_icao;
  if (destIn) return f.dest_icao;
  return null; // 兩端都不在目前 local 候選清單 → 不上色
}

/**
 * 根據航班集合產生機場配色指派。
 *
 * @param flights        當前顯示的航班
 * @param dimension      分色維度（local / origin / dest）
 * @param overrides      使用者手動覆寫：icao → primary hex
 * @param localAirportCodes local 模式視為本地端點的 ICAO 清單（Selection 優先，否則 region）
 */
export function assignAirportColors(
  flights: Flight[],
  dimension: Exclude<AirportColorMode, "theme">,
  overrides: Record<string, string> = {},
  localAirportCodes: string[] = [],
): AirportAssignment {
  const localAirportSet = new Set(localAirportCodes);
  // 統計每個機場的航班數
  const counts = new Map<string, number>();
  for (const f of flights) {
    const icao = pickEndpoint(f, dimension, localAirportSet);
    if (!icao) continue;
    counts.set(icao, (counts.get(icao) ?? 0) + 1);
  }

  // 依航班數由多到少排序（相同數 → 按 ICAO 字母序）
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  const icaoToPalette = new Map<string, AirportPalette>();
  const airports: AirportAssignment["airports"] = [];
  sorted.forEach(([icao, count], idx) => {
    const customHex = overrides[icao];
    const basePalette = AIRPORT_PALETTES[idx % AIRPORT_PALETTES.length]!;
    const palette: AirportPalette = customHex
      ? { ...basePalette, primary: customHex }
      : basePalette;
    icaoToPalette.set(icao, palette);
    airports.push({ icao, count, palette, isCustom: !!customHex });
  });

  const flightColors = new Map<string, string>();
  for (const f of flights) {
    const icao = pickEndpoint(f, dimension, localAirportSet);
    if (!icao) continue;
    const palette = icaoToPalette.get(icao);
    if (palette) flightColors.set(f.fr24_id, palette.primary);
  }

  return { airports, flightColors, icaoToPalette };
}
