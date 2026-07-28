/**
 * refetch-retry-broken.ts — 一次性修復：向 FR24 重抓「舊版 retry-failed-tracks.ts 寫壞」的軌跡
 *
 * 背景：
 *   舊版 retry-failed-tracks.ts 把 path 點寫成 `[lat, lon, alt(生英呎), gspeed]`——
 *   第 4 欄放的是「地速」不是 unix timestamp。高度已由 scripts/oneoff/migrate-alt-units.ts
 *   反解為公尺，但**時間戳無法從存量資料回復**（原始 ts 根本沒被寫進來），
 *   唯一修法是拿 fr24_id 向 FR24 flight-tracks 重抓一次。
 *
 *   識別方式（與 migrate-alt-units.ts 同一條判別式）：
 *     一筆記錄的 path 非空，且**所有**點的第 4 欄 max < 1e9（unix ts 下限，2001 年）→ 壞記錄。
 *   同一個 fr24_id 通常在 origin + dest 兩個機場檔各有一份壞副本，兩份都要補寫。
 *
 * 修法：
 *   重抓成功 → 取「舊記錄」為底，只替換 `path` 與 `trail_points` 兩個欄位，
 *   append 一行到每個有壞副本的機場檔。split-tracks.ts 的 dedupe 是
 *   「後寫的覆蓋前寫的」（scripts/split-tracks.ts:228），所以舊壞記錄會被自然汰換。
 *   ⚠️ 跑完務必執行 `npx tsx scripts/split-tracks.ts` 才會生效。
 *
 * Usage:
 *   npx tsx scripts/oneoff/refetch-retry-broken.ts --dry-run          # 只掃描統計，不打 API
 *   npx tsx scripts/oneoff/refetch-retry-broken.ts --max-credits 5000 # 實跑，本次上限 ~5000 credits
 *   npx tsx scripts/oneoff/refetch-retry-broken.ts --limit 10         # 實跑，最多 10 班
 *   npx tsx scripts/oneoff/refetch-retry-broken.ts --limit 50 --retry-failed  # 連上次無資料的也重試
 *
 *   ⚠️ 安全網（仿 fetch-tracks.ts）：沒帶 --limit / --max-credits / --dry-run 任一
 *      → 自動進 dry-run，不會手滑噴 credit。
 *
 * 可續跑：每成功一班 append fr24_id 到 scripts/refetch-broken-done.ndjson；
 *         API 回無資料（404 / 空 tracks）記到 scripts/refetch-broken-failed.ndjson。
 *         重跑自動跳過兩者（failed 可用 --retry-failed 重試）。
 *         網路/HTTP 異常「不」寫進 failed（不永久黑名單），下次自然重試。
 */

import dotenv from "dotenv";
import {
  appendFileSync,
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
} from "fs";
import { createInterface } from "readline";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

dotenv.config();

// ── 設定 ──────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const AIRPORTS_DIR = resolve(ROOT, "public/tracks/airports");
const DONE_NDJSON = resolve(ROOT, "scripts/refetch-broken-done.ndjson");
const FAILED_NDJSON = resolve(ROOT, "scripts/refetch-broken-failed.ndjson");
const SESSIONS_NDJSON = resolve(ROOT, "scripts/fetch-sessions.ndjson");

const API_BASE = "https://fr24api.flightradar24.com/api";
const DELAY_MS = 2050; // 2.05s → ~29 req/min，接近 Essential 30 req/min 上限
const RATE_LIMIT_RETRIES = 5; // 429 最多退避幾次
const NETWORK_RETRIES = 3; // fetch 拋例外（斷線/DNS）最多重試幾次
const CREDITS_PER_TRACK = 40; // flight-tracks 每筆約 40 credits
const TS_FLOOR = 1e9; // unix timestamp 下限（2001 年）
const PROGRESS_EVERY = 25; // 每 N 班印一行進度
const CB_CONSECUTIVE_FAIL = 15; // circuit breaker：連續 N 筆網路/HTTP 異常就停

const SESSION_LABEL = "refetch-retry-broken";

// ── 型別 ──────────────────────────────────────────────

type TrackPoint = [number, number, number, number];

/** airports/*.jsonl 一行的形狀（只列本腳本會碰的欄位，其餘原樣保留） */
interface FlightRecord {
  fr24_id?: unknown;
  path?: unknown;
  trail_points?: unknown;
  [key: string]: unknown;
}

