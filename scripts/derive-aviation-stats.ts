/**
 * derive-aviation-stats.ts
 *
 * 把 plan-art 的台灣 7 座機場 JSONL 軌跡衍生為統計檔，供 mini-taiwan-info 飛航分頁使用。
 *
 * 執行：
 *   npx tsx scripts/derive-aviation-stats.ts
 *
 * 輸出：findings/aviation-stats.json
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { AIRCRAFT_DB, getAircraftInfo } from "../src/data/aircraftDatabase";
import { AIRLINE_DB, getAirlineInfo } from "../src/data/airlineDatabase";

// 台灣 7 座機場
const TW_AIRPORTS: Record<string, { iata: string; nameZh: string; nameEn: string }> = {
  RCTP: { iata: "TPE", nameZh: "桃園國際機場", nameEn: "Taoyuan International" },
  RCKH: { iata: "KHH", nameZh: "高雄國際機場", nameEn: "Kaohsiung International" },
  RCSS: { iata: "TSA", nameZh: "台北松山機場", nameEn: "Taipei Songshan" },
  RCQC: { iata: "MZG", nameZh: "馬公機場", nameEn: "Magong" },
  RCBS: { iata: "KNH", nameZh: "金門機場", nameEn: "Kinmen" },
  RCMQ: { iata: "RMQ", nameZh: "台中清泉崗機場", nameEn: "Taichung Ching Chuan Kang" },
  RCFN: { iata: "TTT", nameZh: "台東機場", nameEn: "Taitung" },
};

// ICAO 前綴 → 國碼 / 國名（中文）對照（涵蓋 plan-art 樣本中出現的目的地）
const ICAO_COUNTRY: Record<string, { code: string; nameZh: string }> = {
  // 兩位前綴
  RC: { code: "TW", nameZh: "台灣" },
  RJ: { code: "JP", nameZh: "日本" },
  RO: { code: "JP", nameZh: "日本" }, // 沖繩
  RK: { code: "KR", nameZh: "南韓" },
  VH: { code: "HK", nameZh: "香港" },
  VM: { code: "MO", nameZh: "澳門" },
  WS: { code: "SG", nameZh: "新加坡" },
  WM: { code: "MY", nameZh: "馬來西亞" },
  WB: { code: "MY", nameZh: "馬來西亞" },
  WI: { code: "ID", nameZh: "印尼" },
  WA: { code: "ID", nameZh: "印尼" },
  WR: { code: "ID", nameZh: "印尼" },
  VT: { code: "TH", nameZh: "泰國" },
  VV: { code: "VN", nameZh: "越南" },
  VL: { code: "LA", nameZh: "寮國" },
  VD: { code: "KH", nameZh: "柬埔寨" },
  RP: { code: "PH", nameZh: "菲律賓" },
  VI: { code: "IN", nameZh: "印度" },
  VA: { code: "IN", nameZh: "印度" },
  VE: { code: "IN", nameZh: "印度" },
  VC: { code: "LK", nameZh: "斯里蘭卡" },
  VN: { code: "NP", nameZh: "尼泊爾" },
  VR: { code: "MV", nameZh: "馬爾地夫" },
  VQ: { code: "BT", nameZh: "不丹" },
  ZS: { code: "CN", nameZh: "中國" },
  ZG: { code: "CN", nameZh: "中國" },
  ZB: { code: "CN", nameZh: "中國" },
  ZL: { code: "CN", nameZh: "中國" },
  ZP: { code: "CN", nameZh: "中國" },
  ZW: { code: "CN", nameZh: "中國" },
  ZJ: { code: "CN", nameZh: "中國" },
  ZH: { code: "CN", nameZh: "中國" },
  ZU: { code: "CN", nameZh: "中國" },
  ZY: { code: "CN", nameZh: "中國" },
  OM: { code: "AE", nameZh: "阿聯酋" },
  OE: { code: "SA", nameZh: "沙烏地" },
  OT: { code: "QA", nameZh: "卡達" },
  OB: { code: "BH", nameZh: "巴林" },
  OO: { code: "OM", nameZh: "阿曼" },
  LT: { code: "TR", nameZh: "土耳其" },
  EG: { code: "GB", nameZh: "英國" },
  ED: { code: "DE", nameZh: "德國" },
  EH: { code: "NL", nameZh: "荷蘭" },
  LF: { code: "FR", nameZh: "法國" },
  LE: { code: "ES", nameZh: "西班牙" },
  LI: { code: "IT", nameZh: "義大利" },
  LS: { code: "CH", nameZh: "瑞士" },
  LO: { code: "AT", nameZh: "奧地利" },
  LK: { code: "CZ", nameZh: "捷克" },
  EP: { code: "PL", nameZh: "波蘭" },
  CY: { code: "CA", nameZh: "加拿大" },
  YS: { code: "AU", nameZh: "澳洲" },
  YM: { code: "AU", nameZh: "澳洲" },
  YB: { code: "AU", nameZh: "澳洲" },
  YP: { code: "AU", nameZh: "澳洲" },
  NZ: { code: "NZ", nameZh: "紐西蘭" },
  NF: { code: "FJ", nameZh: "斐濟" },
  UH: { code: "RU", nameZh: "俄羅斯" },
  UU: { code: "RU", nameZh: "俄羅斯" },
  UE: { code: "RU", nameZh: "俄羅斯" },
  UN: { code: "RU", nameZh: "俄羅斯" },
  UA: { code: "KZ", nameZh: "哈薩克" },
  UT: { code: "UZ", nameZh: "烏茲別克" },
  AY: { code: "PG", nameZh: "巴布亞紐幾內亞" },
};
// 1 位前綴 fallback（K = 美國, C = 加拿大）
const ICAO_COUNTRY_1: Record<string, { code: string; nameZh: string }> = {
  K: { code: "US", nameZh: "美國" },
  C: { code: "CA", nameZh: "加拿大" },
};

function countryOf(icao: string): { code: string; nameZh: string } | null {
  if (!icao || icao.length < 2) return null;
  return ICAO_COUNTRY[icao.slice(0, 2)] || ICAO_COUNTRY_1[icao.slice(0, 1)] || null;
}

interface Flight {
  fr24_id?: string;
  callsign?: string;
  aircraft_type?: string;
  origin_icao?: string;
  dest_icao?: string;
  dest_icao_actual?: string;
  operating_as?: string;
  painted_as?: string;
  first_seen?: number;
  last_seen?: number;
  arr_time?: number;
  dep_time?: number;
  status?: string;
}

interface AirportStats {
  icao: string;
  iata: string;
  nameZh: string;
  nameEn: string;
  total: number;
  arrivals: number;
  departures: number;
  domestic: number;
  international: number;
  unknownRoute: number;
  spanDays: number;
  firstSeen: string;
  lastSeen: string;
  dailyAverage: number;
  airlines: Array<{
    code: string;
    nameZh?: string;
    nameEn?: string;
    type?: string;
    brandColor?: string;
    country?: string;
    count: number;
    pct: number;
  }>;
  aircraft: Array<{
    type: string;
    name?: string;
    category?: string;
    seats?: number;
    count: number;
    pct: number;
    seatsTotal: number;
  }>;
  aircraftCategoryMix: Record<string, { count: number; pct: number; seats: number }>;
  airlineTypeMix: Record<string, { count: number; pct: number }>;
  seatCapacity: {
    total: number;
    avgPerFlight: number;
    coveragePct: number;
  };
  routes: Array<{
    origin: string;
    dest: string;
    count: number;
    isInternational: boolean;
  }>;
  topRoutesUndirected: Array<{
    a: string;
    b: string;
    count: number;
    isInternational: boolean;
  }>;
  intlPartners: Array<{
    country: string;
    nameZh: string;
    count: number;
    pct: number;
  }>;
  hourly: number[];
  weekday: number[];
}

const DIR = "public/tracks/airports";

async function analyzeAirport(icao: string): Promise<AirportStats | null> {
  const meta = TW_AIRPORTS[icao];
  const fp = path.join(DIR, `${icao}.jsonl`);
  if (!fs.existsSync(fp)) return null;

  const airlineCount = new Map<string, number>();
  const aircraftCount = new Map<string, number>();
  const routeCount = new Map<string, number>();
  const undirectedRouteCount = new Map<string, { a: string; b: string; count: number }>();
  const intlPartnerCount = new Map<string, number>();
  const hourly = Array(24).fill(0);
  const weekday = Array(7).fill(0);

  let total = 0;
  let arrivals = 0;
  let departures = 0;
  let domestic = 0;
  let international = 0;
  let unknownRoute = 0;
  let minTs = Infinity;
  let maxTs = -Infinity;

  const rl = readline.createInterface({
    input: fs.createReadStream(fp),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let r: Flight;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }

    total++;
    const origin = r.origin_icao || "";
    const dest = r.dest_icao || r.dest_icao_actual || "";

    // arr / dep（fetch-tracks 在 dep + dest 各寫一筆）
    if (dest === icao && origin !== icao) arrivals++;
    else if (origin === icao && dest !== icao) departures++;
    else if (origin === icao && dest === icao) {
      // 同地起降（少見，例如訓練）— 算 arrivals
      arrivals++;
    } else if (!origin && dest === icao) {
      arrivals++; // origin 為空但落在本機場
    } else if (origin === icao && !dest) {
      departures++;
    }

    // 國際 / 國內
    const originIsTW = !!origin && origin.startsWith("RC");
    const destIsTW = !!dest && dest.startsWith("RC");
    if (!origin || !dest) unknownRoute++;
    else if (originIsTW && destIsTW) domestic++;
    else international++;

    // 航司
    const al = r.operating_as || r.painted_as || "UNKNOWN";
    airlineCount.set(al, (airlineCount.get(al) || 0) + 1);

    // 機型
    const ac = r.aircraft_type || "UNKNOWN";
    aircraftCount.set(ac, (aircraftCount.get(ac) || 0) + 1);

    // 航線（directed）
    if (origin && dest) {
      const key = `${origin}->${dest}`;
      routeCount.set(key, (routeCount.get(key) || 0) + 1);

      // 無向（合併雙向）
      const [a, b] = origin < dest ? [origin, dest] : [dest, origin];
      const uKey = `${a}<->${b}`;
      const prev = undirectedRouteCount.get(uKey);
      if (prev) prev.count++;
      else undirectedRouteCount.set(uKey, { a, b, count: 1 });
    }

    // 跨境 partner（origin 或 dest 中非 TW 的那端）
    const other = origin === icao ? dest : origin;
    if (other && !other.startsWith("RC") && other.length >= 2) {
      const c = countryOf(other);
      if (c) intlPartnerCount.set(c.code, (intlPartnerCount.get(c.code) || 0) + 1);
    }

    // 時段（用 first_seen，UTC+8）
    const t = r.first_seen || r.arr_time || r.last_seen;
    if (t && t > 0) {
      if (t < minTs) minTs = t;
      if (t > maxTs) maxTs = t;
      const dt = new Date((t + 8 * 3600) * 1000);
      hourly[dt.getUTCHours()]++;
      weekday[dt.getUTCDay()]++;
    }
  }

  // 航司排行（Top 15 + 中文/品牌色補齊）
  const airlines = [...airlineCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([code, count]) => {
      const info = AIRLINE_DB[code];
      return {
        code,
        nameZh: info?.nameZh,
        nameEn: info?.name,
        type: info?.type,
        brandColor: info?.brandColor,
        country: info?.country,
        count,
        pct: +((count / total) * 100).toFixed(2),
      };
    });

  // 航司類型 mix
  const airlineTypeMix: Record<string, { count: number; pct: number }> = {};
  for (const [code, count] of airlineCount.entries()) {
    const info = AIRLINE_DB[code];
    const t = info?.type || "unknown";
    if (!airlineTypeMix[t]) airlineTypeMix[t] = { count: 0, pct: 0 };
    airlineTypeMix[t].count += count;
  }
  for (const k of Object.keys(airlineTypeMix)) {
    airlineTypeMix[k].pct = +((airlineTypeMix[k].count / total) * 100).toFixed(2);
  }

  // 機型排行（Top 15 + 座位數加權）
  let totalSeats = 0;
  let coveredFlights = 0;
  const aircraft = [...aircraftCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([type, count]) => {
      const info = AIRCRAFT_DB[type];
      const seats = info?.seats || 0;
      const seatsTotal = seats * count;
      return {
        type,
        name: info?.name,
        category: info?.category,
        seats: info?.seats,
        count,
        pct: +((count / total) * 100).toFixed(2),
        seatsTotal,
      };
    });

  // 全機型座位加總（不只 Top 15）
  for (const [type, count] of aircraftCount.entries()) {
    const info = AIRCRAFT_DB[type];
    if (info?.seats) {
      totalSeats += info.seats * count;
      coveredFlights += count;
    } else {
      // fallback via getAircraftInfo（會 heuristic 推斷）
      const fb = getAircraftInfo(type);
      if (fb?.seats && fb.seats > 0) {
        totalSeats += fb.seats * count;
        coveredFlights += count;
      }
    }
  }

  // 機型類別 mix（widebody/narrowbody/...）
  const aircraftCategoryMix: Record<string, { count: number; pct: number; seats: number }> = {};
  for (const [type, count] of aircraftCount.entries()) {
    const info = AIRCRAFT_DB[type] || getAircraftInfo(type);
    const cat = info?.category || "other";
    if (!aircraftCategoryMix[cat]) aircraftCategoryMix[cat] = { count: 0, pct: 0, seats: 0 };
    aircraftCategoryMix[cat].count += count;
    if (info?.seats) aircraftCategoryMix[cat].seats += info.seats * count;
  }
  for (const k of Object.keys(aircraftCategoryMix)) {
    aircraftCategoryMix[k].pct = +((aircraftCategoryMix[k].count / total) * 100).toFixed(2);
  }

  // 跨境 partner（含中文國名）
  const intlPartnerSum = [...intlPartnerCount.values()].reduce((s, n) => s + n, 0);
  const intlPartners = [...intlPartnerCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => {
      // 反查 nameZh：找第一個 prefix → code 對應到此 code 的 nameZh
      let nameZh = code;
      for (const v of Object.values(ICAO_COUNTRY)) {
        if (v.code === code) { nameZh = v.nameZh; break; }
      }
      for (const v of Object.values(ICAO_COUNTRY_1)) {
        if (v.code === code) { nameZh = v.nameZh; break; }
      }
      return {
        country: code,
        nameZh,
        count,
        pct: intlPartnerSum > 0 ? +((count / intlPartnerSum) * 100).toFixed(2) : 0,
      };
    });

  // 航線（directed）Top 30
  const routes = [...routeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([key, count]) => {
      const [o, d] = key.split("->");
      const isInternational = !(o.startsWith("RC") && d.startsWith("RC"));
      return { origin: o, dest: d, count, isInternational };
    });

  // 航線（undirected）Top 15 — 合併雙向
  const topRoutesUndirected = [...undirectedRouteCount.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map((r) => ({
      a: r.a,
      b: r.b,
      count: r.count,
      isInternational: !(r.a.startsWith("RC") && r.b.startsWith("RC")),
    }));

  const spanDays = minTs === Infinity ? 0 : Math.max(1, Math.round((maxTs - minTs) / 86400));
  const dailyAverage = spanDays > 0 ? +(total / spanDays).toFixed(1) : 0;

  return {
    icao,
    iata: meta.iata,
    nameZh: meta.nameZh,
    nameEn: meta.nameEn,
    total,
    arrivals,
    departures,
    domestic,
    international,
    unknownRoute,
    spanDays,
    firstSeen: minTs === Infinity ? "" : new Date(minTs * 1000).toISOString(),
    lastSeen: maxTs === -Infinity ? "" : new Date(maxTs * 1000).toISOString(),
    dailyAverage,
    airlines,
    aircraft,
    aircraftCategoryMix,
    airlineTypeMix,
    seatCapacity: {
      total: totalSeats,
      avgPerFlight: coveredFlights > 0 ? Math.round(totalSeats / coveredFlights) : 0,
      coveragePct: total > 0 ? +((coveredFlights / total) * 100).toFixed(1) : 0,
    },
    routes,
    topRoutesUndirected,
    intlPartners,
    hourly,
    weekday,
  };
}

async function main() {
  const perAirport: Record<string, AirportStats> = {};
  for (const icao of Object.keys(TW_AIRPORTS)) {
    console.error(`Analyzing ${icao}...`);
    const stats = await analyzeAirport(icao);
    if (stats) perAirport[icao] = stats;
  }

  // 全國彙總
  const overall = {
    totalMovements: 0,
    domestic: 0,
    international: 0,
    unknownRoute: 0,
    seatCapacityTotal: 0,
    earliestSample: "",
    latestSample: "",
    airportCount: Object.keys(perAirport).length,
  };
  let minG = Infinity, maxG = -Infinity;
  for (const s of Object.values(perAirport)) {
    overall.totalMovements += s.total;
    overall.domestic += s.domestic;
    overall.international += s.international;
    overall.unknownRoute += s.unknownRoute;
    overall.seatCapacityTotal += s.seatCapacity.total;
    if (s.firstSeen) {
      const t = new Date(s.firstSeen).getTime() / 1000;
      if (t < minG) minG = t;
    }
    if (s.lastSeen) {
      const t = new Date(s.lastSeen).getTime() / 1000;
      if (t > maxG) maxG = t;
    }
  }
  overall.earliestSample = minG === Infinity ? "" : new Date(minG * 1000).toISOString();
  overall.latestSample = maxG === -Infinity ? "" : new Date(maxG * 1000).toISOString();

  // 全國 OD 矩陣（合併所有機場視角，避免重複計算同一航班的 dep+dest 兩筆）
  // 做法：只挑 origin 為 TW 機場的那邊（其在 dep 機場檔出現一次），這樣每個航班只算一次
  const odMatrix = new Map<string, { origin: string; dest: string; count: number; isInternational: boolean; isDomestic: boolean }>();
  for (const [icao, s] of Object.entries(perAirport)) {
    for (const r of s.routes) {
      // 只取 origin === 該機場 的條目（這個機場視角下的「出發班次」）
      if (r.origin !== icao) continue;
      const key = `${r.origin}->${r.dest}`;
      const prev = odMatrix.get(key);
      if (prev) prev.count += r.count;
      else odMatrix.set(key, {
        origin: r.origin,
        dest: r.dest,
        count: r.count,
        isInternational: r.isInternational,
        isDomestic: !r.isInternational,
      });
    }
  }
  const odList = [...odMatrix.values()].sort((a, b) => b.count - a.count);

  const out = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: "plan-art / public/tracks/airports (FR24 軌跡樣本)",
      caveat:
        "本檔基於 2026-02 至 04 期間的 FR24 軌跡樣本，非民航局/桃機官方統計。" +
        "計數慣例：fetch-tracks 在「起點機場」與「終點機場」各寫一筆同一航班，" +
        "所以 total = arrivals + departures（國際標準的『起降架次』）。獨立航班數 ≈ total / 2。" +
        "若需長期年/月趨勢請串接民航局或桃機 odp.taoyuan-airport.com 的官方統計。",
      coverage: {
        airports: Object.keys(TW_AIRPORTS),
        note: "離島/區域機場（RCQC/RCBS/RCMQ/RCFN）目前僅 7 天樣本，桃園/高雄/松山有 28–47 天。" +
              "顯示『日均』KPI 請用各機場的 dailyAverage 欄位（已按各自實際天數計算）。",
      },
    },
    overall: {
      ...overall,
      domesticPct: overall.totalMovements > 0
        ? +((overall.domestic / overall.totalMovements) * 100).toFixed(2)
        : 0,
      internationalPct: overall.totalMovements > 0
        ? +((overall.international / overall.totalMovements) * 100).toFixed(2)
        : 0,
    },
    airports: perAirport,
    odMatrix: odList,
  };

  const outPath = "findings/aviation-stats.json";
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  const size = fs.statSync(outPath).size;
  console.error(`\n✅ wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);
  console.error(`   airports: ${overall.airportCount}, movements: ${overall.totalMovements.toLocaleString()}`);
  console.error(`   intl: ${overall.international.toLocaleString()} (${out.overall.internationalPct}%), dom: ${overall.domestic.toLocaleString()} (${out.overall.domesticPct}%)`);
  console.error(`   total seats: ${overall.seatCapacityTotal.toLocaleString()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
