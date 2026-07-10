/**
 * Step 1: 查詢機場航班清單（Flight Summary Light）
 *
 * Essential 方案限制：
 *   - Response limit: 300 筆/次
 *   - Rate limit: 30 次/分鐘
 *   - Historic: 2 年
 *   - Monthly credits: 666,000
 *
 * 使用方式：
 *   npx tsx scripts/fetch-flights.ts                        # 預設抓台灣 + 最近 3 天
 *   npx tsx scripts/fetch-flights.ts --from 2026-02-20 --to 2026-02-24
 *   npx tsx scripts/fetch-flights.ts --airports KSEA,ZBAA --direction outbound
 *   npx tsx scripts/fetch-flights.ts --airports-file scripts/top1000-airports.json --batch-size 100
 *
 * 參數：
 *   --from / --to                日期範圍（YYYY-MM-DD 或 ISO）
 *   --airports A,B,C             覆蓋預設機場（與 --airports-file / --group union）
 *   --airports-file path         讀 JSON 清單（[{ icao }] 或 [ICAO]）
 *   --group NAME                 從 scripts/airport-groups.json 取 group（如 TW / TW-CIVIL）
 *   --direction outbound|inbound|both   預設 outbound（單向、零重複命中）
 *   --batch-size N               跑 N 座機場後自動停（0 = 不停，預設 0）
 *   --range A-B                  只跑清單中第 A~B 座（1-based 含頭含尾）
 */

import dotenv from "dotenv";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── 設定 ──────────────────────────────────────────────

const TAIWAN_AIRPORTS = [
  // ── 民用機場 ──────────────────────────────────────────
  "RCTP", // 台灣桃園國際機場
  "RCSS", // 臺北松山機場
  "RCKH", // 高雄國際機場
  "RCNN", // 臺東機場（豐年）
  "RCBS", // 金門機場（尚義）
  "RCFG", // 馬祖南竿機場
  "RCMT", // 馬祖北竿機場
  "RCQC", // 澎湖機場（馬公）
  "RCWA", // 望安機場
  "RCCM", // 七美機場
  "RCGI", // 綠島機場
  "RCLY", // 蘭嶼機場
  "RCKW", // 恆春機場（2019 起停飛，保留備用）
  // ── 軍民合用機場 ──────────────────────────────────────
  "RCMQ", // 臺中國際機場（清泉崗）
  "RCYU", // 花蓮機場
  "RCFN", // 臺南機場
  "RCKU", // 嘉義機場
  "RCDC", // 屏東南機場
  // ── 軍用機場（有 ICAO，FR24 可能有資料）──────────────
  "RCAY", // 岡山基地（空軍航技學校）
  "RCPO", // 新竹基地（F-16）
  "RCSQ", // 屏東北機場（屏東基地）
  "RCQS", // 志航基地（臺東，訓練機）
];

const DAYS_BACK = 3;
const API_BASE = "https://fr24api.flightradar24.com/api";
const PAGE_SIZE = 300;         // Essential 方案上限
const DELAY_MS = 2200;         // 2.2s → 安全低於 30 次/分鐘
const MAX_RETRIES = 5;
const OUTPUT_FILE = resolve(ROOT, "scripts/flight-list.json");
const FLIGHTS_DIR = resolve(ROOT, "scripts/flights"); // 新格式: {ICAO}/{YYYY-MM-DD}.json
const GROUPS_FILE = resolve(ROOT, "scripts/airport-groups.json"); // 命名機場群（--group）

type Direction = "outbound" | "inbound" | "both";

/** 讀 scripts/airport-groups.json 取某 group 的 ICAO 清單；找不到報錯列出可用 group。 */
function loadGroup(name: string): string[] {
  if (!existsSync(GROUPS_FILE)) {
    console.error(`❌ 找不到 ${GROUPS_FILE}`);
    process.exit(1);
  }
  const groups = JSON.parse(readFileSync(GROUPS_FILE, "utf-8")) as Record<
    string,
    unknown
  >;
  const list = groups[name];
  if (!Array.isArray(list)) {
    const avail = Object.keys(groups)
      .filter((k) => Array.isArray(groups[k]))
      .join(", ");
    console.error(`❌ 找不到 group "${name}"，可用: ${avail}`);
    process.exit(1);
  }
  return (list as string[]).map((s) => String(s).toUpperCase());
}

