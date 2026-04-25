/**
 * 機型資料庫 — 以 ICAO type designator 為 key
 *
 * 涵蓋範圍：JSONL Top 30+ 機型（佔流量 >90%），加上特殊機型（軍用/商務噴射/訓練）。
 * 未列出的機型用 `getAircraftInfo()` 會拿到 fallback。
 *
 * category 定義：
 *   - widebody    雙通道客機（777/787/A350/A330/A380…）
 *   - narrowbody  單通道客機（737/A320/A321neo…）
 *   - regional    區域線客機（E190/CRJ/A220…）
 *   - prop        螺旋槳（ATR/Dash 8/F50…）
 *   - bizjet      商務噴射
 *   - heli        直升機
 *   - military    軍用
 *   - cargo       貨機專用型號（通常和客機共用機型碼，用 operator 判比較準）
 *   - other       不在上述類別（無人機/特殊用途）
 *
 * wake (Wake Turbulence Category)：
 *   - J  Super（A380, B748）
 *   - H  Heavy（>136 噸）
 *   - M  Medium（7~136 噸）
 *   - L  Light（<7 噸）
 */

export type AircraftCategory =
  | "widebody"
  | "narrowbody"
  | "regional"
  | "prop"
  | "bizjet"
  | "heli"
  | "military"
  | "cargo"
  | "other";

export type WakeCategory = "J" | "H" | "M" | "L";

export interface AircraftInfo {
  /** 顯示名稱（Boeing 737-800） */
  name: string;
  /** 製造商 */
  manufacturer: "Airbus" | "Boeing" | "Embraer" | "ATR" | "Bombardier" | "McDonnell Douglas" | "Gulfstream" | "Dassault" | "Cessna" | "Diamond" | "Comac" | "Agusta" | "Bell" | "Sikorsky" | "Lockheed" | "Northrop Grumman" | "Other";
  category: AircraftCategory;
  wake: WakeCategory;
  /** 典型雙艙布局座位數（approx.） */
  seats: number;
}