interface BrokenEntry {
  fr24_id: string;
  /** 有壞副本的機場檔（ICAO），成功後每個都要 append 一份 */
  icaos: string[];
  /** 舊記錄（path 已清空，key 順序保留），成功後只覆寫 path / trail_points */
  base: FlightRecord;
  /** 原壞 path 的點數（僅供報表） */
  brokenPoints: number;
}

interface ScanResult {
  entries: Map<string, BrokenEntry>;
  perFile: Map<string, number>;
  filesScanned: number;
  totalRecords: number;
  brokenCopies: number;
  badLines: number;
  noValidTsColumn: number;
}

// ── 工具 ──────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isoToUnix(s: unknown): number {
  if (typeof s !== "string" || !s) return 0;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

/** 4 位小數 + 整數高度（與 fetch-tracks.ts reducePrecision 一致，寫的是同一批 JSONL） */
function reducePrecision(points: TrackPoint[]): TrackPoint[] {
  return points.map(
    ([lat, lon, alt, ts]) =>
      [+lat.toFixed(4), +lon.toFixed(4), Math.round(alt), ts] as TrackPoint,
  );
}

// ── 壞記錄判別 ────────────────────────────────────────

type PathVerdict = "ok" | "broken" | "empty" | "no-ts-column";

/**
 * path 全部點的第 4 欄 max < 1e9 → 那是 gspeed 不是 unix ts（舊 retry 格式）。
 * 完全取不到第 4 欄的（理論上不存在）另外歸類，不進重抓清單，只計數。
 */
function classifyPath(path: unknown): PathVerdict {
  if (!Array.isArray(path) || path.length === 0) return "empty";
  let max = -Infinity;
  for (const p of path) {
    if (!Array.isArray(p) || p.length < 4) continue;
    const t = Number(p[3]);
    if (Number.isFinite(t) && t > max) max = t;
  }
  if (max === -Infinity) return "no-ts-column";
  return max < TS_FLOOR ? "broken" : "ok";
}

// ── 掃描 ──────────────────────────────────────────────

async function scanAll(): Promise<ScanResult> {
  if (!existsSync(AIRPORTS_DIR)) {
    console.error(`❌ 找不到 ${AIRPORTS_DIR}`);
    process.exit(1);
  }
  const files = readdirSync(AIRPORTS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();

  const entries = new Map<string, BrokenEntry>();
  const perFile = new Map<string, number>();
  let totalRecords = 0;
  let brokenCopies = 0;
  let badLines = 0;
  let noValidTsColumn = 0;

  const t0 = Date.now();
  console.log(`🔍 掃描 ${fmt(files.length)} 個機場檔（streaming，2.2GB 約 15-30 秒）...`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const icao = file.slice(0, -".jsonl".length);
    const rl = createInterface({
      input: createReadStream(join(AIRPORTS_DIR, file), "utf-8"),
      crlfDelay: Infinity,
    });

    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;
      totalRecords++;

      let rec: FlightRecord;
      try {
        rec = JSON.parse(line) as FlightRecord;
      } catch {
        badLines++;
        continue;
      }

      const verdict = classifyPath(rec.path);
      if (verdict === "no-ts-column") noValidTsColumn++;
      if (verdict !== "broken") continue;

      const id = typeof rec.fr24_id === "string" ? rec.fr24_id : "";
      if (!id) {
        badLines++;
        continue;
      }

      brokenCopies++;
      perFile.set(icao, (perFile.get(icao) ?? 0) + 1);

      const existing = entries.get(id);
      if (existing) {
        if (!existing.icaos.includes(icao)) existing.icaos.push(icao);
        continue;
      }
      const pointCount = Array.isArray(rec.path) ? rec.path.length : 0;
      rec.path = []; // 清空以釋放記憶體，同時保留 key 在物件裡的順序
      entries.set(id, {
        fr24_id: id,
        icaos: [icao],
        base: rec,
        brokenPoints: pointCount,
      });
    }

    if ((i + 1) % 250 === 0 || i === files.length - 1) {
      const sec = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(
        `   ${i + 1}/${files.length} 檔 · 壞副本 ${fmt(brokenCopies)} · 不重複 ${fmt(entries.size)} · ${sec}s`,
      );
    }
  }

  return {
    entries,
    perFile,
    filesScanned: files.length,
    totalRecords,
    brokenCopies,
    badLines,
    noValidTsColumn,
  };
}