// ── CLI 參數解析 ───────────────────────────────────────

interface ParsedArgs {
  from: Date;
  to: Date;
  sessionKey: string;
  airports: string[];
  direction: Direction;
  batchSize: number;          // 0 = 不停
  range: [number, number] | null; // 1-based inclusive
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i !== -1 ? args[i + 1] : undefined;
  };

  // ── 機場清單 ── --airports-file / --airports / --group 全部 union；皆無 → 預設台灣
  const apFile = get("--airports-file");
  const apInline = get("--airports");
  const groupName = get("--group");
  const collected: string[] = [];
  if (apFile) {
    const raw = JSON.parse(readFileSync(resolve(ROOT, apFile), "utf-8"));
    collected.push(
      ...(Array.isArray(raw) ? raw : raw.airports ?? [])
        .map((x: unknown) =>
          typeof x === "string"
            ? x.toUpperCase()
            : String((x as { icao?: string }).icao || "").toUpperCase(),
        )
        .filter((s: string) => s),
    );
  }
  if (apInline) {
    collected.push(...apInline.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
  }
  if (groupName) {
    collected.push(...loadGroup(groupName));
  }
  const airports = collected.length > 0 ? [...new Set(collected)] : TAIWAN_AIRPORTS;

  // ── 方向 ──
  const dirRaw = (get("--direction") || "outbound").toLowerCase();
  if (dirRaw !== "outbound" && dirRaw !== "inbound" && dirRaw !== "both") {
    console.error("❌ --direction 必須是 outbound / inbound / both");
    process.exit(1);
  }
  const direction = dirRaw as Direction;

  // ── batch / range ──
  const batchSize = parseInt(get("--batch-size") || "0", 10) || 0;
  let range: [number, number] | null = null;
  const rangeRaw = get("--range");
  if (rangeRaw) {
    const m = rangeRaw.match(/^(\d+)-(\d+)$/);
    if (!m) { console.error("❌ --range 格式錯誤，需 A-B"); process.exit(1); }
    range = [parseInt(m[1]!, 10), parseInt(m[2]!, 10)];
  }

  // ── 日期範圍 ──
  const fromStr = get("--from");
  const toStr = get("--to");
  if (fromStr && toStr) {
    const from = new Date(fromStr.includes("T") ? fromStr : `${fromStr}T00:00:00Z`);
    const to = new Date(toStr.includes("T") ? toStr : `${toStr}T23:59:59Z`);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      console.error("❌ --from / --to 格式錯誤"); process.exit(1);
    }
    return { from, to, sessionKey: `${fromStr}:${toStr}`, airports, direction, batchSize, range };
  }

  const now = new Date();
  const from = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);
  return { from, to: now, sessionKey: "default", airports, direction, batchSize, range };
}