export const AIRCRAFT_DB: Record<string, AircraftInfo> = {
  // ── Widebody（雙通道客機）───────────────────────────
  A388: { name: "Airbus A380-800", manufacturer: "Airbus", category: "widebody", wake: "J", seats: 525 },
  B744: { name: "Boeing 747-400", manufacturer: "Boeing", category: "widebody", wake: "J", seats: 416 },
  B748: { name: "Boeing 747-8", manufacturer: "Boeing", category: "widebody", wake: "J", seats: 467 },
  A359: { name: "Airbus A350-900", manufacturer: "Airbus", category: "widebody", wake: "H", seats: 325 },
  A35K: { name: "Airbus A350-1000", manufacturer: "Airbus", category: "widebody", wake: "H", seats: 369 },
  A332: { name: "Airbus A330-200", manufacturer: "Airbus", category: "widebody", wake: "H", seats: 246 },
  A333: { name: "Airbus A330-300", manufacturer: "Airbus", category: "widebody", wake: "H", seats: 300 },
  A338: { name: "Airbus A330-800neo", manufacturer: "Airbus", category: "widebody", wake: "H", seats: 257 },
  A339: { name: "Airbus A330-900neo", manufacturer: "Airbus", category: "widebody", wake: "H", seats: 287 },
  B772: { name: "Boeing 777-200", manufacturer: "Boeing", category: "widebody", wake: "H", seats: 314 },
  B77L: { name: "Boeing 777-200LR / 777F", manufacturer: "Boeing", category: "widebody", wake: "H", seats: 317 },
  B77W: { name: "Boeing 777-300ER", manufacturer: "Boeing", category: "widebody", wake: "H", seats: 396 },
  B778: { name: "Boeing 777-8", manufacturer: "Boeing", category: "widebody", wake: "H", seats: 384 },
  B779: { name: "Boeing 777-9", manufacturer: "Boeing", category: "widebody", wake: "H", seats: 426 },
  B788: { name: "Boeing 787-8", manufacturer: "Boeing", category: "widebody", wake: "H", seats: 242 },
  B789: { name: "Boeing 787-9", manufacturer: "Boeing", category: "widebody", wake: "H", seats: 296 },
  B78X: { name: "Boeing 787-10", manufacturer: "Boeing", category: "widebody", wake: "H", seats: 336 },
  B762: { name: "Boeing 767-200", manufacturer: "Boeing", category: "widebody", wake: "H", seats: 216 },
  B763: { name: "Boeing 767-300", manufacturer: "Boeing", category: "widebody", wake: "H", seats: 269 },
  B764: { name: "Boeing 767-400ER", manufacturer: "Boeing", category: "widebody", wake: "H", seats: 304 },
  A306: { name: "Airbus A300-600", manufacturer: "Airbus", category: "widebody", wake: "H", seats: 266 },
  A310: { name: "Airbus A310", manufacturer: "Airbus", category: "widebody", wake: "H", seats: 220 },
  MD11: { name: "McDonnell Douglas MD-11", manufacturer: "McDonnell Douglas", category: "widebody", wake: "H", seats: 293 },

  // ── Narrowbody（單通道客機）─────────────────────────
  A318: { name: "Airbus A318", manufacturer: "Airbus", category: "narrowbody", wake: "M", seats: 132 },
  A319: { name: "Airbus A319", manufacturer: "Airbus", category: "narrowbody", wake: "M", seats: 156 },
  A320: { name: "Airbus A320", manufacturer: "Airbus", category: "narrowbody", wake: "M", seats: 180 },
  A321: { name: "Airbus A321", manufacturer: "Airbus", category: "narrowbody", wake: "M", seats: 200 },
  A19N: { name: "Airbus A319neo", manufacturer: "Airbus", category: "narrowbody", wake: "M", seats: 160 },
  A20N: { name: "Airbus A320neo", manufacturer: "Airbus", category: "narrowbody", wake: "M", seats: 194 },
  A21N: { name: "Airbus A321neo", manufacturer: "Airbus", category: "narrowbody", wake: "M", seats: 220 },
  B712: { name: "Boeing 717-200", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 117 },
  B732: { name: "Boeing 737-200", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 130 },
  B733: { name: "Boeing 737-300", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 140 },
  B734: { name: "Boeing 737-400", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 150 },
  B735: { name: "Boeing 737-500", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 122 },
  B736: { name: "Boeing 737-600", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 130 },
  B737: { name: "Boeing 737-700", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 149 },
  B738: { name: "Boeing 737-800", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 189 },
  B739: { name: "Boeing 737-900", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 220 },
  B37M: { name: "Boeing 737 MAX 7", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 172 },
  B38M: { name: "Boeing 737 MAX 8", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 189 },
  B39M: { name: "Boeing 737 MAX 9", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 220 },
  B3XM: { name: "Boeing 737 MAX 10", manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 230 },
  BCS1: { name: "Airbus A220-100", manufacturer: "Airbus", category: "narrowbody", wake: "M", seats: 110 },
  BCS3: { name: "Airbus A220-300", manufacturer: "Airbus", category: "narrowbody", wake: "M", seats: 141 },
  MD80: { name: "MD-80 series", manufacturer: "McDonnell Douglas", category: "narrowbody", wake: "M", seats: 160 },
  MD82: { name: "MD-82", manufacturer: "McDonnell Douglas", category: "narrowbody", wake: "M", seats: 150 },
  MD83: { name: "MD-83", manufacturer: "McDonnell Douglas", category: "narrowbody", wake: "M", seats: 150 },
  MD88: { name: "MD-88", manufacturer: "McDonnell Douglas", category: "narrowbody", wake: "M", seats: 150 },
  MD90: { name: "MD-90", manufacturer: "McDonnell Douglas", category: "narrowbody", wake: "M", seats: 163 },
  // 中國國產
  C919: { name: "COMAC C919", manufacturer: "Comac", category: "narrowbody", wake: "M", seats: 168 },
  AJ27: { name: "COMAC ARJ21", manufacturer: "Comac", category: "narrowbody", wake: "M", seats: 90 },
  SU95: { name: "Sukhoi Superjet 100", manufacturer: "Other", category: "narrowbody", wake: "M", seats: 98 },

  // ── Regional（區域線噴射 / 較小）────────────────────
  E145: { name: "Embraer ERJ 145", manufacturer: "Embraer", category: "regional", wake: "M", seats: 50 },
  E170: { name: "Embraer E170", manufacturer: "Embraer", category: "regional", wake: "M", seats: 72 },
  E75L: { name: "Embraer E175 (long wing)", manufacturer: "Embraer", category: "regional", wake: "M", seats: 76 },
  E75S: { name: "Embraer E175 (short wing)", manufacturer: "Embraer", category: "regional", wake: "M", seats: 76 },
  E190: { name: "Embraer E190", manufacturer: "Embraer", category: "regional", wake: "M", seats: 100 },
  E195: { name: "Embraer E195", manufacturer: "Embraer", category: "regional", wake: "M", seats: 124 },
  E290: { name: "Embraer E190-E2", manufacturer: "Embraer", category: "regional", wake: "M", seats: 106 },
  E295: { name: "Embraer E195-E2", manufacturer: "Embraer", category: "regional", wake: "M", seats: 132 },
  CRJ2: { name: "CRJ-200", manufacturer: "Bombardier", category: "regional", wake: "M", seats: 50 },
  CRJ7: { name: "CRJ-700", manufacturer: "Bombardier", category: "regional", wake: "M", seats: 70 },
  CRJ9: { name: "CRJ-900", manufacturer: "Bombardier", category: "regional", wake: "M", seats: 90 },
  CRJX: { name: "CRJ-1000", manufacturer: "Bombardier", category: "regional", wake: "M", seats: 104 },

  // ── Prop（螺旋槳）──────────────────────────────────
  AT43: { name: "ATR 42-300/320", manufacturer: "ATR", category: "prop", wake: "L", seats: 50 },
  AT45: { name: "ATR 42-500", manufacturer: "ATR", category: "prop", wake: "L", seats: 50 },
  AT46: { name: "ATR 42-600", manufacturer: "ATR", category: "prop", wake: "L", seats: 50 },
  AT72: { name: "ATR 72-200", manufacturer: "ATR", category: "prop", wake: "M", seats: 70 },
  AT75: { name: "ATR 72-500", manufacturer: "ATR", category: "prop", wake: "M", seats: 72 },
  AT76: { name: "ATR 72-600", manufacturer: "ATR", category: "prop", wake: "M", seats: 70 },
  DH8A: { name: "Dash 8-100", manufacturer: "Bombardier", category: "prop", wake: "L", seats: 37 },
  DH8B: { name: "Dash 8-200", manufacturer: "Bombardier", category: "prop", wake: "L", seats: 37 },
  DH8C: { name: "Dash 8-300", manufacturer: "Bombardier", category: "prop", wake: "M", seats: 50 },
  DH8D: { name: "Dash 8-Q400", manufacturer: "Bombardier", category: "prop", wake: "M", seats: 78 },
  F50: { name: "Fokker 50", manufacturer: "Other", category: "prop", wake: "L", seats: 58 },
  SF34: { name: "Saab 340", manufacturer: "Other", category: "prop", wake: "L", seats: 34 },

  // ── Bizjet（商務噴射）──────────────────────────────
  GLF4: { name: "Gulfstream G450/G-IV", manufacturer: "Gulfstream", category: "bizjet", wake: "M", seats: 16 },
  GLF5: { name: "Gulfstream G550/G-V", manufacturer: "Gulfstream", category: "bizjet", wake: "M", seats: 19 },
  GLF6: { name: "Gulfstream G650", manufacturer: "Gulfstream", category: "bizjet", wake: "M", seats: 19 },
  GL5T: { name: "Gulfstream G500", manufacturer: "Gulfstream", category: "bizjet", wake: "M", seats: 19 },
  GL7T: { name: "Gulfstream G700", manufacturer: "Gulfstream", category: "bizjet", wake: "M", seats: 19 },
  GLEX: { name: "Bombardier Global Express", manufacturer: "Bombardier", category: "bizjet", wake: "M", seats: 19 },
  G280: { name: "Gulfstream G280", manufacturer: "Gulfstream", category: "bizjet", wake: "M", seats: 10 },
  GA7C: { name: "Gulfstream G700/G800", manufacturer: "Gulfstream", category: "bizjet", wake: "M", seats: 19 },
  CL30: { name: "Bombardier Challenger 300", manufacturer: "Bombardier", category: "bizjet", wake: "M", seats: 9 },
  CL35: { name: "Bombardier Challenger 350", manufacturer: "Bombardier", category: "bizjet", wake: "M", seats: 10 },
  CL60: { name: "Bombardier Challenger 600/650", manufacturer: "Bombardier", category: "bizjet", wake: "M", seats: 12 },
  FA8X: { name: "Dassault Falcon 8X", manufacturer: "Dassault", category: "bizjet", wake: "M", seats: 16 },
  F2TH: { name: "Dassault Falcon 2000", manufacturer: "Dassault", category: "bizjet", wake: "M", seats: 10 },
  C56X: { name: "Cessna Citation Excel/XLS", manufacturer: "Cessna", category: "bizjet", wake: "L", seats: 9 },
  C25C: { name: "Cessna Citation CJ4", manufacturer: "Cessna", category: "bizjet", wake: "L", seats: 9 },
  C25M: { name: "Cessna Citation M2", manufacturer: "Cessna", category: "bizjet", wake: "L", seats: 7 },
  ASTR: { name: "Gulfstream G100/G150", manufacturer: "Gulfstream", category: "bizjet", wake: "L", seats: 8 },

  // ── Helicopter ─────────────────────────────────────
  A169: { name: "Agusta AW169", manufacturer: "Agusta", category: "heli", wake: "L", seats: 10 },
  B407: { name: "Bell 407", manufacturer: "Bell", category: "heli", wake: "L", seats: 6 },

  // ── Military ───────────────────────────────────────
  P8: { name: "Boeing P-8 Poseidon", manufacturer: "Boeing", category: "military", wake: "M", seats: 9 },
  P3: { name: "Lockheed P-3 Orion", manufacturer: "Lockheed", category: "military", wake: "M", seats: 11 },
  E3TF: { name: "Boeing E-3 Sentry (AWACS)", manufacturer: "Boeing", category: "military", wake: "H", seats: 0 },
  C17: { name: "Boeing C-17 Globemaster III", manufacturer: "Boeing", category: "military", wake: "H", seats: 0 },
  C130: { name: "Lockheed C-130 Hercules", manufacturer: "Lockheed", category: "military", wake: "M", seats: 0 },
  K35R: { name: "Boeing KC-135R Stratotanker", manufacturer: "Boeing", category: "military", wake: "H", seats: 0 },
  K35E: { name: "Boeing KC-135E", manufacturer: "Boeing", category: "military", wake: "H", seats: 0 },
  KC46: { name: "Boeing KC-46 Pegasus", manufacturer: "Boeing", category: "military", wake: "H", seats: 0 },
  E7: { name: "Boeing E-7 Wedgetail", manufacturer: "Boeing", category: "military", wake: "M", seats: 0 },
  RC35: { name: "RC-135 Rivet Joint", manufacturer: "Boeing", category: "military", wake: "H", seats: 0 },
  U2: { name: "Lockheed U-2 Dragon Lady", manufacturer: "Lockheed", category: "military", wake: "M", seats: 2 },
  B52: { name: "Boeing B-52 Stratofortress", manufacturer: "Boeing", category: "military", wake: "H", seats: 0 },
  GHWK: { name: "Northrop Grumman RQ-4 Global Hawk", manufacturer: "Northrop Grumman", category: "military", wake: "M", seats: 0 },
  DRON: { name: "Generic UAV / Drone", manufacturer: "Other", category: "military", wake: "L", seats: 0 },

  // ── Training（教練機）──────────────────────────────
  DA40: { name: "Diamond DA40", manufacturer: "Diamond", category: "prop", wake: "L", seats: 4 },
  DA42: { name: "Diamond DA42 Twin Star", manufacturer: "Diamond", category: "prop", wake: "L", seats: 4 },
};

