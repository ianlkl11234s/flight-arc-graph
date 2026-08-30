import type { AirportMeta } from "./airportMeta";

export interface AirportSearchCandidate {
  icao: string;
  meta?: AirportMeta;
  curatedName?: string;
  selectable: boolean;
  flights: number;
}

export interface AirportSearchResult extends AirportSearchCandidate {
  matchReason: string;
  score: number;
}

const CONTINENT_NAMES: Record<string, { zh: string; en: string }> = {
  AF: { zh: "非洲", en: "Africa" },
  AS: { zh: "亞洲", en: "Asia" },
  EU: { zh: "歐洲", en: "Europe" },
  NA: { zh: "北美洲", en: "North America" },
  OC: { zh: "大洋洲", en: "Oceania" },
  SA: { zh: "南美洲", en: "South America" },
};

/**
 * GeoJSON 目前沒有獨立 city/aliases 欄位。這裡只放置經常被使用的城市與別名，
 * 其餘中文機場名沿用 AIRPORT_INFO 的 curated name，不自動推測或翻譯。
 */
const AIRPORT_ALIASES: Record<string, string[]> = {
  LFPG: ["巴黎", "戴高樂", "戴高樂機場", "Charles de Gaulle"],
  LFPO: ["巴黎", "奧利", "奧利機場", "Paris Orly"],
  EGLL: ["倫敦", "希斯洛", "Heathrow"],
  EGKK: ["倫敦", "蓋威克", "Gatwick"],
  EGSS: ["倫敦", "史坦斯特", "Stansted"],
  EGGW: ["倫敦", "盧頓", "Luton"],
  EGLC: ["倫敦", "倫敦城市機場", "London City"],
  VTBS: ["曼谷", "蘇凡納布", "Suvarnabhumi"],
  VTBD: ["曼谷", "廊曼", "Don Mueang"],
  RCTP: ["台北", "臺北", "桃園", "Taoyuan"],
  RCSS: ["台北", "臺北", "松山", "Songshan"],
  RCKH: ["高雄", "Kaohsiung"],
  RCBS: ["金門", "Kinmen"],
};

type DisplayNamesConstructor = new (
  locales: string[],
  options: { type: "region" },
) => { of(code: string): string | undefined };

const DisplayNames = (Intl as unknown as { DisplayNames?: DisplayNamesConstructor }).DisplayNames;
const countryNameCache = new Map<string, { zh: string; en: string }>();

function cleanDisplayName(value: string | undefined, code: string): string {
  return value && value !== code ? value : "";
}

export function getCountryNames(code: string): { zh: string; en: string } {
  const normalizedCode = code.toUpperCase();
  const cached = countryNameCache.get(normalizedCode);
  if (cached) return cached;

  let zh = "";
  let en = "";
  if (DisplayNames && normalizedCode) {
    try {
      zh = cleanDisplayName(new DisplayNames(["zh-Hant"], { type: "region" }).of(normalizedCode), normalizedCode);
      en = cleanDisplayName(new DisplayNames(["en"], { type: "region" }).of(normalizedCode), normalizedCode);
    } catch {
      // 非 ISO region code 時保留空值，UI 會 fallback 到 code。
    }
  }

  const names = { zh, en };
  countryNameCache.set(normalizedCode, names);
  return names;
}

export function getCountryLabel(code: string): string {
  const names = getCountryNames(code);
  return names.zh || names.en || code || "未分類國家";
}

export function getContinentNames(code: string): { zh: string; en: string } {
  return CONTINENT_NAMES[code.toUpperCase()] ?? { zh: "", en: "" };
}

export function getContinentLabel(code: string): string {
  const names = getContinentNames(code);
  return names.zh || names.en || code || "未分類洲別";
}

export function normalizeAirportSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim();
}

function includesQuery(value: string, query: string, compactQuery: string): boolean {
  const normalized = normalizeAirportSearchText(value);
  return normalized.includes(query) || normalized.replace(/\s/g, "").includes(compactQuery);
}

function matchCandidate(candidate: AirportSearchCandidate, query: string): AirportSearchResult | null {
  const meta = candidate.meta;
  const iata = meta?.iata ?? "";
  const country = getCountryNames(meta?.country ?? "");
  const continent = getContinentNames(meta?.continent ?? "");
  const aliases = AIRPORT_ALIASES[candidate.icao] ?? [];
  const compactQuery = query.replace(/\s/g, "");
  const fields: Array<{ values: string[]; score: number; reason: string }> = [
    { values: [candidate.icao, iata], score: 0, reason: [iata, candidate.icao].filter(Boolean).join(" / ") },
    {
      values: [candidate.curatedName ?? "", meta?.nameZh ?? "", meta?.nameEn ?? "", meta?.name ?? ""],
      score: 20,
      reason: candidate.curatedName || meta?.nameZh || meta?.nameEn || meta?.name || candidate.icao,
    },
    { values: aliases, score: 30, reason: aliases.find((value) => includesQuery(value, query, compactQuery)) ?? "機場別名" },
    { values: [meta?.city ?? ""], score: 35, reason: meta?.city || "城市" },
    {
      values: [meta?.localCode ?? "", ...(meta?.searchKeywords ?? [])],
      score: 40,
      reason: "當地代碼／機場關鍵字",
    },
    { values: [country.zh, country.en, meta?.country ?? ""], score: 50, reason: [country.zh, country.en].filter(Boolean).join(" / ") || meta?.country || "國家" },
    { values: [continent.zh, continent.en, meta?.continent ?? ""], score: 60, reason: [continent.zh, continent.en].filter(Boolean).join(" / ") || meta?.continent || "洲別" },
  ];

  for (const field of fields) {
    const value = field.values.find((item) => item && includesQuery(item, query, compactQuery));
    if (!value) continue;
    const normalizedValue = normalizeAirportSearchText(value);
    const exactBonus = normalizedValue === query || normalizedValue.replace(/\s/g, "") === compactQuery ? -10 : 0;
    const prefixBonus = normalizedValue.startsWith(query) ? -5 : 0;
    return { ...candidate, matchReason: field.reason, score: field.score + exactBonus + prefixBonus };
  }
  return null;
}

export function searchAirports(queryValue: string, candidates: AirportSearchCandidate[]): AirportSearchResult[] {
  const query = normalizeAirportSearchText(queryValue);
  if (!query) return [];

  return candidates
    .map((candidate) => matchCandidate(candidate, query))
    .filter((result): result is AirportSearchResult => result !== null)
    .sort((a, b) =>
      a.score - b.score ||
      Number(b.selectable) - Number(a.selectable) ||
      b.flights - a.flights ||
      a.icao.localeCompare(b.icao),
    );
}
