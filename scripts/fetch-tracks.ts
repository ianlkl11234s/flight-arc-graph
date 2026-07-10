/**
 * Step 2: 根據 Step 1 的航班清單，逐一撈取飛行軌跡
 *
 * 使用方式：
 *   npx tsx scripts/fetch-tracks.ts --date 2026-02-18
 *   npx tsx scripts/fetch-tracks.ts --airports EGKK,EGLC,EGSS,EGGW
 *
 * 參數：
 *   --date YYYY-MM-DD                只處理該日期的航班（datetime_takeoff 起頭）
 *   --airports RCTP,RJTT,...         只處理 orig 或 dest 落在清單內的航班（推薦）
 *   --airports-file path             從 JSON 清單取機場（[{icao,rank}] 或 [ICAO]）
 *   --rank A-B                       搭配 --airports-file，只取 rank 在 A~B 的機場（Top-1000 分批用）
 *   --limit N                        最多處理 N 筆（測試用）
 *   --max-credits N                  本次最多花 ~N credits（= 上限 floor(N/40) 筆），吃滿自動停
 *   --dry-run                        只印 todo 數量 + 預估 credits，不打 API
 *   不帶參數 → 處理全部航班
 *
 *   每次實跑結束（含 SIGINT / circuit breaker）會 append 一行到 scripts/fetch-sessions.ndjson（額度帳）
 *
 * Essential 方案限制：300 筆/次、30 次/分鐘、666,000 credits/月
 *
 * 資料流（v2, NDJSON append-only）：
 *   scripts/flights/{ICAO}/{YYYY-MM-DD}.json → 航班清單 (Step 1 產出，優先；fallback flight-list.json)
 *   track-done.ndjson / track-failed.ndjson → progress (append-only，不 re-serialize)
 *   public/tracks/airports/{ICAO}.jsonl     → 軌跡 (直接 append, dep + dest 各一份)
 *
 * 支援中斷續接：已取得軌跡的航班會自動跳過
 */

import dotenv from "dotenv";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { gzipSync } from "zlib";
dotenv.config();

// ── 設定 ──────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const API_BASE = "https://fr24api.flightradar24.com/api";
const DELAY_MS = 2050; // 2.05s → ~29 req/min，接近 Essential 30 req/min 上限
const MAX_RETRIES = 5;
const CREDITS_PER_TRACK = 40; // flight-tracks 每筆約 40 credits（估值，每月拿 FR24 dashboard 校準）

const INPUT_FILE = resolve(ROOT, "scripts/flight-list.json");
const FLIGHTS_DIR = resolve(ROOT, "scripts/flights"); // 新格式來源
const DONE_NDJSON = resolve(ROOT, "scripts/track-done.ndjson");
const FAILED_NDJSON = resolve(ROOT, "scripts/track-failed.ndjson");
const SESSIONS_NDJSON = resolve(ROOT, "scripts/fetch-sessions.ndjson"); // 額度帳（append-only）
const AIRPORTS_DIR = resolve(ROOT, "public/tracks/airports");
const RAW_DIR = resolve(ROOT, "public/tracks/raw"); // {YYYY-MM}/{ab}/{fr24_id}.json.gz

// ── 型別 ──────────────────────────────────────────────

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

/** 最終輸出格式（與 app 的 Flight 介面一致） */
interface FlightOutput {
  fr24_id: string;
  callsign: string;
  registration: string;
  aircraft_type: string;
  origin_icao: string;
  origin_iata: string;
  dest_icao: string;
  dest_iata: string;
  dep_time: number;
  arr_time: number;
  status: string;
  trail_points: number;
  path: [number, number, number, number][];
  // FR24 flight-summary 的額外 metadata（2026-04-24 新增）
  flight_number: string;      // IATA 航班號（如 "CX408"）
  operating_as: string;        // 實際營運航空公司 ICAO（如 "CAL"）
  painted_as: string;          // 機身塗裝航空公司 ICAO
  hex: string;                 // ADS-B 晶片碼（6 位 hex，全球唯一）
  dest_icao_actual: string;    // 實際降落機場（轉降時 ≠ dest_icao）
  first_seen: number;          // ADS-B 首次偵測 Unix timestamp
  last_seen: number;           // ADS-B 最後偵測 Unix timestamp
}