// ── 進度檔（NDJSON append-only）───────────────────────

function loadIdSet(path: string): Set<string> {
  const set = new Set<string>();
  if (!existsSync(path)) return set;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const id = line.trim();
    if (id) set.add(id);
  }
  return set;
}

// ── API 呼叫 ──────────────────────────────────────────

let totalRequests = 0;

/** 402 / 餘額不足 —— 立即停止整個 run，不重試 */
class CreditExhaustedError extends Error {}

type FetchResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: "404" | "network" | "http"; detail?: string };

async function fetchTrack(fr24Id: string, token: string): Promise<FetchResult> {
  const url = `${API_BASE}/flight-tracks?flight_id=${fr24Id}`;
  let rateAttempt = 0;
  let netAttempt = 0;

  for (;;) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Accept-Version": "v1",
        },
      });
      totalRequests++;

      if (res.ok) return { ok: true, data: await res.json() };
      if (res.status === 404) return { ok: false, reason: "404" };

      if (res.status === 429) {
        // 429 可能是「每分鐘請求上限」也可能是「額度用盡」，靠 body 分辨
        // （只認 credit/insufficient/balance —— "rate limit exceeded" 不能誤判成沒錢）
        const body = await res.text();
        if (/credit|insufficient|balance/i.test(body)) {
          throw new CreditExhaustedError(`HTTP 429: ${body.slice(0, 200)}`);
        }
        rateAttempt++;
        if (rateAttempt > RATE_LIMIT_RETRIES) {
          return { ok: false, reason: "http", detail: "429 退避 5 次後仍被限流" };
        }
        const wait = Math.min(15 * Math.pow(2, rateAttempt - 1), 120);
        console.log(`    ⏳ 429 rate limit，等待 ${wait}s (${rateAttempt}/${RATE_LIMIT_RETRIES})`);
        await sleep(wait * 1000);
        continue;
      }

      const body = await res.text();
      if (
        res.status === 402 ||
        (res.status === 403 && /credit|quota|insufficient|balance/i.test(body))
      ) {
        throw new CreditExhaustedError(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return { ok: false, reason: "http", detail: `${res.status} ${body.slice(0, 120)}` };
    } catch (err) {
      if (err instanceof CreditExhaustedError) throw err;
      netAttempt++;
      const msg = (err as Error).message;
      if (netAttempt >= NETWORK_RETRIES) {
        return { ok: false, reason: "network", detail: msg };
      }
      const wait = 5 * Math.pow(2, netAttempt - 1); // 5, 10s
      console.log(`    🔁 網路錯誤 "${msg}"，等待 ${wait}s (${netAttempt}/${NETWORK_RETRIES})`);
      await sleep(wait * 1000);
    }
  }
}

// ── 軌跡解析（與 fetch-tracks.ts / retry-failed-tracks.ts 同一份契約）──

/** 輸出 [lat, lon, alt(公尺), unix_ts]；FR24 的 alt 一律英呎，無條件 ×0.3048 */
function parseTrackPoints(raw: unknown): TrackPoint[] | null {
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
  } else if (typeof data === "object" && data !== null && "tracks" in data) {
    tracks = (data as Record<string, unknown>).tracks as unknown[];
  }

  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const points: TrackPoint[] = [];
  for (const pt of tracks) {
    if (!pt || typeof pt !== "object") continue;
    const p = pt as Record<string, unknown>;

    const lat = Number(p.lat ?? p.latitude ?? 0);
    const lon = Number(p.lng ?? p.lon ?? p.longitude ?? 0);
    const alt = Number(p.alt ?? p.altitude ?? p.alt_baro ?? p.altitude_m ?? 0);
    const ts = Number(
      p.timestamp
        ? typeof p.timestamp === "string"
          ? isoToUnix(p.timestamp)
          : p.timestamp
        : p.ts ?? 0,
    );

    if (lat === 0 || lon === 0 || ts === 0) continue;
    points.push([lat, lon, Math.round(alt * 0.3048), ts]);
  }

  return points.length > 0 ? points : null;
}

// ── 寫回 ──────────────────────────────────────────────

/**
 * 取舊記錄為底，只替換 path / trail_points，append 到每個有壞副本的機場檔。
 * split-tracks.ts dedupe「後寫覆蓋前寫」→ 舊壞記錄自然被汰換。
 */