// ── 新格式儲存：scripts/flights/{ICAO}/{YYYY-MM-DD}.json ──
// 用日期範圍的起始日當 key（同一 session 跨日就會多檔，但目前都是單日）
function newFormatPaths(airport: string, from: Date, to: Date): string[] {
  // 列出 from~to 涵蓋的所有日期（UTC 切日）
  const dates: string[] = [];
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = to.getTime();
  let cur = start.getTime();
  while (cur <= end) {
    const d = new Date(cur);
    dates.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`);
    cur += 24 * 3600 * 1000;
  }
  return dates.map((dt) => join(FLIGHTS_DIR, airport, `${dt}.json`));
}

function isAirportDone(airport: string, from: Date, to: Date): boolean {
  // 新格式存在 → 視為完成（任一覆蓋日的檔案存在即可，因為主要用例是「單日範圍」）
  return newFormatPaths(airport, from, to).some((p) => existsSync(p));
}

function writeNewFormat(
  airport: string,
  from: Date,
  to: Date,
  direction: Direction,
  flights: FR24FlightSummary[],
) {
  // 把 flights 按 datetime_takeoff 的 UTC 日期分桶
  const buckets = new Map<string, FR24FlightSummary[]>();
  for (const f of flights) {
    const dt = (f.datetime_takeoff || f.first_seen || "").slice(0, 10);
    if (!dt) continue;
    if (!buckets.has(dt)) buckets.set(dt, []);
    buckets.get(dt)!.push(f);
  }

  // 也要為「該機場本次 sessionKey 涵蓋的日期」開空檔（避免下次重抓）
  const sessionDates = newFormatPaths(airport, from, to).map((p) => {
    const m = p.match(/(\d{4}-\d{2}-\d{2})\.json$/);
    return m ? m[1]! : null;
  }).filter((x): x is string => x !== null);
  for (const dt of sessionDates) {
    if (!buckets.has(dt)) buckets.set(dt, []);
  }

  for (const [dt, arr] of buckets) {
    const dir = join(FLIGHTS_DIR, airport);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, `${dt}.json`);

    // merge-write：先讀既有檔（若有），按 fr24_id 聯集後再寫，避免同日期重抓整檔覆蓋
    const byId = new Map<string, FR24FlightSummary>();
    if (existsSync(path)) {
      try {
        const prev = JSON.parse(readFileSync(path, "utf-8")) as {
          flights?: FR24FlightSummary[];
        };
        for (const f of prev.flights ?? []) byId.set(f.fr24_id, f);
      } catch {
        // 壞檔 → 直接以本次結果覆蓋
      }
    }
    for (const f of arr) byId.set(f.fr24_id, f);
    const merged = [...byId.values()];

    const payload = {
      airport,
      date: dt,
      direction,
      fetched_at: new Date().toISOString(),
      count: merged.length,
      flights: merged,
    };
    writeFileSync(path, JSON.stringify(payload, null, 2));
  }
}

// ── 工具 ──────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toISO(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ── API 回傳格式 ──────────────────────────────────────

interface FR24FlightSummary {
  fr24_id: string;
  flight: string;
  callsign: string;
  operating_as: string;
  painted_as: string;
  type: string;
  reg: string;
  orig_icao: string;
  dest_icao: string;
  dest_icao_actual: string;
  datetime_takeoff: string;
  datetime_landed: string;
  hex: string;
  first_seen: string;
  last_seen: string;
  flight_ended: boolean;
  [key: string]: unknown;
}

// ── 單次 API 呼叫（含 retry） ──────────────────────────

let totalRequests = 0;

async function fetchPage(
  airport: string,
  from: string,
  to: string,
  direction: Direction,
): Promise<FR24FlightSummary[]> {
  const token = process.env.FR24_API_TOKEN;
  if (!token) throw new Error("FR24_API_TOKEN not found in .env");

  // direction 加前綴 → 控制是否 dep/arr 都計
  const airportParam =
    direction === "both" ? airport : `${direction}:${airport}`;

  const params = new URLSearchParams({
    flight_datetime_from: from,
    flight_datetime_to: to,
    "airports[]": airportParam,
    limit: String(PAGE_SIZE),
    sort: "asc",
  });

  const url = `${API_BASE}/flight-summary/light?${params}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept-Version": "v1",
      },
    });

    totalRequests++;

    if (res.ok) {
      const json = await res.json();
      return Array.isArray(json) ? json : json.data ?? [];
    }

    if (res.status === 429) {
      const waitSec = Math.min(15 * Math.pow(2, attempt - 1), 120);
      process.stdout.write(`\n    ⏳ Rate limit, 等待 ${waitSec}s (${attempt}/${MAX_RETRIES})... `);
      await sleep(waitSec * 1000);
      continue;
    }

    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  throw new Error(`Rate limit: ${MAX_RETRIES} 次重試後仍失敗`);
}

// ── 分頁查詢單一機場 ──────────────────────────────────

async function fetchAirportFlights(
  airport: string,
  from: Date,
  to: Date,
  direction: Direction,
): Promise<{ flights: FR24FlightSummary[]; pages: number }> {
  const allPages: FR24FlightSummary[] = [];
  let cursor = toISO(from);
  const endStr = toISO(to);
  let page = 1;
  let pagesUsed = 0;

  while (true) {
    const results = await fetchPage(airport, cursor, endStr, direction);
    pagesUsed++;
    allPages.push(...results);

    process.stdout.write(`[p${page}:${results.length}] `);

    // 不滿 PAGE_SIZE → 已取完
    if (results.length < PAGE_SIZE) break;

    // 用最後一筆的 datetime_takeoff 或 first_seen 作為下次 cursor
    const last = results[results.length - 1]!;
    const lastTime = last.datetime_takeoff || last.first_seen;
    if (!lastTime || lastTime <= cursor) {
      // 防止無限迴圈：時間沒前進就停止
      break;
    }
    cursor = lastTime;

    // cursor 已到達或超過結束時間，不需要再查
    if (cursor >= endStr) break;

    page++;

    await sleep(DELAY_MS);
  }

  return { flights: allPages, pages: pagesUsed };
}