// ── 工具 ──────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoToUnix(iso: string): number {
  return iso ? Math.floor(new Date(iso).getTime() / 1000) : 0;
}

/** 4 位小數 + 整數高度（與 split-tracks.ts 一致） */
function reducePrecision(
  path: number[][],
): [number, number, number, number][] {
  return path.map((p) => [
    +p[0]!.toFixed(4),
    +p[1]!.toFixed(4),
    Math.round(p[2]!),
    p[3]!,
  ] as [number, number, number, number]);
}

// ── API 呼叫 ──────────────────────────────────────────

let totalRequests = 0;

async function fetchTrack(fr24Id: string): Promise<unknown> {
  const token = process.env.FR24_API_TOKEN;
  if (!token) throw new Error("FR24_API_TOKEN not found in .env");

  const url = `${API_BASE}/flight-tracks?flight_id=${fr24Id}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept-Version": "v1",
      },
    });

    totalRequests++;

    if (res.ok) {
      return await res.json();
    }

    if (res.status === 429) {
      const waitSec = Math.min(15 * Math.pow(2, attempt - 1), 120);
      process.stdout.write(
        `\n    ⏳ Rate limit, 等待 ${waitSec}s (${attempt}/${MAX_RETRIES})... `,
      );
      await sleep(waitSec * 1000);
      continue;
    }

    if (res.status === 404) {
      return null; // 軌跡不存在
    }

    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  throw new Error(`Rate limit: ${MAX_RETRIES} 次重試後仍失敗`);
}

// ── 軌跡解析 ──────────────────────────────────────────

function parseTrackPoints(
  raw: unknown,
): [number, number, number, number][] | null {
  if (!raw || typeof raw !== "object") return null;

  const data = (raw as Record<string, unknown>).data ?? raw;
  let tracks: unknown[] = [];

  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown> | undefined;
    if (first?.tracks && Array.isArray(first.tracks)) {
      tracks = first.tracks;
    } else {
      tracks = data;
    }
  } else if (
    typeof data === "object" &&
    data !== null &&
    "tracks" in data
  ) {
    tracks = (data as Record<string, unknown>).tracks as unknown[];
  }

  if (tracks.length === 0) return null;

  const points: [number, number, number, number][] = [];

  for (const pt of tracks) {
    if (!pt || typeof pt !== "object") continue;
    const p = pt as Record<string, unknown>;

    const lat = Number(p.lat ?? p.latitude ?? 0);
    const lng = Number(p.lng ?? p.lon ?? p.longitude ?? 0);
    const alt = Number(
      p.alt ?? p.altitude ?? p.alt_baro ?? p.altitude_m ?? 0,
    );
    const ts = Number(
      p.timestamp
        ? typeof p.timestamp === "string"
          ? isoToUnix(p.timestamp)
          : p.timestamp
        : p.ts ?? 0,
    );

    if (lat !== 0 && lng !== 0 && ts !== 0) {
      // FR24 通常回傳 feet，>1000 則視為 feet 轉 meters
      const altM = alt > 1000 ? Math.round(alt * 0.3048) : alt;
      points.push([lat, lng, altM, ts]);
    }
  }

  return points.length > 0 ? points : null;
}

// ── 航班清單載入 ──────────────────────────────────────

/**
 * 新格式：掃 scripts/flights/{ICAO}/{YYYY-MM-DD}.json
 * （fetch-flights.ts writeNewFormat 產出，payload.flights 為 FR24FlightSummary[]）
 * 合併所有檔案並按 fr24_id 去重；目錄不存在或無資料回傳 null。
 */
function loadNewFormatFlights(): FR24FlightSummary[] | null {
  if (!existsSync(FLIGHTS_DIR)) return null;
  const byId = new Map<string, FR24FlightSummary>();
  for (const icao of readdirSync(FLIGHTS_DIR)) {
    const dir = join(FLIGHTS_DIR, icao);
    if (!statSync(dir).isDirectory()) continue; // 跳過 .DS_Store 等
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const payload = JSON.parse(readFileSync(join(dir, file), "utf-8"));
        for (const f of payload.flights ?? []) {
          byId.set((f as FR24FlightSummary).fr24_id, f as FR24FlightSummary);
        }
      } catch {
        // skip bad file
      }
    }
  }
  return byId.size > 0 ? [...byId.values()] : null;
}

// ── 進度管理（NDJSON append-only）─────────────────────

interface Progress {
  done: Set<string>;
  failed: Set<string>;
}

function loadProgress(): Progress {
  const done = new Set<string>();
  const failed = new Set<string>();
  if (existsSync(DONE_NDJSON)) {
    const lines = readFileSync(DONE_NDJSON, "utf-8").split("\n");
    for (const line of lines) {
      const id = line.trim();
      if (id) done.add(id);
    }
  }
  if (existsSync(FAILED_NDJSON)) {
    const lines = readFileSync(FAILED_NDJSON, "utf-8").split("\n");
    for (const line of lines) {
      const id = line.trim();
      if (id) failed.add(id);
    }
  }
  return { done, failed };
}

function markDone(fr24Id: string) {
  appendFileSync(DONE_NDJSON, `${fr24Id}\n`);
}

function markFailed(fr24Id: string) {
  appendFileSync(FAILED_NDJSON, `${fr24Id}\n`);
}

/** 把完整 API response gzip 存到 raw/{YYYY-MM}/{ab}/{fr24_id}.json.gz */
function writeRawBackup(
  fr24Id: string,
  raw: unknown,
  takeoffIso: string,
  pathFirstTs?: number,
) {
  // 用 datetime_takeoff 的 YYYY-MM 當分桶；缺值 fallback 到 path 首點時間戳
  // （同 split-tracks.ts 慣例，sanity floor 1e9 擋壞時間戳）；再拿不到才 "unknown"
  let ym = (takeoffIso || "").slice(0, 7);
  if (!ym && pathFirstTs && pathFirstTs >= 1e9) {
    ym = new Date(pathFirstTs * 1000).toISOString().slice(0, 7);
  }
  if (!ym) ym = "unknown";
  const ab = fr24Id.slice(0, 2).toLowerCase();
  const dir = join(RAW_DIR, ym, ab);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${fr24Id}.json.gz`);
  if (existsSync(path)) return; // idempotent
  const buf = gzipSync(Buffer.from(JSON.stringify(raw)));
  writeFileSync(path, buf);
}