/**
 * Fallback：如果 type 代碼在 DB 找不到，用前綴 heuristic 推斷
 */
function heuristicFallback(type: string): AircraftInfo {
  const t = type.toUpperCase();
  // Boeing 747/777/787 系列
  if (/^B7[4578]/.test(t)) {
    return { name: `Boeing ${t}`, manufacturer: "Boeing", category: "widebody", wake: "H", seats: 300 };
  }
  // Boeing 737 系列
  if (/^B73|^B3[789]M/.test(t)) {
    return { name: `Boeing ${t}`, manufacturer: "Boeing", category: "narrowbody", wake: "M", seats: 180 };
  }
  // Airbus A3xx
  if (/^A3[23]/.test(t) || /^A[12]\dN?$/.test(t)) {
    return { name: `Airbus ${t}`, manufacturer: "Airbus", category: "narrowbody", wake: "M", seats: 180 };
  }
  if (/^A3[3456789]|^A38|^A35/.test(t)) {
    return { name: `Airbus ${t}`, manufacturer: "Airbus", category: "widebody", wake: "H", seats: 290 };
  }
  // Embraer E-jet
  if (/^E[1-2]\d[05]/.test(t)) {
    return { name: `Embraer ${t}`, manufacturer: "Embraer", category: "regional", wake: "M", seats: 100 };
  }
  // Bombardier CRJ
  if (/^CRJ/.test(t)) {
    return { name: `Bombardier ${t}`, manufacturer: "Bombardier", category: "regional", wake: "M", seats: 75 };
  }
  // ATR
  if (/^AT[47]/.test(t)) {
    return { name: `ATR ${t}`, manufacturer: "ATR", category: "prop", wake: "L", seats: 60 };
  }
  return {
    name: type || "Unknown",
    manufacturer: "Other",
    category: "other",
    wake: "M",
    seats: 0,
  };
}

/** 統一查詢入口；type 找不到會回 fallback，不會 throw */
export function getAircraftInfo(type: string | undefined): AircraftInfo {
  if (!type) return heuristicFallback("");
  const t = type.toUpperCase();
  return AIRCRAFT_DB[t] ?? heuristicFallback(t);
}

/** UI 用：category 的中英文 label + 排序權重 */
export const CATEGORY_LABELS: Record<AircraftCategory, { en: string; zh: string; order: number }> = {
  widebody:   { en: "Widebody",    zh: "雙通道客機", order: 1 },
  narrowbody: { en: "Narrowbody",  zh: "單通道客機", order: 2 },
  regional:   { en: "Regional",    zh: "區域線",     order: 3 },
  prop:       { en: "Turboprop",   zh: "螺旋槳",     order: 4 },
  bizjet:     { en: "Business Jet", zh: "商務噴射",  order: 5 },
  heli:       { en: "Helicopter",  zh: "直升機",     order: 6 },
  military:   { en: "Military",    zh: "軍用",       order: 7 },
  cargo:      { en: "Cargo",       zh: "貨機",       order: 8 },
  other:      { en: "Other",       zh: "其他",       order: 99 },
};
