/**
 * 飛行分類 Helper API
 *
 * 提供統一的分類入口，讓 UI 不必關心資料表細節。
 * 所有函式都接受 `Flight` 物件（來自 src/types）。
 */

import type { Flight } from "../types";
import {
  getAircraftInfo,
  type AircraftCategory,
  type WakeCategory,
  type AircraftInfo,
} from "./aircraftDatabase";
import {
  getAirlineInfo,
  type AirlineType,
  type AirlineInfo,
} from "./airlineDatabase";

export type { AircraftCategory, WakeCategory, AirlineType, AircraftInfo, AirlineInfo };
export { getAircraftInfo, getAirlineInfo };

// ─── 飛行時長 bucket ────────────────────────────────────

export type DurationBucket = "short" | "medium" | "long" | "ultralong" | "unknown";

export const DURATION_LABELS: Record<DurationBucket, { en: string; zh: string; min: number; max: number }> = {
  short:     { en: "Short (< 1h)",    zh: "短程 (< 1h)",   min: 0,     max: 3600 },
  medium:    { en: "Medium (1-3h)",   zh: "中程 (1-3h)",   min: 3600,  max: 10800 },
  long:      { en: "Long (3-6h)",     zh: "長程 (3-6h)",   min: 10800, max: 21600 },
  ultralong: { en: "Ultra-long (6h+)", zh: "超長程 (6h+)", min: 21600, max: Infinity },
  unknown:   { en: "Unknown",         zh: "未知",          min: 0,     max: 0 },
};

export function getFlightDuration(flight: Flight): number {
  if (!flight.dep_time || !flight.arr_time) return 0;
  const d = flight.arr_time - flight.dep_time;
  return d > 0 ? d : 0;
}

export function classifyDuration(flight: Flight): DurationBucket {
  const d = getFlightDuration(flight);
  if (d <= 0) return "unknown";
  if (d < 3600) return "short";
  if (d < 10800) return "medium";
  if (d < 21600) return "long";
  return "ultralong";
}

// ─── 航線類型：域內 / 區域 / 跨洲 ────────────────────────

export type RouteScope = "domestic" | "regional" | "intercontinental" | "unknown";

/** ICAO 機場代碼前 1-2 字 → 大洲 粗略分類 */
function icaoToContinent(icao: string | undefined): string | null {
  if (!icao || icao.length < 2) return null;
  const p1 = icao[0]!;
  const p2 = icao.slice(0, 2);
  // 北美
  if (p1 === "K" || p1 === "C" || p1 === "M") return "NA";
  if (p2 === "PA" || p2 === "PH" || p2 === "PF") return "NA"; // Alaska / Hawaii / French Pacific
  // 南美
  if (p1 === "S") return "SA";
  // 歐洲
  if (p1 === "E" || p1 === "L" || p1 === "B") return "EU";
  if (p2 === "UK" || p2 === "UM" || p2 === "UR") return "EU"; // 舊蘇聯西部
  if (p1 === "U") return "EU"; // 俄羅斯多半
  // 非洲
  if (p1 === "D" || p1 === "F" || p1 === "G" || p1 === "H") return "AF";
  // 亞洲
  if (p1 === "O" || p1 === "V" || p1 === "Z" || p1 === "R" || p1 === "W") return "AS";
  if (p1 === "T" && !["TB", "TD", "TF", "TG", "TI", "TJ", "TK", "TL", "TM", "TN", "TQ", "TR", "TT", "TU", "TV", "TX"].includes(p2)) {
    return "AS"; // 多數 T 開頭是中東 — 但 TB/TD... 是加勒比，排除
  }
  if (["TB", "TD", "TF", "TG", "TI", "TJ", "TK", "TL", "TN", "TQ", "TR", "TT", "TU", "TV", "TX"].includes(p2)) return "NA";
  // 大洋洲
  if (p1 === "Y" || p1 === "N") return "OC";
  if (p1 === "A" && ["AG", "AN", "AY"].includes(p2)) return "OC";
  // 南極
  if (p1 === "A" && p2 === "AN") return "AN";
  return null;
}