function writeFixedRecord(entry: BrokenEntry, points: TrackPoint[]): number {
  const out: FlightRecord = { ...entry.base };
  out.path = reducePrecision(points);
  out.trail_points = points.length;
  const line = JSON.stringify(out) + "\n";
  for (const icao of entry.icaos) {
    appendFileSync(join(AIRPORTS_DIR, `${icao}.jsonl`), line);
  }
  return entry.icaos.length;
}

// ── dry-run 報表 ──────────────────────────────────────

function printDryRun(
  scan: ScanResult,
  todo: BrokenEntry[],
  skippedDone: number,
  skippedFailed: number,
  effectiveLimit: number | null,
  autoDryRun: boolean,
) {
  if (autoDryRun) {
    console.log(
      "\n⚠️  未帶 --max-credits / --limit / --dry-run，自動進 dry-run（不打 API）。",
    );
    console.log("    確認後加 --max-credits N 實跑（N = 本次額度上限）。");
  }

  console.log("\n=== 🧪 dry-run 統計 ===\n");
  console.log(`掃描檔案:       ${fmt(scan.filesScanned)} 個 .jsonl`);
  console.log(`掃描記錄:       ${fmt(scan.totalRecords)} 行`);
  console.log(`壞副本數:       ${fmt(scan.brokenCopies)} 份（同一班在 dep/dest 各一份）`);
  console.log(`不重複航班數:   ${fmt(scan.entries.size)} 班`);
  if (scan.badLines > 0) console.log(`⚠️ 壞行/無 id:  ${fmt(scan.badLines)}`);
  if (scan.noValidTsColumn > 0)
    console.log(`⚠️ path 無第 4 欄: ${fmt(scan.noValidTsColumn)}（不列入重抓）`);

  console.log(
    `\n全量重抓成本:   ~${fmt(scan.entries.size * CREDITS_PER_TRACK)} credits` +
      `（${fmt(scan.entries.size)} 班 × ${CREDITS_PER_TRACK}）`,
  );
  console.log(`已完成（跳過）: ${fmt(skippedDone)} 班`);
  console.log(`已知無資料:     ${fmt(skippedFailed)} 班（--retry-failed 可重試）`);
  console.log(
    `本次待抓:       ${fmt(todo.length)} 班` +
      `（~${fmt(todo.length * CREDITS_PER_TRACK)} credits）`,
  );
  if (effectiveLimit !== null && todo.length > effectiveLimit) {
    console.log(
      `上限截斷後:     ${fmt(effectiveLimit)} 班` +
        `（~${fmt(effectiveLimit * CREDITS_PER_TRACK)} credits）`,
    );
  }
  const estMin = (todo.length * DELAY_MS) / 1000 / 60;
  console.log(`預估耗時:       ~${estMin.toFixed(0)} 分鐘（間隔 ${DELAY_MS}ms）`);

  const top = [...scan.perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`\nTop 10 檔案分佈（壞副本數 / 共 ${fmt(scan.perFile.size)} 個檔受影響）：`);
  for (const [icao, n] of top) {
    console.log(`  ${icao.padEnd(6)} ${String(n).padStart(6)}`);
  }

  // 一班有幾份副本的分佈（驗證「dep + dest 各一份」的假設）
  const copiesHist = new Map<number, number>();
  for (const e of scan.entries.values()) {
    copiesHist.set(e.icaos.length, (copiesHist.get(e.icaos.length) ?? 0) + 1);
  }
  console.log("\n每班副本數分佈：");
  for (const k of [...copiesHist.keys()].sort((a, b) => a - b)) {
    console.log(`  ${k} 份檔案: ${fmt(copiesHist.get(k)!)} 班`);
  }

  console.log("\n不打 API，結束。");
}

// ── 主程式 ──────────────────────────────────────────

