/**
 * Deep Analysis 顏色調色盤與 perFlightColorMap 計算
 *
 * 提供兩個 API：
 *   - computeAnalysisColorMap(flights, colorBy) → Map<fr24_id, hex>
 *   - getAnalysisLegend(flights, colorBy)      → 每個分類的 {key, label, color, count}
 */

import type { Flight } from "../types";
import {
  classifyDuration,
  classifyRouteScope,
  classifyPurpose,
  getAircraftInfo,
  type AircraftCategory,
  type DurationBucket,
  type RouteScope,
  type FlightPurpose,
} from "./classify";
import { CATEGORY_LABELS } from "./aircraftDatabase";
import { AIRLINE_DB, getAirlineDisplayName } from "./airlineDatabase";
import { DURATION_LABELS, ROUTE_SCOPE_LABELS, PURPOSE_LABELS } from "./classify";

// ─── ColorBy 維度 ────────────────────────────────────────

export type AnalysisColorBy =
  | "none"
  | "category"     // 機型大小
  | "purpose"      // 飛行用途
  | "duration"     // 飛行時長
  | "routeScope"   // 航線範圍
  | "airline";     // 航空公司（Top N + Others）

export const COLOR_BY_OPTIONS: Array<{ value: AnalysisColorBy; label: string }> = [
  { value: "none",       label: "None (Default)" },
  { value: "category",   label: "Aircraft Size" },
  { value: "airline",    label: "Airline" },
  { value: "purpose",    label: "Flight Purpose" },
  { value: "duration",   label: "Flight Duration" },
  { value: "routeScope", label: "Route Scope" },
];

// ─── 調色盤 ──────────────────────────────────────────────

const CATEGORY_COLORS: Record<AircraftCategory, string> = {
  widebody:   "#ff6b6b",
  narrowbody: "#4ecdc4",
  regional:   "#ffe66d",
  prop:       "#95e1a3",
  bizjet:     "#c471ed",
  heli:       "#ff9a3c",
  military:   "#2c2c54",
  cargo:      "#b08968",
  other:      "#888888",
};

const PURPOSE_COLORS: Record<FlightPurpose, string> = {
  commercial: "#4A90E2",
  lowcost:    "#f39c12",
  regional:   "#f1c40f",
  cargo:      "#b08968",
  bizjet:     "#9b59b6",
  military:   "#2c3e50",
  training:   "#2ecc71",
  helicopter: "#e67e22",
  diverted:   "#e74c3c",
  other:      "#95a5a6",
};

const DURATION_COLORS: Record<DurationBucket, string> = {
  short:     "#2ecc71",
  medium:    "#f1c40f",
  long:      "#e67e22",
  ultralong: "#e74c3c",
  unknown:   "#95a5a6",
};

const ROUTE_SCOPE_COLORS: Record<RouteScope, string> = {
  domestic:         "#2ecc71",
  regional:         "#3498db",
  intercontinental: "#e74c3c",
  unknown:          "#95a5a6",
};

const OTHERS_COLOR = "#7f8c8d";

// ─── Legend 結構 ─────────────────────────────────────────

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  count: number;
}

// ─── 公用：flight → 分類 key ────────────────────────────

function keyForFlight(f: Flight, colorBy: AnalysisColorBy): string {
  switch (colorBy) {
    case "category":
      return getAircraftInfo(f.aircraft_type).category;
    case "purpose":
      return classifyPurpose(f);
    case "duration":
      return classifyDuration(f);
    case "routeScope":
      return classifyRouteScope(f);
    case "airline":
      return f.operating_as || "UNKNOWN";
    default:
      return "";
  }
}

// ─── 主 API 1: perFlightColorMap ────────────────────────

export function computeAnalysisColorMap(
  flights: Flight[],
  colorBy: AnalysisColorBy,
): Map<string, string> | undefined {
  if (colorBy === "none") return undefined;
  const map = new Map<string, string>();

  if (colorBy === "airline") {
    // Top 10 operating_as 用品牌色，其他歸 Others
    const counts = new Map<string, number>();
    for (const f of flights) {
      const k = f.operating_as || "UNKNOWN";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const topSet = new Set(
      [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([k]) => k),
    );
    for (const f of flights) {
      const op = f.operating_as || "UNKNOWN";
      if (topSet.has(op)) {
        const info = AIRLINE_DB[op];
        map.set(f.fr24_id, info?.brandColor ?? OTHERS_COLOR);
      } else {
        map.set(f.fr24_id, OTHERS_COLOR);
      }
    }
    return map;
  }

  for (const f of flights) {
    const k = keyForFlight(f, colorBy);
    let color = OTHERS_COLOR;
    if (colorBy === "category") color = CATEGORY_COLORS[k as AircraftCategory] ?? OTHERS_COLOR;
    else if (colorBy === "purpose") color = PURPOSE_COLORS[k as FlightPurpose] ?? OTHERS_COLOR;
    else if (colorBy === "duration") color = DURATION_COLORS[k as DurationBucket] ?? OTHERS_COLOR;
    else if (colorBy === "routeScope") color = ROUTE_SCOPE_COLORS[k as RouteScope] ?? OTHERS_COLOR;
    map.set(f.fr24_id, color);
  }
  return map;
}

// ─── 主 API 2: legend ────────────────────────────────────

export function getAnalysisLegend(
  flights: Flight[],
  colorBy: AnalysisColorBy,
): LegendItem[] {
  if (colorBy === "none") return [];

  // 聚合：key → count
  const counts = new Map<string, number>();
  for (const f of flights) {
    const k = keyForFlight(f, colorBy);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  if (colorBy === "airline") {
    // Top 10 + Others
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 10);
    const others = sorted.slice(10);
    const items: LegendItem[] = top.map(([code, n]) => {
      const info = AIRLINE_DB[code];
      const displayName = getAirlineDisplayName(code);
      return {
        key: code,
        // 顯示「長榮航空 (EVA)」/「Air France Hop (HOP)」/ 純代碼（未登錄）
        label: info ? `${displayName} (${code})` : code,
        color: info?.brandColor ?? OTHERS_COLOR,
        count: n,
      };
    });
    if (others.length > 0) {
      const othersTotal = others.reduce((s, [, n]) => s + n, 0);
      items.push({
        key: "__others__",
        label: `Others (${others.length} airlines)`,
        color: OTHERS_COLOR,
        count: othersTotal,
      });
    }
    return items;
  }

  // 其他 colorBy：依固定順序 + label 查表
  const items: LegendItem[] = [];
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, n] of sorted) {
    let label = k;
    let color = OTHERS_COLOR;
    if (colorBy === "category") {
      label = CATEGORY_LABELS[k as AircraftCategory]?.en ?? k;
      color = CATEGORY_COLORS[k as AircraftCategory] ?? OTHERS_COLOR;
    } else if (colorBy === "purpose") {
      label = PURPOSE_LABELS[k as FlightPurpose]?.en ?? k;
      color = PURPOSE_COLORS[k as FlightPurpose] ?? OTHERS_COLOR;
    } else if (colorBy === "duration") {
      label = DURATION_LABELS[k as DurationBucket]?.en ?? k;
      color = DURATION_COLORS[k as DurationBucket] ?? OTHERS_COLOR;
    } else if (colorBy === "routeScope") {
      label = ROUTE_SCOPE_LABELS[k as RouteScope]?.en ?? k;
      color = ROUTE_SCOPE_COLORS[k as RouteScope] ?? OTHERS_COLOR;
    }
    items.push({ key: k, label, color, count: n });
  }
  return items;
}