export function classifyRouteScope(flight: Flight): RouteScope {
  const oC = icaoToContinent(flight.origin_icao);
  const dC = icaoToContinent(flight.dest_icao || flight.dest_icao_actual);
  if (!oC || !dC) return "unknown";
  if (oC !== dC) return "intercontinental";
  // 同洲：用前 2 碼判 domestic / regional
  const o2 = flight.origin_icao.slice(0, 2);
  const d2 = (flight.dest_icao || flight.dest_icao_actual || "").slice(0, 2);
  if (o2 && d2 && o2 === d2) return "domestic";
  return "regional";
}

export const ROUTE_SCOPE_LABELS: Record<RouteScope, { en: string; zh: string }> = {
  domestic:         { en: "Domestic",         zh: "國內" },
  regional:         { en: "Regional",         zh: "區域" },
  intercontinental: { en: "Intercontinental", zh: "跨洲" },
  unknown:          { en: "Unknown",          zh: "未知" },
};

// ─── 飛行用途：啟發式判斷 ───────────────────────────────

export type FlightPurpose =
  | "commercial"   // 一般商業客運
  | "cargo"        // 貨運
  | "lowcost"      // 低成本
  | "regional"     // 區域線
  | "bizjet"       // 商務噴射
  | "military"     // 軍用
  | "training"     // 訓練
  | "helicopter"   // 直升機
  | "diverted"     // 轉降（額外 tag，可與其他並存）
  | "other";

/** 軍用 hex 前綴範圍（保守，誤判率低）
 *  US: AE0000-AFFFFF
 *  UK: 43C000-43FFFF
 *  DE: 3F9000-3FBFFF（大略）
 */
function isMilitaryHex(hex: string | undefined): boolean {
  if (!hex) return false;
  const h = hex.toUpperCase();
  // US military
  if (h >= "AE0000" && h <= "AFFFFF") return true;
  // UK military
  if (h >= "43C000" && h <= "43FFFF") return true;
  return false;
}

/** 訓練機型（單引擎 Diamond / Cessna 教練機常見代碼） */
const TRAINING_TYPES = new Set(["DA40", "DA42", "C172", "C152", "PA28", "DA20", "P28A", "P28B"]);

export function classifyPurpose(flight: Flight): FlightPurpose {
  // 1. 軍用（hex + 已知軍機型）
  if (isMilitaryHex(flight.hex)) return "military";
  const acInfo = getAircraftInfo(flight.aircraft_type);
  if (acInfo.category === "military") return "military";
  // 2. 訓練機
  if (flight.aircraft_type && TRAINING_TYPES.has(flight.aircraft_type.toUpperCase())) return "training";
  // 3. 直升機
  if (acInfo.category === "heli") return "helicopter";
  // 4. 商務噴射
  if (acInfo.category === "bizjet") return "bizjet";
  // 5. 靠 operator type 判貨運/低成本/區域
  const op = getAirlineInfo(flight.operating_as);
  if (op.type === "cargo") return "cargo";
  if (op.type === "lowcost") return "lowcost";
  if (op.type === "regional") return "regional";
  if (op.type === "military") return "military";
  if (op.type === "fullservice") return "commercial";
  return "other";
}

export const PURPOSE_LABELS: Record<FlightPurpose, { en: string; zh: string; order: number }> = {
  commercial: { en: "Commercial",    zh: "商業客運", order: 1 },
  lowcost:    { en: "Low Cost",      zh: "低成本",   order: 2 },
  regional:   { en: "Regional",      zh: "區域線",   order: 3 },
  cargo:      { en: "Cargo",         zh: "貨運",     order: 4 },
  bizjet:     { en: "Business Jet",  zh: "商務噴射", order: 5 },
  military:   { en: "Military",      zh: "軍用",     order: 6 },
  training:   { en: "Training",      zh: "訓練",     order: 7 },
  helicopter: { en: "Helicopter",    zh: "直升機",   order: 8 },
  diverted:   { en: "Diverted",      zh: "轉降",     order: 9 },
  other:      { en: "Other",         zh: "其他",     order: 99 },
};

// ─── 轉降偵測 ────────────────────────────────────────────

export function isDiverted(flight: Flight): boolean {
  return (
    !!flight.dest_icao_actual &&
    !!flight.dest_icao &&
    flight.dest_icao !== flight.dest_icao_actual
  );
}

// ─── Wet Lease / Codeshare 偵測 ──────────────────────────

export function isWetLeaseOrCodeshare(flight: Flight): boolean {
  return (
    !!flight.operating_as &&
    !!flight.painted_as &&
    flight.operating_as !== flight.painted_as
  );
}
