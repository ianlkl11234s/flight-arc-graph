/**
 * 航空公司資料庫 — 以 ICAO 三字碼為 key（對應 flight.operating_as）
 *
 * 涵蓋範圍：JSONL Top 150+ 出現頻率的航空公司（佔流量 >95%）+ 常見貨運/低成本/軍方。
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
  /** 英文顯示名稱 */
  name: string;
  /** 中文顯示名稱（亞洲航司為主，無則 fallback 到英文） */
  nameZh?: string;
  /** 國家/地區 ICAO 國碼或簡寫 */
  country: string;
  /** 品牌主色（hex） */
  brandColor: string;
  type: AirlineType;
}

export const AIRLINE_DB: Record<string, AirlineInfo> = {
  // ── 台灣 ─────────────────────────────────────────
  CAL: { name: "China Airlines",      nameZh: "中華航空",   country: "TW", brandColor: "#c8102e", type: "fullservice" },
  EVA: { name: "EVA Air",             nameZh: "長榮航空",   country: "TW", brandColor: "#1e6f42", type: "fullservice" },
  MDA: { name: "Mandarin Airlines",   nameZh: "華信航空",   country: "TW", brandColor: "#80221c", type: "regional" },
  UIA: { name: "UNI Air",             nameZh: "立榮航空",   country: "TW", brandColor: "#cc6600", type: "regional" },
  TGW: { name: "Tigerair Taiwan",     nameZh: "台灣虎航",   country: "TW", brandColor: "#fa5800", type: "lowcost" },
  SJX: { name: "Starlux Airlines",    nameZh: "星宇航空",   country: "TW", brandColor: "#5f42a3", type: "fullservice" },

  // ── 東亞 / 香港 / 澳門 ────────────────────────────
  CPA: { name: "Cathay Pacific",      nameZh: "國泰航空",   country: "HK", brandColor: "#006564", type: "fullservice" },
  HKE: { name: "HK Express",          nameZh: "香港快運",   country: "HK", brandColor: "#df0024", type: "lowcost" },
  CRK: { name: "Hong Kong Airlines",  nameZh: "香港航空",   country: "HK", brandColor: "#c8102e", type: "fullservice" },
  AHK: { name: "Air Hong Kong",       nameZh: "華民航空",   country: "HK", brandColor: "#b91c1c", type: "cargo" },
  AMU: { name: "Air Macau",           nameZh: "澳門航空",   country: "MO", brandColor: "#006633", type: "fullservice" },

  // ── 日本 ─────────────────────────────────────────
  JAL: { name: "Japan Airlines",      nameZh: "日本航空",   country: "JP", brandColor: "#c00000", type: "fullservice" },
  ANA: { name: "All Nippon Airways",  nameZh: "全日空",     country: "JP", brandColor: "#00247c", type: "fullservice" },
  AJX: { name: "Air Japan",           nameZh: "日本航空 (LCC)", country: "JP", brandColor: "#00247c", type: "lowcost" },
  AKX: { name: "ANA Wings",           nameZh: "ANA Wings",  country: "JP", brandColor: "#00247c", type: "regional" },
  JJP: { name: "Jetstar Japan",       nameZh: "捷星日本",   country: "JP", brandColor: "#fb6300", type: "lowcost" },
  APJ: { name: "Peach Aviation",      nameZh: "樂桃航空",   country: "JP", brandColor: "#d50057", type: "lowcost" },
  SFJ: { name: "StarFlyer",           nameZh: "星悅航空",   country: "JP", brandColor: "#0d0d0d", type: "fullservice" },
  SKY: { name: "Skymark Airlines",    nameZh: "天馬航空",   country: "JP", brandColor: "#003c9d", type: "lowcost" },
  ADO: { name: "AIRDO",               nameZh: "北海道國際航空", country: "JP", brandColor: "#0091ca", type: "fullservice" },
  SNJ: { name: "Solaseed Air",        nameZh: "Solaseed Air", country: "JP", brandColor: "#3aa676", type: "fullservice" },
  IBX: { name: "IBEX Airlines",       nameZh: "IBEX 航空",  country: "JP", brandColor: "#0c2461", type: "regional" },
  FDA: { name: "Fuji Dream Airlines", nameZh: "富士夢幻航空", country: "JP", brandColor: "#e60012", type: "regional" },
  JTA: { name: "Japan Transocean Air", nameZh: "日本越洋航空", country: "JP", brandColor: "#005bac", type: "regional" },
  JAC: { name: "Japan Air Commuter", nameZh: "日本空中通勤", country: "JP", brandColor: "#c00000", type: "regional" },
  ORC: { name: "Oriental Air Bridge", nameZh: "ORC 東方空橋", country: "JP", brandColor: "#005baa", type: "regional" },

  // ── 韓國 ─────────────────────────────────────────
  KAL: { name: "Korean Air",          nameZh: "大韓航空",   country: "KR", brandColor: "#00256c", type: "fullservice" },
  AAR: { name: "Asiana Airlines",     nameZh: "韓亞航空",   country: "KR", brandColor: "#e4002b", type: "fullservice" },
  JNA: { name: "Jin Air",             nameZh: "真航空",     country: "KR", brandColor: "#00965e", type: "lowcost" },
  TWB: { name: "T'way Air",           nameZh: "德威航空",   country: "KR", brandColor: "#e60012", type: "lowcost" },
  JJA: { name: "Jeju Air",            nameZh: "濟州航空",   country: "KR", brandColor: "#ff7a00", type: "lowcost" },
  ESR: { name: "Eastar Jet",          nameZh: "易斯達航空", country: "KR", brandColor: "#0089d0", type: "lowcost" },
  ABL: { name: "Air Busan",           nameZh: "釜山航空",   country: "KR", brandColor: "#1a8fc6", type: "lowcost" },

  // ── 中國 ─────────────────────────────────────────
  CCA: { name: "Air China",           nameZh: "中國國際航空", country: "CN", brandColor: "#b00018", type: "fullservice" },
  CES: { name: "China Eastern",       nameZh: "中國東方航空", country: "CN", brandColor: "#e60012", type: "fullservice" },
  CSN: { name: "China Southern",      nameZh: "中國南方航空", country: "CN", brandColor: "#2f7be8", type: "fullservice" },
  CHH: { name: "Hainan Airlines",     nameZh: "海南航空",   country: "CN", brandColor: "#c8102e", type: "fullservice" },
  CXA: { name: "Xiamen Airlines",     nameZh: "廈門航空",   country: "CN", brandColor: "#006dab", type: "fullservice" },
  CSZ: { name: "Shenzhen Airlines",   nameZh: "深圳航空",   country: "CN", brandColor: "#b80013", type: "fullservice" },
  CSC: { name: "Sichuan Airlines",    nameZh: "四川航空",   country: "CN", brandColor: "#c8102e", type: "fullservice" },
  CSH: { name: "Shanghai Airlines",   nameZh: "上海航空",   country: "CN", brandColor: "#0070c0", type: "fullservice" },
  TBA: { name: "Tibet Airlines",      nameZh: "西藏航空",   country: "CN", brandColor: "#c8102e", type: "fullservice" },
  TTW: { name: "Tianjin Airlines",    nameZh: "天津航空",   country: "CN", brandColor: "#9d2235", type: "fullservice" },
  CQH: { name: "Spring Airlines",     nameZh: "春秋航空",   country: "CN", brandColor: "#06aa49", type: "lowcost" },

  // ── 東南亞 ────────────────────────────────────────
  SIA: { name: "Singapore Airlines",  nameZh: "新加坡航空", country: "SG", brandColor: "#1d3770", type: "fullservice" },
  SLK: { name: "Scoot",               nameZh: "酷航",       country: "SG", brandColor: "#f9d106", type: "lowcost" },
  THA: { name: "Thai Airways",        nameZh: "泰國航空",   country: "TH", brandColor: "#7d0d75", type: "fullservice" },
  TAX: { name: "Thai AirAsia X",      nameZh: "泰國亞洲航空 X", country: "TH", brandColor: "#ed1b24", type: "lowcost" },
  AIQ: { name: "Thai AirAsia",        nameZh: "泰國亞洲航空", country: "TH", brandColor: "#ed1b24", type: "lowcost" },
  TVJ: { name: "Thai Vietjet Air",    nameZh: "泰國越捷航空", country: "TH", brandColor: "#e21b2c", type: "lowcost" },
  VJC: { name: "VietJet Air",         nameZh: "越捷航空",   country: "VN", brandColor: "#e21b2c", type: "lowcost" },
  HVN: { name: "Vietnam Airlines",    nameZh: "越南航空",   country: "VN", brandColor: "#1c4996", type: "fullservice" },
  AXM: { name: "AirAsia Malaysia",    nameZh: "亞洲航空 (馬)", country: "MY", brandColor: "#ed1b24", type: "lowcost" },
  XAX: { name: "AirAsia X",           nameZh: "亞洲航空 X", country: "MY", brandColor: "#ed1b24", type: "lowcost" },
  MAS: { name: "Malaysia Airlines",   nameZh: "馬來西亞航空", country: "MY", brandColor: "#006dbb", type: "fullservice" },
  CEB: { name: "Cebu Pacific",        nameZh: "宿霧太平洋航空", country: "PH", brandColor: "#fdb615", type: "lowcost" },
  PAL: { name: "Philippine Airlines", nameZh: "菲律賓航空", country: "PH", brandColor: "#1a4b8d", type: "fullservice" },

  // ── 中東 ──────────────────────────────────────────
  UAE: { name: "Emirates",            nameZh: "阿聯酋航空", country: "AE", brandColor: "#d71a21", type: "fullservice" },
  ETD: { name: "Etihad Airways",      nameZh: "阿提哈德航空", country: "AE", brandColor: "#d3a96a", type: "fullservice" },
  QTR: { name: "Qatar Airways",       nameZh: "卡達航空",   country: "QA", brandColor: "#5c0632", type: "fullservice" },
  FDB: { name: "Flydubai",            nameZh: "杜拜航空",   country: "AE", brandColor: "#f9b000", type: "lowcost" },
  SVA: { name: "Saudia",              nameZh: "沙烏地航空", country: "SA", brandColor: "#0d7146", type: "fullservice" },
  THY: { name: "Turkish Airlines",    nameZh: "土耳其航空", country: "TR", brandColor: "#c70a0c", type: "fullservice" },
  PGT: { name: "Pegasus Airlines",    nameZh: "飛馬航空",   country: "TR", brandColor: "#ffd400", type: "lowcost" },
  GFA: { name: "Gulf Air",            nameZh: "海灣航空",   country: "BH", brandColor: "#bf9a30", type: "fullservice" },
  KAC: { name: "Kuwait Airways",      nameZh: "科威特航空", country: "KW", brandColor: "#003876", type: "fullservice" },
  MEA: { name: "Middle East Airlines", nameZh: "中東航空", country: "LB", brandColor: "#dc241f", type: "fullservice" },
  RJA: { name: "Royal Jordanian",     nameZh: "約旦皇家航空", country: "JO", brandColor: "#5b1f37", type: "fullservice" },
  ELY: { name: "El Al",               nameZh: "以色列航空", country: "IL", brandColor: "#003791", type: "fullservice" },
  SXS: { name: "SunExpress",          nameZh: "太陽快線",   country: "TR", brandColor: "#005baa", type: "lowcost" },

  // ── 歐洲 ──────────────────────────────────────────
  BAW: { name: "British Airways",     nameZh: "英國航空",   country: "GB", brandColor: "#2e5c99", type: "fullservice" },
  EZY: { name: "easyJet",             country: "GB", brandColor: "#f36c21", type: "lowcost" },
  EJU: { name: "easyJet Europe",      country: "AT", brandColor: "#f36c21", type: "lowcost" },
  RYR: { name: "Ryanair",             country: "IE", brandColor: "#073590", type: "lowcost" },
  RUK: { name: "Ryanair UK",          country: "GB", brandColor: "#073590", type: "lowcost" },
  VIR: { name: "Virgin Atlantic",     nameZh: "維珍航空",   country: "GB", brandColor: "#e10a0a", type: "fullservice" },
  CFE: { name: "BA CityFlyer",        country: "GB", brandColor: "#2e5c99", type: "regional" },
  EIN: { name: "Aer Lingus",          nameZh: "愛爾蘭航空", country: "IE", brandColor: "#006a4d", type: "fullservice" },
  DLH: { name: "Lufthansa",           nameZh: "漢莎航空",   country: "DE", brandColor: "#05164d", type: "fullservice" },
  CLH: { name: "Lufthansa CityLine",  country: "DE", brandColor: "#05164d", type: "regional" },
  EWG: { name: "Eurowings",           country: "DE", brandColor: "#a20021", type: "lowcost" },
  CFG: { name: "Condor",              country: "DE", brandColor: "#ffcc00", type: "lowcost" },
  AFR: { name: "Air France",          nameZh: "法國航空",   country: "FR", brandColor: "#002157", type: "fullservice" },
  HOP: { name: "Air France Hop",      country: "FR", brandColor: "#002157", type: "regional" },
  TRA: { name: "Transavia",           country: "NL", brandColor: "#00985f", type: "lowcost" },
  AFL: { name: "Aeroflot",            nameZh: "俄羅斯航空", country: "RU", brandColor: "#b00018", type: "fullservice" },
  KLM: { name: "KLM",                 nameZh: "荷蘭皇家航空", country: "NL", brandColor: "#00a1de", type: "fullservice" },
  KLC: { name: "KLM Cityhopper",      country: "NL", brandColor: "#00a1de", type: "regional" },
  IBE: { name: "Iberia",              nameZh: "西班牙國家航空", country: "ES", brandColor: "#d80c0c", type: "fullservice" },
  IBS: { name: "Iberia Express",      country: "ES", brandColor: "#d80c0c", type: "lowcost" },
  ANE: { name: "Air Nostrum",         country: "ES", brandColor: "#005baa", type: "regional" },
  AEA: { name: "Air Europa",          country: "ES", brandColor: "#0033a0", type: "fullservice" },
  VLG: { name: "Vueling",             country: "ES", brandColor: "#ffcc00", type: "lowcost" },
  AZA: { name: "ITA Airways",         country: "IT", brandColor: "#005baa", type: "fullservice" },
  SAS: { name: "SAS Scandinavian",    country: "SE", brandColor: "#003865", type: "fullservice" },
  FIN: { name: "Finnair",             country: "FI", brandColor: "#0b2265", type: "fullservice" },
  SWR: { name: "Swiss Intl Air Lines", nameZh: "瑞士航空", country: "CH", brandColor: "#ca0a11", type: "fullservice" },
  AUA: { name: "Austrian Airlines",   nameZh: "奧地利航空", country: "AT", brandColor: "#c8102e", type: "fullservice" },
  BEL: { name: "Brussels Airlines",   nameZh: "布魯塞爾航空", country: "BE", brandColor: "#0e2c5b", type: "fullservice" },
  WZZ: { name: "Wizz Air",            country: "HU", brandColor: "#c6007e", type: "lowcost" },
  TAP: { name: "TAP Air Portugal",    nameZh: "葡萄牙航空", country: "PT", brandColor: "#005db6", type: "fullservice" },
  AEE: { name: "Aegean Airlines",     nameZh: "愛琴海航空", country: "GR", brandColor: "#0033a0", type: "fullservice" },
  LOT: { name: "LOT Polish Airlines", nameZh: "波蘭航空",   country: "PL", brandColor: "#11397e", type: "fullservice" },
  BTI: { name: "airBaltic",           nameZh: "波羅的海航空", country: "LV", brandColor: "#62b34c", type: "regional" },
  LGL: { name: "Luxair",              nameZh: "盧森堡航空", country: "LU", brandColor: "#0067a3", type: "regional" },
  ETH: { name: "Ethiopian Airlines",  nameZh: "衣索比亞航空", country: "ET", brandColor: "#108535", type: "fullservice" },
  MSR: { name: "EgyptAir",            nameZh: "埃及航空",   country: "EG", brandColor: "#005ba9", type: "fullservice" },
  DAH: { name: "Air Algerie",         nameZh: "阿爾及利亞航空", country: "DZ", brandColor: "#006233", type: "fullservice" },

  // ── 北美 ──────────────────────────────────────────
  AAL: { name: "American Airlines",   nameZh: "美國航空",   country: "US", brandColor: "#0078d2", type: "fullservice" },
  DAL: { name: "Delta Air Lines",     nameZh: "達美航空",   country: "US", brandColor: "#003b6f", type: "fullservice" },
  UAL: { name: "United Airlines",     nameZh: "聯合航空",   country: "US", brandColor: "#1414aa", type: "fullservice" },
  SWA: { name: "Southwest Airlines",  nameZh: "西南航空",   country: "US", brandColor: "#304cb2", type: "lowcost" },
  JBU: { name: "JetBlue Airways",     nameZh: "捷藍航空",   country: "US", brandColor: "#0033a0", type: "fullservice" },
  ASA: { name: "Alaska Airlines",     nameZh: "阿拉斯加航空", country: "US", brandColor: "#00437a", type: "fullservice" },
  FFT: { name: "Frontier Airlines",   country: "US", brandColor: "#2d8c3c", type: "lowcost" },
  SCX: { name: "Sun Country",         country: "US", brandColor: "#e3342f", type: "lowcost" },
  HAL: { name: "Hawaiian Airlines",   nameZh: "夏威夷航空", country: "US", brandColor: "#4b2882", type: "fullservice" },
  SKW: { name: "SkyWest Airlines",    country: "US", brandColor: "#0055a4", type: "regional" },
  EDV: { name: "Endeavor Air",        country: "US", brandColor: "#003b6f", type: "regional" },
  JIA: { name: "PSA Airlines",        country: "US", brandColor: "#0078d2", type: "regional" },
  RPA: { name: "Republic Airways",    country: "US", brandColor: "#0078d2", type: "regional" },
  ENY: { name: "Envoy Air",           country: "US", brandColor: "#0078d2", type: "regional" },
  NKS: { name: "Spirit Airlines",     country: "US", brandColor: "#f7b718", type: "lowcost" },
  ACA: { name: "Air Canada",          nameZh: "加拿大航空", country: "CA", brandColor: "#d22630", type: "fullservice" },
  WJA: { name: "WestJet",             country: "CA", brandColor: "#00a4e4", type: "fullservice" },

  // ── 大洋洲 ────────────────────────────────────────
  QFA: { name: "Qantas",              nameZh: "澳洲航空",   country: "AU", brandColor: "#c8102e", type: "fullservice" },
  JST: { name: "Jetstar",             nameZh: "捷星航空",   country: "AU", brandColor: "#fb6300", type: "lowcost" },
  VOZ: { name: "Virgin Australia",    nameZh: "澳洲維珍航空", country: "AU", brandColor: "#cc0000", type: "fullservice" },
  ANZ: { name: "Air New Zealand",     nameZh: "紐西蘭航空", country: "NZ", brandColor: "#04225c", type: "fullservice" },

  // ── 印度 / 南亞 ───────────────────────────────────
  AIC: { name: "Air India",           nameZh: "印度航空",   country: "IN", brandColor: "#c02228", type: "fullservice" },
  IGO: { name: "IndiGo",              nameZh: "靛藍航空",   country: "IN", brandColor: "#0d2c7c", type: "lowcost" },
  AXB: { name: "Air India Express",   nameZh: "印度航空快運", country: "IN", brandColor: "#c02228", type: "lowcost" },
  SEJ: { name: "SpiceJet",            nameZh: "香料航空",   country: "IN", brandColor: "#a72b2a", type: "lowcost" },
  PIA: { name: "Pakistan International Airlines", nameZh: "巴基斯坦國際航空", country: "PK", brandColor: "#005826", type: "fullservice" },

  // ── 貨運專門 ─────────────────────────────────────
  FDX: { name: "FedEx Express",       nameZh: "聯邦快遞",   country: "US", brandColor: "#4d148c", type: "cargo" },
  UPS: { name: "UPS Airlines",        country: "US", brandColor: "#351c15", type: "cargo" },
  CLX: { name: "Cargolux",            country: "LU", brandColor: "#0052a5", type: "cargo" },
  GTI: { name: "Atlas Air",           country: "US", brandColor: "#00205b", type: "cargo" },
  ABD: { name: "ABX Air",             country: "US", brandColor: "#003087", type: "cargo" },
  ABX: { name: "ABX Air",             country: "US", brandColor: "#003087", type: "cargo" },
  CKS: { name: "Kalitta Air",         country: "US", brandColor: "#e31837", type: "cargo" },
  GEC: { name: "Lufthansa Cargo",     country: "DE", brandColor: "#fdd200", type: "cargo" },
  CYZ: { name: "Cargojet",            country: "CA", brandColor: "#ed1c24", type: "cargo" },
  SQC: { name: "Singapore Airlines Cargo", country: "SG", brandColor: "#1d3770", type: "cargo" },
  YZR: { name: "YTO Cargo Airlines",  country: "CN", brandColor: "#00a0e9", type: "cargo" },
  CSS: { name: "China Southern Cargo", country: "CN", brandColor: "#2f7be8", type: "cargo" },
  BOX: { name: "AeroLogic",           country: "DE", brandColor: "#fdd200", type: "cargo" },
  BCS: { name: "European Air Transport (DHL)", country: "BE", brandColor: "#fdd200", type: "cargo" },

  // ── 私人 / 商務 ──────────────────────────────────
  NJE: { name: "NetJets Europe",      country: "PT", brandColor: "#1a3661", type: "private" },
  VJT: { name: "VistaJet",            country: "MT", brandColor: "#cc0000", type: "private" },

  // ── 軍方 / 政府 ──────────────────────────────────
  RCH: { name: "USAF Air Mobility Command", nameZh: "美國空軍機動指揮部", country: "US", brandColor: "#2c3e50", type: "military" },
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

/**
 * UI 顯示名稱：中文優先（preferZh=true）→ 英文 → ICAO 代碼。
 * 例如：getAirlineDisplayName("EVA") = "長榮航空"
 *       getAirlineDisplayName("BAW") = "英國航空"
 *       getAirlineDisplayName("HOP") = "Air France Hop"（無中文則用英文）
 *       getAirlineDisplayName("XYZ") = "XYZ"（未登錄則回代碼本身）
 */
export function getAirlineDisplayName(code: string | undefined, preferZh = true): string {
  if (!code) return "";
  const info = AIRLINE_DB[code.toUpperCase()];
  if (!info) return code;
  if (preferZh && info.nameZh) return info.nameZh;
  return info.name;
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