// ── 進度管理 ──────────────────────────────────────────

interface ProgressData {
  // completed 格式：`${airport}:${sessionKey}` → 支援多日期範圍各自追蹤
  completed: string[];
  flights: FR24FlightSummary[];
  updated_at: string;
}

function loadProgress(sessionKey: string): {
  flights: Map<string, FR24FlightSummary>;
  completed: Set<string>;  // 存放 `${airport}:${sessionKey}`
} {
  const flights = new Map<string, FR24FlightSummary>();
  const completed = new Set<string>();

  if (existsSync(OUTPUT_FILE)) {
    try {
      const prev = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8")) as ProgressData;
      if (prev.flights) {
        for (const f of prev.flights) flights.set(f.fr24_id, f);
      }
      if (prev.completed) {
        // 只載入與本次 sessionKey 相符的進度
        for (const key of prev.completed) {
          if (key.endsWith(`:${sessionKey}`)) completed.add(key);
        }
      }
    } catch {
      // ignore
    }
  }

  return { flights, completed };
}

function saveProgress(
  flights: Map<string, FR24FlightSummary>,
  completed: Set<string>,
  sessionKey: string,
) {
  // 讀取既有 completed（其他 session 的進度要保留）
  let existingCompleted: string[] = [];
  if (existsSync(OUTPUT_FILE)) {
    try {
      const prev = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8")) as ProgressData;
      // 保留非本 session 的 completed 記錄
      existingCompleted = (prev.completed ?? []).filter(
        (k) => !k.endsWith(`:${sessionKey}`),
      );
    } catch { /* ignore */ }
  }

  const data: ProgressData = {
    completed: [...existingCompleted, ...Array.from(completed)],
    flights: Array.from(flights.values()),
    updated_at: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
}

// ── 主程式 ──────────────────────────────────────────

async function main() {
  console.log("=== FR24 Flight Summary - Step 1 ===");
  console.log("Essential 方案：300 筆/次, 30 次/分鐘\n");

  const { from, to, sessionKey, airports, direction, batchSize, range } = parseArgs();
  console.log(`時間範圍: ${toISO(from)} → ${toISO(to)}`);
  console.log(`方向    : ${direction}${direction === "outbound" ? "（單向，無重複命中）" : ""}`);
  if (sessionKey !== "default") console.log(`Session : ${sessionKey}`);

  // ── 套用 range ──
  let targetAirports = airports;
  if (range) {
    const [a, b] = range;
    targetAirports = airports.slice(a - 1, b);
    console.log(`Range   : 第 ${a}~${b} 座 / ${airports.length} 總座`);
  }
  console.log(`機場數  : ${targetAirports.length}${targetAirports.length <= 30 ? ` (${targetAirports.join(", ")})` : ""}`);
  if (batchSize > 0) console.log(`Batch   : ${batchSize} 座後自動停\n`);
  else console.log();

  const { flights: allFlights, completed: completedAirports } = loadProgress(sessionKey);
  if (completedAirports.size > 0) {
    console.log(`📂 legacy 進度: ${allFlights.size} 筆航班（累計）, ${completedAirports.size} 座（舊 sessionKey 完成）\n`);
  }

  const stats: { airport: string; total: number; new: number; pages: number; est_pages: number }[] = [];
  let batchProcessed = 0;
  let stoppedByBatch = false;
  let remainingAfterStop = 0;

  for (let i = 0; i < targetAirports.length; i++) {
    const airport = targetAirports[i]!;
    const sessionAirportKey = `${airport}:${sessionKey}`;

    // 新格式檢查（檔案存在 = 已完成）
    if (isAirportDone(airport, from, to)) {
      console.log(`[${i + 1}/${targetAirports.length}] ${airport} ✅ 新檔已存在，跳過`);
      continue;
    }
    // legacy 進度檢查（向下相容）
    if (completedAirports.has(sessionAirportKey)) {
      console.log(`[${i + 1}/${targetAirports.length}] ${airport} ✅ legacy 完成，跳過`);
      continue;
    }

    process.stdout.write(`[${i + 1}/${targetAirports.length}] ${airport} `);

    try {
      const { flights, pages } = await fetchAirportFlights(airport, from, to, direction);
      let newCount = 0;
      for (const f of flights) {
        if (!allFlights.has(f.fr24_id)) {
          allFlights.set(f.fr24_id, f);
          newCount++;
        }
      }
      console.log(`→ ${flights.length} 筆 / ${pages} pages（全域新增 ${newCount}）`);
      stats.push({ airport, total: flights.length, new: newCount, pages, est_pages: Math.ceil(flights.length / PAGE_SIZE) });

      // 寫新格式（authoritative）
      writeNewFormat(airport, from, to, direction, flights);

      // 同時寫 legacy（給 fetch-tracks 用，過渡期保留）
      completedAirports.add(sessionAirportKey);
      saveProgress(allFlights, completedAirports, sessionKey);

      batchProcessed++;
      if (batchSize > 0 && batchProcessed >= batchSize) {
        stoppedByBatch = true;
        remainingAfterStop = targetAirports.length - i - 1;
        console.log(`\n🛑 已完成本批 ${batchSize} 座，自動停下對帳。`);
        break;
      }
    } catch (err) {
      console.log(`→ ❌ ${(err as Error).message}`);
      stats.push({ airport, total: -1, new: 0, pages: 0, est_pages: 0 });
    }

    await sleep(DELAY_MS);
  }

  // ── 統計 + 對帳表 ──
  console.log("\n=== 統計（本批）===\n");
  const validStats = stats.filter((s) => s.total !== -1);
  const errCount = stats.length - validStats.length;

  if (validStats.length > 0) {
    console.log("排名  機場    航班   pages  est  diff");
    console.log("---  ------  -----  -----  ---  ----");
    validStats
      .slice()
      .sort((a, b) => b.total - a.total)
      .forEach((s, i) => {
        const rank = String(i + 1).padStart(3);
        const ap = s.airport.padEnd(6);
        const tot = String(s.total).padStart(5);
        const pg = String(s.pages).padStart(5);
        const est = String(s.est_pages).padStart(3);
        const diff = s.pages - s.est_pages;
        const diffStr = (diff >= 0 ? "+" : "") + String(diff);
        console.log(`${rank}  ${ap}  ${tot}  ${pg}  ${est}  ${diffStr}`);
      });
  }

  const totalFlights = validStats.reduce((sum, s) => sum + s.total, 0);
  const totalNew = validStats.reduce((sum, s) => sum + s.new, 0);
  const totalPages = validStats.reduce((sum, s) => sum + s.pages, 0);
  const totalEstPages = validStats.reduce((sum, s) => sum + s.est_pages, 0);
  // ⚠️ 實測校準（2026-07-11 FR24 dashboard）：flight-summary/light ≈ 227 credits/page，
  // 不是舊估的 38.7（差 ~5.9×）。dashboard: 254,821 credits / 1,122 calls。
  const CREDITS_PER_PAGE = 227;
  const actualCredits = Math.round(totalPages * CREDITS_PER_PAGE);
  const estCredits = Math.round(totalEstPages * CREDITS_PER_PAGE);

  console.log("\n=== 對帳 ===");
  console.log(`本批機場處理: ${validStats.length} 成功 / ${errCount} 失敗`);
  console.log(`本批航班總數: ${totalFlights}（新增 ${totalNew}）`);
  console.log(`pages       : 實際 ${totalPages} / 估算 ${totalEstPages}（差 ${totalPages - totalEstPages}）`);
  console.log(`Schedule credits: 實際 ~${actualCredits} / 估算 ~${estCredits}（差 ${actualCredits - estCredits}）`);
  console.log(`Track credits 預估（按本批新增）: ${totalNew} × 40 ≈ ${totalNew * 40}`);
  console.log(`累計 flight-list.json 不重複航班: ${allFlights.size}`);
  console.log(`API 請求次數（含 retry）: ${totalRequests}`);

  if (stoppedByBatch) {
    console.log(`\n⏸️  Batch 停下。剩餘 ${remainingAfterStop} 座未跑（檢查目錄 scripts/flights/）`);
    console.log(`   續跑：移除 --batch-size 或加 --range ${range ? `${range[0] + batchProcessed}-${range[1]}` : `${batchProcessed + 1}-${targetAirports.length}`}`);
  } else {
    console.log("\n✅ 本批所有機場處理完成！");
  }
}

main().catch((err) => {
  console.error("\n致命錯誤:", err);
  process.exit(1);
});
