/**
 * 航空公司資料庫 — 以 ICAO 三字碼為 key（對應 flight.operating_as）
 *
 * 涵蓋範圍：JSONL 中 Top 50+ 出現頻率的航空公司（佔流量 >85%）+ 常見貨運/低成本/軍方。
 * 未列出的 operator 會拿到 fallback。
 *
 * type 定義：
 *   - fullservice  傳統全服務航空
 *   - lowcost      低成本航空
 *   - regional     區域線子公司
 *   - cargo        貨運
 *   - charter      包機
 *   - govt         政府專機
 *   - military     軍用
 *   - private      私人 / 商務
 */

export type AirlineType =
  | "fullservice"
  | "lowcost"
  | "regional"
  | "cargo"
  | "charter"
  | "govt"
  | "military"
  | "private";

export interface AirlineInfo {
  /** 顯示名稱 */
  name: string;
  /** 國家/地區 ICAO 國碼或簡寫 */
  country: string;
  /** 品牌主色（hex） */
  brandColor: string;
  type: AirlineType;
}

export const AIRLINE_DB: Record<string, AirlineInfo> = {
  // ── 台灣 ─────────────────────────────────────────
  CAL: { name: "China Airlines",       country: "TW", brandColor: "#c8102e", type: "fullservice" },
  EVA: { name: "EVA Air",               country: "TW", brandColor: "#1e6f42", type: "fullservice" },
  MDA: { name: "Mandarin Airlines",     country: "TW", brandColor: "#80221c", type: "regional" },
  UIA: { name: "UNI Air",               country: "TW", brandColor: "#cc6600", type: "regional" },
  TGW: { name: "Tigerair Taiwan",       country: "TW", brandColor: "#fa5800", type: "lowcost" },
  SJX: { name: "Starlux Airlines",      country: "TW", brandColor: "#5f42a3", type: "fullservice" },

  // ── 東亞 ─────────────────────────────────────────
  CPA: { name: "Cathay Pacific",        country: "HK", brandColor: "#006564", type: "fullservice" },
  HKE: { name: "Cathay Dragon / HK Express", country: "HK", brandColor: "#df0024", type: "lowcost" },
  JAL: { name: "Japan Airlines",        country: "JP", brandColor: "#c00000", type: "fullservice" },
  ANA: { name: "All Nippon Airways",    country: "JP", brandColor: "#00247c", type: "fullservice" },
  AJX: { name: "Air Japan",             country: "JP", brandColor: "#00247c", type: "lowcost" },
  AKX: { name: "ANA Wings",             country: "JP", brandColor: "#00247c", type: "regional" },
  JJP: { name: "Jetstar Japan",         country: "JP", brandColor: "#fb6300", type: "lowcost" },
  APJ: { name: "Peach Aviation",        country: "JP", brandColor: "#d50057", type: "lowcost" },
  SFJ: { name: "StarFlyer",             country: "JP", brandColor: "#0d0d0d", type: "fullservice" },
  KAL: { name: "Korean Air",            country: "KR", brandColor: "#00256c", type: "fullservice" },
  AAR: { name: "Asiana Airlines",       country: "KR", brandColor: "#e4002b", type: "fullservice" },
  JNA: { name: "Jin Air",               country: "KR", brandColor: "#00965e", type: "lowcost" },
  TWB: { name: "T'way Air",             country: "KR", brandColor: "#e60012", type: "lowcost" },
  CCA: { name: "Air China",             country: "CN", brandColor: "#b00018", type: "fullservice" },
  CES: { name: "China Eastern",         country: "CN", brandColor: "#e60012", type: "fullservice" },
  CSN: { name: "China Southern",        country: "CN", brandColor: "#2f7be8", type: "fullservice" },
  CHH: { name: "Hainan Airlines",       country: "CN", brandColor: "#c8102e", type: "fullservice" },
  CXA: { name: "Xiamen Airlines",       country: "CN", brandColor: "#006dab", type: "fullservice" },
  CSZ: { name: "Shenzhen Airlines",     country: "CN", brandColor: "#b80013", type: "fullservice" },

  // ── 東南亞 ────────────────────────────────────────
  SIA: { name: "Singapore Airlines",    country: "SG", brandColor: "#1d3770", type: "fullservice" },
  SLK: { name: "Scoot / SilkAir",       country: "SG", brandColor: "#f9d106", type: "lowcost" },
  THA: { name: "Thai Airways",          country: "TH", brandColor: "#7d0d75", type: "fullservice" },
  TAX: { name: "Thai AirAsia X",        country: "TH", brandColor: "#ed1b24", type: "lowcost" },
  AIQ: { name: "Thai AirAsia",          country: "TH", brandColor: "#ed1b24", type: "lowcost" },
  VJC: { name: "VietJet Air",           country: "VN", brandColor: "#e21b2c", type: "lowcost" },
  HVN: { name: "Vietnam Airlines",      country: "VN", brandColor: "#1c4996", type: "fullservice" },
  AXM: { name: "AirAsia Malaysia",      country: "MY", brandColor: "#ed1b24", type: "lowcost" },
  MAS: { name: "Malaysia Airlines",     country: "MY", brandColor: "#006dbb", type: "fullservice" },
  CEB: { name: "Cebu Pacific",          country: "PH", brandColor: "#fdb615", type: "lowcost" },
  PAL: { name: "Philippine Airlines",   country: "PH", brandColor: "#1a4b8d", type: "fullservice" },

  // ── 中東 ──────────────────────────────────────────
  UAE: { name: "Emirates",              country: "AE", brandColor: "#d71a21", type: "fullservice" },
  ETD: { name: "Etihad Airways",        country: "AE", brandColor: "#d3a96a", type: "fullservice" },
  QTR: { name: "Qatar Airways",         country: "QA", brandColor: "#5c0632", type: "fullservice" },
  FDB: { name: "Flydubai",              country: "AE", brandColor: "#f9b000", type: "lowcost" },
  SVA: { name: "Saudia",                country: "SA", brandColor: "#0d7146", type: "fullservice" },
  THY: { name: "Turkish Airlines",      country: "TR", brandColor: "#c70a0c", type: "fullservice" },
  PGT: { name: "Pegasus Airlines",      country: "TR", brandColor: "#ffd400", type: "lowcost" },

  // ── 歐洲 ──────────────────────────────────────────
  BAW: { name: "British Airways",       country: "GB", brandColor: "#2e5c99", type: "fullservice" },
  EZY: { name: "easyJet",               country: "GB", brandColor: "#f36c21", type: "lowcost" },
  EJU: { name: "easyJet Europe",        country: "AT", brandColor: "#f36c21", type: "lowcost" },
  RYR: { name: "Ryanair",               country: "IE", brandColor: "#073590", type: "lowcost" },
  VIR: { name: "Virgin Atlantic",       country: "GB", brandColor: "#e10a0a", type: "fullservice" },
  DLH: { name: "Lufthansa",             country: "DE", brandColor: "#05164d", type: "fullservice" },
  CLH: { name: "Lufthansa CityLine",    country: "DE", brandColor: "#05164d", type: "regional" },
  BER: { name: "Eurowings",             country: "DE", brandColor: "#a20021", type: "lowcost" },
  CFG: { name: "Condor",                country: "DE", brandColor: "#ffcc00", type: "lowcost" },
  AFR: { name: "Air France",            country: "FR", brandColor: "#002157", type: "fullservice" },
  AFL: { name: "Aeroflot",              country: "RU", brandColor: "#b00018", type: "fullservice" },
  KLM: { name: "KLM",                   country: "NL", brandColor: "#00a1de", type: "fullservice" },
  KLC: { name: "KLM Cityhopper",        country: "NL", brandColor: "#00a1de", type: "regional" },
  IBE: { name: "Iberia",                country: "ES", brandColor: "#d80c0c", type: "fullservice" },
  VLG: { name: "Vueling",               country: "ES", brandColor: "#ffcc00", type: "lowcost" },
  AZA: { name: "ITA Airways",           country: "IT", brandColor: "#005baa", type: "fullservice" },
  SAS: { name: "SAS Scandinavian",      country: "SE", brandColor: "#003865", type: "fullservice" },
  FIN: { name: "Finnair",               country: "FI", brandColor: "#0b2265", type: "fullservice" },
  SWR: { name: "Swiss Intl Air Lines",  country: "CH", brandColor: "#ca0a11", type: "fullservice" },
  AUA: { name: "Austrian Airlines",     country: "AT", brandColor: "#c8102e", type: "fullservice" },
  WZZ: { name: "Wizz Air",              country: "HU", brandColor: "#c6007e", type: "lowcost" },
  TAP: { name: "TAP Air Portugal",      country: "PT", brandColor: "#005db6", type: "fullservice" },
  ETH: { name: "Ethiopian Airlines",    country: "ET", brandColor: "#108535", type: "fullservice" },

  // ── 北美 ──────────────────────────────────────────
  AAL: { name: "American Airlines",     country: "US", brandColor: "#0078d2", type: "fullservice" },
  DAL: { name: "Delta Air Lines",       country: "US", brandColor: "#003b6f", type: "fullservice" },
  UAL: { name: "United Airlines",       country: "US", brandColor: "#1414aa", type: "fullservice" },
  SWA: { name: "Southwest Airlines",    country: "US", brandColor: "#304cb2", type: "lowcost" },
  JBU: { name: "JetBlue Airways",       country: "US", brandColor: "#0033a0", type: "fullservice" },
  ASA: { name: "Alaska Airlines",       country: "US", brandColor: "#00437a", type: "fullservice" },
  FFT: { name: "Frontier Airlines",     country: "US", brandColor: "#2d8c3c", type: "lowcost" },
  SCX: { name: "Sun Country",           country: "US", brandColor: "#e3342f", type: "lowcost" },
  HAL: { name: "Hawaiian Airlines",     country: "US", brandColor: "#4b2882", type: "fullservice" },
  SKW: { name: "SkyWest Airlines",      country: "US", brandColor: "#0055a4", type: "regional" },
  EDV: { name: "Endeavor Air",          country: "US", brandColor: "#003b6f", type: "regional" },
  JIA: { name: "PSA Airlines",          country: "US", brandColor: "#0078d2", type: "regional" },
  RPA: { name: "Republic Airways",      country: "US", brandColor: "#0078d2", type: "regional" },
  NKS: { name: "Spirit Airlines",       country: "US", brandColor: "#f7b718", type: "lowcost" },
  ACA: { name: "Air Canada",            country: "CA", brandColor: "#d22630", type: "fullservice" },
  WJA: { name: "WestJet",               country: "CA", brandColor: "#00a4e4", type: "fullservice" },

  // ── 大洋洲 / 印度 ──────────────────────────────────
  QFA: { name: "Qantas",                country: "AU", brandColor: "#c8102e", type: "fullservice" },
  JST: { name: "Jetstar",               country: "AU", brandColor: "#fb6300", type: "lowcost" },
  VOZ: { name: "Virgin Australia",      country: "AU", brandColor: "#cc0000", type: "fullservice" },
  ANZ: { name: "Air New Zealand",       country: "NZ", brandColor: "#04225c", type: "fullservice" },
  AIC: { name: "Air India",             country: "IN", brandColor: "#c02228", type: "fullservice" },
  IAD: { name: "IndiGo",                country: "IN", brandColor: "#0d2c7c", type: "lowcost" },

  // ── 貨運專門 ─────────────────────────────────────
  FDX: { name: "FedEx Express",         country: "US", brandColor: "#4d148c", type: "cargo" },
  UPS: { name: "UPS Airlines",          country: "US", brandColor: "#351c15", type: "cargo" },
  CLX: { name: "Cargolux",              country: "LU", brandColor: "#0052a5", type: "cargo" },
  GTI: { name: "Atlas Air",             country: "US", brandColor: "#00205b", type: "cargo" },
  ABD: { name: "ABX Air",               country: "US", brandColor: "#003087", type: "cargo" },
  ABX: { name: "ABX Air",               country: "US", brandColor: "#003087", type: "cargo" },
  CKS: { name: "Kalitta Air",           country: "US", brandColor: "#e31837", type: "cargo" },
  GEC: { name: "Lufthansa Cargo",       country: "DE", brandColor: "#fdd200", type: "cargo" },
  CYZ: { name: "Cargojet",              country: "CA", brandColor: "#ed1c24", type: "cargo" },
  SQC: { name: "Singapore Airlines Cargo", country: "SG", brandColor: "#1d3770", type: "cargo" },
  YZR: { name: "YTO Cargo Airlines",    country: "CN", brandColor: "#00a0e9", type: "cargo" },
  CSS: { name: "China Southern Cargo",  country: "CN", brandColor: "#2f7be8", type: "cargo" },
};