/** 把 output append 到 origin 和 dest 的 JSONL */
function writeFlightToJsonl(output: FlightOutput) {
  if (!existsSync(AIRPORTS_DIR)) {
    mkdirSync(AIRPORTS_DIR, { recursive: true });
  }
  const line = JSON.stringify(output) + "\n";
  const icaos = new Set<string>();
  if (output.origin_icao) icaos.add(output.origin_icao);
  if (output.dest_icao) icaos.add(output.dest_icao);
  for (const icao of icaos) {
    appendFileSync(join(AIRPORTS_DIR, `${icao}.jsonl`), line);
  }
}

// ── 主程式 ──────────────────────────────────────────

async function main() {
  console.log("=== FR24 Flight Tracks - Step 2 ===\n");

  // 解析 --date 參數
  const dateIdx = process.argv.indexOf("--date");
  const dateFilter = dateIdx !== -1 ? process.argv[dateIdx + 1] : null;

  // 解析 --from-time / --to-time 參數（ISO datetime，精準時區過濾 datetime_takeoff）
  const fromTimeIdx = process.argv.indexOf("--from-time");
  const toTimeIdx = process.argv.indexOf("--to-time");
  const fromTime =
    fromTimeIdx !== -1 ? process.argv[fromTimeIdx + 1]! : null;
  const toTime = toTimeIdx !== -1 ? process.argv[toTimeIdx + 1]! : null;

  // 解析 --airports 參數（篩選 orig_icao 或 dest_icao）
  const airportsIdx = process.argv.indexOf("--airports");
  const inlineAirports =
    airportsIdx !== -1
      ? process.argv[airportsIdx + 1]!.split(",").map((s) => s.trim().toUpperCase())
      : [];

  // --airports-file path [+ --rank A-B]：從 JSON 清單取 ICAO（Top-1000 分批用）
  const airportsFileIdx = process.argv.indexOf("--airports-file");
  const rankIdx = process.argv.indexOf("--rank");
  const rankArg = rankIdx !== -1 ? process.argv[rankIdx + 1]! : null;
  let fileAirports: string[] = [];
  if (airportsFileIdx !== -1) {
    const raw = JSON.parse(
      readFileSync(resolve(ROOT, process.argv[airportsFileIdx + 1]!), "utf-8"),
    );
    let entries: { icao?: string; rank?: number }[] = (
      Array.isArray(raw) ? raw : raw.airports ?? []
    ).map((x: unknown) => (typeof x === "string" ? { icao: x } : x));
    if (rankArg) {
      const m = rankArg.match(/^(\d+)-(\d+)$/);
      if (!m) {
        console.error("❌ --rank 格式錯誤，需 A-B（如 1-39）");
        process.exit(1);
      }
      const lo = parseInt(m[1]!, 10);
      const hi = parseInt(m[2]!, 10);
      entries = entries.filter(
        (e) => typeof e.rank === "number" && e.rank >= lo && e.rank <= hi,
      );
    }
    fileAirports = entries
      .map((e) => String(e.icao || "").toUpperCase())
      .filter(Boolean);
  }

  const airportsFilter =
    inlineAirports.length > 0 || fileAirports.length > 0
      ? new Set<string>([...inlineAirports, ...fileAirports])
      : null;

  // --limit N (測試用)
  const limitIdx = process.argv.indexOf("--limit");
  const limit =
    limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1]!, 10) : null;

  // --max-credits N：本次最多花 ~N credits（換算成筆數上限）
  const maxCreditsIdx = process.argv.indexOf("--max-credits");
  const maxCredits =
    maxCreditsIdx !== -1 ? parseInt(process.argv[maxCreditsIdx + 1]!, 10) : null;

  // 綜合 --limit 與 --max-credits，取較嚴格者
  let effectiveLimit = limit;
  if (maxCredits !== null) {
    const creditLimit = Math.floor(maxCredits / CREDITS_PER_TRACK);
    effectiveLimit =
      effectiveLimit === null ? creditLimit : Math.min(effectiveLimit, creditLimit);
  }

  // 本次執行標籤（給 session 帳本）
  const runLabel = rankArg
    ? `rank${rankArg}`
    : airportsFilter
      ? [...airportsFilter].slice(0, 4).join(",") + (airportsFilter.size > 4 ? `+${airportsFilter.size - 4}` : "")
      : "all";

  // --dry-run (不打 API)
  const dryRun = process.argv.includes("--dry-run");

  // 讀取 Step 1 航班清單：優先新格式 scripts/flights/，fallback legacy flight-list.json
  let allSummaries: FR24FlightSummary[];
  const newFormat = loadNewFormatFlights();
  if (newFormat) {
    allSummaries = newFormat;
    console.log(`來源: scripts/flights/（新格式，${allSummaries.length} 筆不重複）`);
  } else if (existsSync(INPUT_FILE)) {
    const inputData = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
    allSummaries = inputData.flights ?? inputData;
    console.log(`來源: flight-list.json（legacy，${allSummaries.length} 筆）`);
  } else {
    console.error(`❌ 找不到 ${FLIGHTS_DIR}/ 或 ${INPUT_FILE}，請先執行 Step 1`);
    process.exit(1);
  }

  // 篩選日期
  let targets: FR24FlightSummary[];
  if (fromTime && toTime) {
    targets = allSummaries.filter((f) => {
      const dt = f.datetime_takeoff || f.first_seen || "";
      return dt >= fromTime && dt < toTime;
    });
    console.log(`時間範圍篩選 (ISO): ${fromTime} ~ ${toTime}`);
  } else if (dateFilter) {
    targets = allSummaries.filter((f) => {
      const dt = (f.datetime_takeoff || f.first_seen || "").slice(0, 10);
      return dt === dateFilter;
    });
    console.log(`日期篩選: ${dateFilter}`);
  } else {
    targets = allSummaries;
    console.log("日期篩選: 全部");
  }

  // 篩選機場
  if (airportsFilter) {
    targets = targets.filter(
      (f) =>
        airportsFilter.has(f.orig_icao) || airportsFilter.has(f.dest_icao),
    );
    console.log(`機場篩選: ${[...airportsFilter].join(", ")}`);
  }
  console.log(`目標航班: ${targets.length} 筆\n`);

  // 載入進度
  const progress = loadProgress();
  const totalDoneCount = progress.done.size;
  console.log(`📂 進度檔（全域）: done=${totalDoneCount}, failed=${progress.failed.size}`);

  // 計算篩選範圍內已完成的數量
  const targetIds = new Set(targets.map((f) => f.fr24_id));
  const doneInTargets = [...progress.done].filter((id) => targetIds.has(id))
    .length;

  // 篩掉已完成的
  let todo = targets.filter(
    (f) => !progress.done.has(f.fr24_id) && !progress.failed.has(f.fr24_id),
  );
  console.log(
    `   本次範圍: ${doneInTargets}/${targets.length} 已完成，待處理 ${todo.length} 筆`,
  );

  const todoBeforeLimit = todo.length;
  if (effectiveLimit !== null && todo.length > effectiveLimit) {
    todo = todo.slice(0, effectiveLimit);
    const capLabel =
      maxCredits !== null
        ? `--max-credits ${maxCredits.toLocaleString()}（≈${effectiveLimit} 筆）`
        : `--limit ${effectiveLimit}`;
    console.log(`   ${capLabel}: 只處理前 ${todo.length} 筆`);
  }
  console.log();

  if (dryRun) {
    console.log(
      `🧪 --dry-run：範圍內待處理 ${todoBeforeLimit.toLocaleString()} 筆` +
        `（預估 ~${(todoBeforeLimit * CREDITS_PER_TRACK).toLocaleString()} credits）`,
    );
    if (todo.length !== todoBeforeLimit) {
      console.log(
        `           本次上限只會抓 ${todo.length.toLocaleString()} 筆` +
          `（~${(todo.length * CREDITS_PER_TRACK).toLocaleString()} credits）`,
      );
    }
    console.log("           不打 API，結束。");
    return;
  }

  if (todo.length === 0) {
    console.log("✅ 所有航班已處理完成！");
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let emptyCount = 0;
  let firstLogged = totalDoneCount > 0; // 若已有進度，跳過首筆 log

  // ── Session 額度帳（收工 / SIGINT / circuit breaker 都會寫一行）──
  let sessionLogged = false;
  const writeSessionLog = (reason: string) => {
    if (sessionLogged) return;
    sessionLogged = true;
    const attempted = successCount + emptyCount + failCount;
    if (attempted === 0) return; // 沒實際打 API 就不記
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        label: runLabel,
        date: dateFilter || (fromTime ? `${fromTime}~${toTime}` : "all"),
        reason, // done | sigint | circuit-breaker
        attempted,
        ok: successCount,
        empty: emptyCount,
        failed: failCount,
        requests: totalRequests,
        credits_est: attempted * CREDITS_PER_TRACK,
        done_total_after: progress.done.size, // 自癒錨點：可用 track-done 行數差值重建
      }) + "\n";
    appendFileSync(SESSIONS_NDJSON, line);
  };
  process.on("SIGINT", () => {
    console.log("\n⏸️  收到 SIGINT，寫入 session 帳後結束。");
    writeSessionLog("sigint");
    process.exit(130);
  });

  // ── Circuit breaker ──
  // A. 連續 15 筆失敗 → abort (網路死/API key 掛掉的徵兆)
  // B. 跑滿 20 筆後，最近 50 筆失敗率 > 50% → abort
  const CB_CONSECUTIVE_FAIL = 15;
  const CB_WINDOW_SIZE = 50;
  const CB_WINDOW_FAIL_RATE = 0.5;
  const CB_MIN_SAMPLES = 20;
  let consecutiveFails = 0;
  const recentResults: boolean[] = []; // true = success/empty (count as not-failure), false = error

  for (let i = 0; i < todo.length; i++) {
    const flight = todo[i]!;
    const pct = (
      ((doneInTargets + i + 1) / targets.length) *
      100
    ).toFixed(1);
    process.stdout.write(
      `[${doneInTargets + i + 1}/${targets.length}] ${pct}% ${flight.callsign || flight.flight} (${flight.fr24_id}) ... `,
    );

    let thisRequestFailed = false;
    try {
      const raw = await fetchTrack(flight.fr24_id);

      // 第一筆成功時 log 完整回傳結構
      if (!firstLogged && raw) {
        console.log("\n\n=== 首筆 API 回傳結構 ===");
        console.log(JSON.stringify(raw, null, 2).slice(0, 2000));
        console.log("=== END ===\n");
        firstLogged = true;
      }

      const points = parseTrackPoints(raw);

      if (points && points.length >= 2) {
        const output: FlightOutput = {
          fr24_id: flight.fr24_id,
          callsign: flight.callsign || flight.flight || "",
          registration: flight.reg || "",
          aircraft_type: flight.type || "",
          origin_icao: flight.orig_icao || "",
          origin_iata: "",
          dest_icao: flight.dest_icao || "",
          dest_iata: "",
          dep_time: isoToUnix(flight.datetime_takeoff),
          arr_time: isoToUnix(flight.datetime_landed),
          status: flight.flight_ended ? "landed" : "active",
          trail_points: points.length,
          path: reducePrecision(points),
          flight_number: flight.flight || "",
          operating_as: flight.operating_as || "",
          painted_as: flight.painted_as || "",
          hex: flight.hex || "",
          dest_icao_actual: flight.dest_icao_actual || "",
          first_seen: isoToUnix(flight.first_seen),
          last_seen: isoToUnix(flight.last_seen),
        };

        // 順序：raw 備份 → JSONL → markDone
        // 任一步失敗就拋出，done 不會標記 → 下次可重抓
        writeRawBackup(flight.fr24_id, raw, flight.datetime_takeoff, points[0]?.[3]);
        writeFlightToJsonl(output);
        markDone(flight.fr24_id);
        progress.done.add(flight.fr24_id);
        successCount++;
        console.log(`✅ ${points.length} 點`);
      } else {
        markFailed(flight.fr24_id);
        progress.failed.add(flight.fr24_id);
        emptyCount++;
        console.log("⚪ 無軌跡");
      }
    } catch (err) {
      markFailed(flight.fr24_id);
      progress.failed.add(flight.fr24_id);
      failCount++;
      thisRequestFailed = true;
      console.log(`❌ ${(err as Error).message}`);
    }

    // ── Circuit breaker check ──
    if (thisRequestFailed) consecutiveFails++;
    else consecutiveFails = 0;

    recentResults.push(!thisRequestFailed);
    if (recentResults.length > CB_WINDOW_SIZE) recentResults.shift();

    if (consecutiveFails >= CB_CONSECUTIVE_FAIL) {
      console.error(
        `\n🛑 CIRCUIT BREAKER: 連續 ${consecutiveFails} 筆失敗，疑似系統性異常（網路斷/API token 失效）`,
      );
      console.error(`   已停止以避免浪費 credits。請排查後重跑。`);
      break;
    }
    if (recentResults.length >= CB_MIN_SAMPLES) {
      const fails = recentResults.filter((r) => !r).length;
      const rate = fails / recentResults.length;
      if (recentResults.length >= CB_WINDOW_SIZE && rate > CB_WINDOW_FAIL_RATE) {
        console.error(
          `\n🛑 CIRCUIT BREAKER: 最近 ${recentResults.length} 筆失敗率 ${(rate * 100).toFixed(0)}% > 50%`,
        );
        console.error(`   已停止以避免浪費 credits。請排查後重跑。`);
        break;
      }
    }

    await sleep(DELAY_MS);
  }

  // ── 統計 ──
  console.log("\n=== 統計 ===\n");
  console.log(`成功取得軌跡: ${successCount} 筆（本次）`);
  console.log(`無軌跡資料:   ${emptyCount} 筆`);
  console.log(`失敗:         ${failCount} 筆`);
  console.log(`累計 done:    ${progress.done.size} 筆`);
  console.log(`累計 failed:  ${progress.failed.size} 筆`);
  console.log(`API 請求次數: ${totalRequests}`);
  const attempted = successCount + emptyCount + failCount;
  console.log(
    `本次估用 credits: ~${(attempted * CREDITS_PER_TRACK).toLocaleString()}（${attempted} 筆 × ${CREDITS_PER_TRACK}）`,
  );
  writeSessionLog("done");
  if (attempted > 0) console.log(`📒 已記入 ${SESSIONS_NDJSON}`);
}

main().catch((err) => {
  console.error("\n致命錯誤:", err);
  process.exit(1);
});