async function main() {
  console.log("=== Refetch retry-broken tracks（修時間戳）===\n");

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(
      [
        "Usage:",
        "  npx tsx scripts/oneoff/refetch-retry-broken.ts --dry-run",
        "  npx tsx scripts/oneoff/refetch-retry-broken.ts --max-credits N",
        "  npx tsx scripts/oneoff/refetch-retry-broken.ts --limit N [--retry-failed]",
        "",
        "沒帶 --limit / --max-credits / --dry-run 任一 → 自動 dry-run。",
      ].join("\n"),
    );
    return;
  }

  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1] ?? "", 10) : null;
  const maxCreditsIdx = process.argv.indexOf("--max-credits");
  const maxCredits =
    maxCreditsIdx !== -1 ? parseInt(process.argv[maxCreditsIdx + 1] ?? "", 10) : null;
  const retryFailed = process.argv.includes("--retry-failed");

  if (limit !== null && !Number.isFinite(limit)) {
    console.error("❌ --limit 需要數字");
    process.exit(1);
  }
  if (maxCredits !== null && !Number.isFinite(maxCredits)) {
    console.error("❌ --max-credits 需要數字");
    process.exit(1);
  }

  let effectiveLimit = limit;
  if (maxCredits !== null) {
    const creditLimit = Math.floor(maxCredits / CREDITS_PER_TRACK);
    effectiveLimit =
      effectiveLimit === null ? creditLimit : Math.min(effectiveLimit, creditLimit);
  }

  let dryRun = process.argv.includes("--dry-run");
  // 安全網：三個旗標都沒帶 → 自動 dry-run，避免手滑無上限噴 credit
  const autoDryRun = !dryRun && limit === null && maxCredits === null;
  if (autoDryRun) dryRun = true;

  // token 先驗（dry-run 不需要，但實跑前要早點失敗）
  const token = process.env.FR24_API_TOKEN;
  if (!dryRun && !token) {
    console.error("❌ FR24_API_TOKEN not found in .env");
    process.exit(1);
  }

  // ── 1. 掃描 ──
  const scan = await scanAll();
  if (scan.entries.size === 0) {
    console.log("\n✅ 找不到任何壞記錄（path 第 4 欄 max < 1e9），無事可做。");
    return;
  }

  // ── 2. 過濾已完成 / 已知無資料 ──
  const done = loadIdSet(DONE_NDJSON);
  const failed = loadIdSet(FAILED_NDJSON);
  let skippedDone = 0;
  let skippedFailed = 0;
  const todo: BrokenEntry[] = [];
  for (const entry of scan.entries.values()) {
    if (done.has(entry.fr24_id)) {
      skippedDone++;
      continue;
    }
    if (failed.has(entry.fr24_id) && !retryFailed) {
      skippedFailed++;
      continue;
    }
    todo.push(entry);
  }

  if (dryRun) {
    printDryRun(scan, todo, skippedDone, skippedFailed, effectiveLimit, autoDryRun);
    return;
  }

  console.log(
    `\n📂 進度: done=${fmt(done.size)}, failed=${fmt(failed.size)}` +
      `（本次跳過 done ${fmt(skippedDone)} / failed ${fmt(skippedFailed)}）`,
  );

  let batch = todo;
  if (effectiveLimit !== null && batch.length > effectiveLimit) {
    batch = batch.slice(0, effectiveLimit);
    const capLabel =
      maxCredits !== null
        ? `--max-credits ${fmt(maxCredits)}（≈${effectiveLimit} 班）`
        : `--limit ${effectiveLimit}`;
    console.log(`   ${capLabel}: 本次只處理前 ${fmt(batch.length)} 班`);
  }
  if (batch.length === 0) {
    console.log("✅ 沒有待抓的航班。");
    return;
  }
  console.log(
    `\n🚀 開始重抓 ${fmt(batch.length)} 班（~${fmt(batch.length * CREDITS_PER_TRACK)} credits）\n`,
  );

  // ── 3. 抓取 ──
  let okCount = 0;
  let emptyCount = 0;
  let failCount = 0;
  let copiesWritten = 0;
  let processed = 0;
  let consecutiveFails = 0;
  const t0 = Date.now();

  const printProgress = () => {
    const elapsed = (Date.now() - t0) / 1000;
    const rate = processed > 0 ? elapsed / processed : 0;
    const etaMin = ((batch.length - processed) * rate) / 60;
    console.log(
      `[${String(processed).padStart(4)}/${batch.length}] ` +
        `✅${okCount} ⚪${emptyCount} ❌${failCount} · ` +
        `~${fmt(okCount * CREDITS_PER_TRACK)} credits · ` +
        `ETA ${etaMin.toFixed(0)} min`,
    );
  };

  // ── Session 額度帳（收工 / SIGINT / 停機都寫一行）──
  let sessionLogged = false;
  const writeSessionLog = (reason: string) => {
    if (sessionLogged) return;
    sessionLogged = true;
    const attempted = okCount + emptyCount + failCount;
    if (attempted === 0) return;
    appendFileSync(
      SESSIONS_NDJSON,
      JSON.stringify({
        ts: new Date().toISOString(),
        label: SESSION_LABEL,
        date: "retry-broken-fix",
        reason, // done | sigint | credit-exhausted | circuit-breaker
        attempted,
        ok: okCount,
        empty: emptyCount,
        failed: failCount,
        requests: totalRequests,
        credits_est: okCount * CREDITS_PER_TRACK,
        done_total_after: done.size,
      }) + "\n",
    );
  };

  process.on("SIGINT", () => {
    console.log("\n⏸️  收到 SIGINT，寫入 session 帳後結束。");
    printProgress();
    writeSessionLog("sigint");
    process.exit(130);
  });

  let stopReason = "done";

  for (const entry of batch) {
    let result: FetchResult;
    try {
      result = await fetchTrack(entry.fr24_id, token!);
    } catch (err) {
      if (err instanceof CreditExhaustedError) {
        console.error(`\n🛑 額度不足 / 402：${err.message}`);
        stopReason = "credit-exhausted";
        break;
      }
      throw err;
    }

    processed++;
    let hardFail = false;

    if (result.ok) {
      const points = parseTrackPoints(result.data);
      if (points && points.length >= 2) {
        copiesWritten += writeFixedRecord(entry, points);
        appendFileSync(DONE_NDJSON, entry.fr24_id + "\n");
        done.add(entry.fr24_id);
        okCount++;
      } else {
        appendFileSync(FAILED_NDJSON, entry.fr24_id + "\n");
        failed.add(entry.fr24_id);
        emptyCount++;
      }
    } else if (result.reason === "404") {
      appendFileSync(FAILED_NDJSON, entry.fr24_id + "\n");
      failed.add(entry.fr24_id);
      emptyCount++;
    } else {
      // 網路 / HTTP 異常：不寫 failed（不永久黑名單），下次重跑會自然重試
      failCount++;
      hardFail = true;
      console.log(`  ❌ ${entry.fr24_id} ${result.reason}: ${result.detail ?? ""}`);
    }

    consecutiveFails = hardFail ? consecutiveFails + 1 : 0;
    if (consecutiveFails >= CB_CONSECUTIVE_FAIL) {
      console.error(
        `\n🛑 CIRCUIT BREAKER: 連續 ${consecutiveFails} 筆異常（網路斷 / token 失效？），停止以省 credits。`,
      );
      stopReason = "circuit-breaker";
      break;
    }

    if (processed % PROGRESS_EVERY === 0) printProgress();
    await sleep(DELAY_MS);
  }

  // ── 4. 統計 ──
  if (processed % PROGRESS_EVERY !== 0) printProgress();
  console.log("\n=== 統計 ===\n");
  console.log(`成功重抓:       ${fmt(okCount)} 班`);
  console.log(`寫回副本:       ${fmt(copiesWritten)} 份（append 到機場 JSONL）`);
  console.log(`API 無資料:     ${fmt(emptyCount)} 班 → ${FAILED_NDJSON}`);
  console.log(`網路/HTTP 異常: ${fmt(failCount)} 班（未黑名單，下次重跑會重試）`);
  console.log(`API 請求次數:   ${fmt(totalRequests)}`);
  console.log(
    `本次估用 credits: ~${fmt(okCount * CREDITS_PER_TRACK)}（${fmt(okCount)} 班 × ${CREDITS_PER_TRACK}）`,
  );
  console.log(`累計 done:      ${fmt(done.size)} / ${fmt(scan.entries.size)} 班`);
  console.log(`耗時:           ${((Date.now() - t0) / 1000 / 60).toFixed(1)} 分鐘`);

  writeSessionLog(stopReason);
  if (okCount + emptyCount + failCount > 0) console.log(`\n📒 已記入 ${SESSIONS_NDJSON}`);

  const remaining = scan.entries.size - done.size - (retryFailed ? 0 : failed.size);
  if (remaining > 0) {
    console.log(
      `\n🔁 還剩 ~${fmt(remaining)} 班未修（~${fmt(remaining * CREDITS_PER_TRACK)} credits），重跑本腳本即可續接。`,
    );
  }
  console.log(
    "\n⚠️  下一步必做：`npx tsx scripts/split-tracks.ts`\n" +
      "    （dedupe 後寫覆蓋前寫，新記錄才會取代舊壞記錄並重建 region + manifest）",
  );
}

main().catch((err) => {
  console.error("\n致命錯誤:", err);
  process.exit(1);
});