/** 未登錄 operator 的 fallback */
function fallbackAirline(code: string): AirlineInfo {
  return {
    name: code || "Unknown",
    country: "XX",
    brandColor: "#808080",
    type: "fullservice",
  };
}

/** 查詢 airline 資訊；找不到會回 fallback，不會 throw */
export function getAirlineInfo(code: string | undefined): AirlineInfo {
  if (!code) return fallbackAirline("");
  return AIRLINE_DB[code.toUpperCase()] ?? fallbackAirline(code);
}

/** UI 用：type 的 label + 排序權重 */
export const AIRLINE_TYPE_LABELS: Record<AirlineType, { en: string; zh: string; order: number }> = {
  fullservice: { en: "Full Service", zh: "全服務",   order: 1 },
  lowcost:     { en: "Low Cost",     zh: "低成本",   order: 2 },
  regional:    { en: "Regional",     zh: "區域線",   order: 3 },
  cargo:       { en: "Cargo",        zh: "貨運",     order: 4 },
  charter:     { en: "Charter",      zh: "包機",     order: 5 },
  govt:        { en: "Government",   zh: "政府專機", order: 6 },
  military:    { en: "Military",     zh: "軍用",     order: 7 },
  private:     { en: "Private",      zh: "私人",     order: 8 },
};
