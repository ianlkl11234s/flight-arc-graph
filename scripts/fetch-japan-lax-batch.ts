/**
 * 批次收集：台北(桃園/松山) ↔ 東京羽田/成田・福岡・洛杉磯（來回）
 *
 * 隔離設計：所有輸出寫進 public/tracks/batches/<BATCH>/，每筆記錄打上
 *   batch / collected_at 欄位，progress 檔獨立，完全不碰既有 2/18 批次與全域進度檔。
 *
 * 三步合一（用 --mode 控制）：
 *   summary : flight-summary/light 抓 RCTP+RCSS 客運班清單 → batch/flight-list.json
 *   tracks  : 依清單篩出目標航線，逐班抓 flight-tracks → batch/regions/{TW,JP,US}.jsonl
 *   probe   : 只抓一個小窗口的 summary，印出航線/航司/機型密度與花費推估（不抓 tracks）
 *
 * 使用：
 *   npx tsx scripts/fetch-japan-lax-batch.ts --mode probe
 *   npx tsx scripts/fetch-japan-lax-batch.ts --mode summary
 *   npx tsx scripts/fetch-japan-lax-batch.ts --mode tracks
 *   （加 --dry-run 只算數量不打 tracks API）
 *
 * 計費（官方）：summary light 歷史 ≤30天 = 2 credits/班；flight-tracks = 40 credits/班。
 */

import dotenv from "dotenv";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
dotenv.config();

// ── 設定 ──────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const BATCH = "2026-06_jp-lax";
const API_BASE = "https://fr24api.flightradar24.com/api";
const PAGE_SIZE = 300; // Essential 上限
const DELAY_MS = 2100; // ~28 req/min，安全低於 30/min
const MAX_RETRIES = 5;

// 台灣端機場（兩端任一個是台灣 → 來回都涵蓋）
const TW_AIRPORTS = ["RCTP", "RCSS"];
// 目標境外機場（飛這幾個的才要）：羽田/成田/福岡/洛杉磯
const TARGET_FOREIGN = new Set(["RJTT", "RJAA", "RJFF", "KLAX"]);

// 收集區間（UTC）。flight-summary 單次上限 14 天 → 拆兩段。
const WINDOWS: [string, string][] = [
  ["2026-05-27T00:00:00Z", "2026-06-03T00:00:00Z"],
  ["2026-06-03T00:00:00Z", "2026-06-10T23:59:59Z"],
];
// probe 用的小窗口
const PROBE_WINDOW: [string, string] = ["2026-06-08T00:00:00Z", "2026-06-10T00:00:00Z"];

const BATCH_DIR = resolve(ROOT, "public/tracks/batches", BATCH);
const REGIONS_DIR = join(BATCH_DIR, "regions");
const FLIGHT_LIST = join(BATCH_DIR, "flight-list.json");
const DONE_NDJSON = join(BATCH_DIR, "track-done.ndjson");
const FAILED_NDJSON = join(BATCH_DIR, "track-failed.ndjson");

// ── 型別 ──────────────────────────────────────────────
interface Summary {
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
  [k: string]: unknown;
}

// ── 工具 ──────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoToUnix = (iso: string) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : 0);

function regionOf(icao: string): string {
  if (icao.startsWith("RC")) return "TW";
  if (icao.startsWith("RJ") || icao.startsWith("RO")) return "JP";
  if (icao.startsWith("K")) return "US";
  return "other";
}

/** 把任意 summary 欄位正規化（light 用 orig_icao/dest_icao，full 用 origin_icao/destination_icao） */
function normSummary(o: Record<string, unknown>): Summary {
  const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  return {
    fr24_id: s(o.fr24_id),
    flight: s(o.flight),
    callsign: s(o.callsign),
    operating_as: s(o.operating_as ?? o.operated_as),
    painted_as: s(o.painted_as),
    type: s(o.type),
    reg: s(o.reg),
    orig_icao: s(o.orig_icao ?? o.origin_icao),
    dest_icao: s(o.dest_icao ?? o.destination_icao),
    dest_icao_actual: s(o.dest_icao_actual ?? o.destination_icao_actual),
    datetime_takeoff: s(o.datetime_takeoff),
    datetime_landed: s(o.datetime_landed),
    hex: s(o.hex),
    first_seen: s(o.first_seen),
    last_seen: s(o.last_seen),
    flight_ended: Boolean(o.flight_ended),
  };
}

function isTarget(f: Summary): boolean {
  return TARGET_FOREIGN.has(f.orig_icao) || TARGET_FOREIGN.has(f.dest_icao);
}

// ── flight-summary/light ──────────────────────────────
let summaryReq = 0;
async function fetchSummaryPage(airport: string, from: string, to: string): Promise<Summary[]> {
  const token = process.env.FR24_API_TOKEN;
  if (!token) throw new Error("FR24_API_TOKEN not found in .env");
  const params = new URLSearchParams({
    flight_datetime_from: from,
    flight_datetime_to: to,
    "airports[]": `both:${airport}`,
    categories: "P", // 只要客運，排除貨機/GA/軍機
    limit: String(PAGE_SIZE),
    sort: "asc",
  });
  const url = `${API_BASE}/flight-summary/light?${params}`;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "Accept-Version": "v1" },
    });
    summaryReq++;
    if (res.ok) {
      const json = await res.json();
      const arr = Array.isArray(json) ? json : (json.data ?? []);
      return arr.map((o: Record<string, unknown>) => normSummary(o));
    }
    if (res.status === 429) {
      const w = Math.min(15 * 2 ** (attempt - 1), 120);
      process.stdout.write(`\n  ⏳ 429, wait ${w}s (${attempt}/${MAX_RETRIES})... `);
      await sleep(w * 1000);
      continue;
    }
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  throw new Error(`rate limit: ${MAX_RETRIES} retries failed`);
}

async function fetchAirportWindow(airport: string, from: string, to: string): Promise<Summary[]> {
  const out: Summary[] = [];
  let cursor = from;
  let page = 1;
  while (true) {
    const res = await fetchSummaryPage(airport, cursor, to);
    out.push(...res);
    process.stdout.write(`[p${page}:${res.length}] `);
    if (res.length < PAGE_SIZE) break;
    const last = res[res.length - 1]!;
    const lastTime = last.datetime_takeoff || last.first_seen;
    if (!lastTime || lastTime <= cursor) break;
    cursor = lastTime;
    if (cursor >= to) break;
    page++;
    await sleep(DELAY_MS);
  }
  return out;
}

// ── flight-tracks ─────────────────────────────────────
let trackReq = 0;
async function fetchTrack(fr24Id: string): Promise<unknown> {
  const token = process.env.FR24_API_TOKEN;
  if (!token) throw new Error("FR24_API_TOKEN not found in .env");
  const url = `${API_BASE}/flight-tracks?flight_id=${fr24Id}`;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "Accept-Version": "v1" },
    });
    trackReq++;
    if (res.ok) return await res.json();
    if (res.status === 429) {
      const w = Math.min(15 * 2 ** (attempt - 1), 120);
      process.stdout.write(`\n  ⏳ 429, wait ${w}s (${attempt}/${MAX_RETRIES})... `);
      await sleep(w * 1000);
      continue;
    }
    if (res.status === 404) return null;
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  throw new Error(`rate limit: ${MAX_RETRIES} retries failed`);
}

function parseTrackPoints(raw: unknown): [number, number, number, number][] | null {
  if (!raw || typeof raw !== "object") return null;
  const data = (raw as Record<string, unknown>).data ?? raw;
  let tracks: unknown[] = [];
  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown> | undefined;
    tracks = first?.tracks && Array.isArray(first.tracks) ? first.tracks : data;
  } else if (typeof data === "object" && data !== null && "tracks" in data) {
    tracks = (data as Record<string, unknown>).tracks as unknown[];
  }
  if (tracks.length === 0) return null;
  const pts: [number, number, number, number][] = [];
  for (const pt of tracks) {
    if (!pt || typeof pt !== "object") continue;
    const p = pt as Record<string, unknown>;
    const lat = Number(p.lat ?? p.latitude ?? 0);
    const lng = Number(p.lng ?? p.lon ?? p.longitude ?? 0);
    const alt = Number(p.alt ?? p.altitude ?? p.alt_baro ?? p.altitude_m ?? 0);
    const ts = Number(
      p.timestamp ? (typeof p.timestamp === "string" ? isoToUnix(p.timestamp) : p.timestamp) : (p.ts ?? 0),
    );
    if (lat !== 0 && lng !== 0 && ts !== 0) {
      const altM = alt > 1000 ? Math.round(alt * 0.3048) : alt;
      pts.push([+lat.toFixed(4), +lng.toFixed(4), altM, ts]);
    }
  }
  return pts.length > 0 ? pts : null;
}

// ── 進度（batch 獨立）─────────────────────────────────
function loadDoneFailed(): { done: Set<string>; failed: Set<string> } {
  const done = new Set<string>();
  const failed = new Set<string>();
  for (const [fp, set] of [[DONE_NDJSON, done], [FAILED_NDJSON, failed]] as const) {
    if (existsSync(fp)) for (const l of readFileSync(fp, "utf-8").split("\n")) {
      const id = l.trim();
      if (id) set.add(id);
    }
  }
  return { done, failed };
}

function writeFlightRegions(out: Record<string, unknown>, origIcao: string, destIcao: string) {
  if (!existsSync(REGIONS_DIR)) mkdirSync(REGIONS_DIR, { recursive: true });
  const line = JSON.stringify(out) + "\n";
  const regions = new Set([regionOf(origIcao), regionOf(destIcao)]);
  for (const r of regions) appendFileSync(join(REGIONS_DIR, `${r}.jsonl`), line);
}

// ── 統計輔助 ──────────────────────────────────────────
function breakdown(flights: Summary[]) {
  const routeKey = (f: Summary) => {
    const tw = TW_AIRPORTS.includes(f.orig_icao) ? f.orig_icao : f.dest_icao;
    const fr = TARGET_FOREIGN.has(f.orig_icao) ? f.orig_icao : f.dest_icao;
    return `${tw}↔${fr}`;
  };
  const byRoute = new Map<string, number>();
  const byAirline = new Map<string, number>();
  const byType = new Map<string, number>();
  const byRouteAirlineType = new Map<string, number>();
  for (const f of flights) {
    byRoute.set(routeKey(f), (byRoute.get(routeKey(f)) ?? 0) + 1);
    byAirline.set(f.operating_as || "?", (byAirline.get(f.operating_as || "?") ?? 0) + 1);
    byType.set(f.type || "?", (byType.get(f.type || "?") ?? 0) + 1);
    const k = `${routeKey(f)} | ${f.operating_as || "?"} | ${f.type || "?"}`;
    byRouteAirlineType.set(k, (byRouteAirlineType.get(k) ?? 0) + 1);
  }
  const fmt = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${k.padEnd(28)} ${v}`).join("\n");
  console.log("\n── 依航線 ──\n" + fmt(byRoute));
  console.log("\n── 依航司(operating_as) ──\n" + fmt(byAirline));
  console.log("\n── 依機型 ──\n" + fmt(byType));
  console.log("\n── 航線 × 航司 × 機型 ──\n" + fmt(byRouteAirlineType));
}

// ── 主程式 ────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const mode = (() => {
    const i = argv.indexOf("--mode");
    return i !== -1 ? argv[i + 1] : "probe";
  })();
  const dryRun = argv.includes("--dry-run");
  if (!existsSync(BATCH_DIR)) mkdirSync(BATCH_DIR, { recursive: true });

  console.log(`=== FR24 批次 ${BATCH} | mode=${mode} ===`);
  console.log(`台灣端: ${TW_AIRPORTS.join(", ")} | 目標境外: ${[...TARGET_FOREIGN].join(", ")}\n`);

  if (mode === "probe") {
    const [from, to] = PROBE_WINDOW;
    console.log(`探針窗口: ${from} ~ ${to}（${TW_AIRPORTS.join("+")}, categories=P）\n`);
    const all: Summary[] = [];
    for (const ap of TW_AIRPORTS) {
      process.stdout.write(`${ap} `);
      all.push(...(await fetchAirportWindow(ap, from, to)));
      console.log();
      await sleep(DELAY_MS);
    }
    // dedupe by fr24_id
    const uniq = new Map(all.map((f) => [f.fr24_id, f]));
    const targets = [...uniq.values()].filter(isTarget);
    const probeDays = (new Date(to).getTime() - new Date(from).getTime()) / 864e5;
    console.log(`\n探針結果：台灣端客運班 ${uniq.size} 筆 → 目標航線 ${targets.length} 筆（${probeDays} 天）`);
    breakdown(targets);
    const perDay = targets.length / probeDays;
    const full = Math.round(perDay * 14);
    console.log("\n=== 全量 14 天推估 ===");
    console.log(`  目標航班/日 ≈ ${perDay.toFixed(1)} → 14 天 ≈ ${full} 班`);
    console.log(`  summary recon 已花(探針): ${summaryReq} 次請求, ~${uniq.size * 2} credits`);
    console.log(`  全量 summary 推估: 台灣端客運 ~${Math.round((uniq.size / probeDays) * 14)} 班 × 2 ≈ ~${Math.round((uniq.size / probeDays) * 14 * 2)} credits`);
    console.log(`  全量 tracks 推估: ${full} 班 × 40 ≈ ~${full * 40} credits`);
    console.log(`  >>> 合計推估 ≈ ~${Math.round((uniq.size / probeDays) * 14 * 2) + full * 40} credits`);
    return;
  }

  if (mode === "summary") {
    const all: Summary[] = [];
    for (const [from, to] of WINDOWS) {
      console.log(`窗口 ${from} ~ ${to}`);
      for (const ap of TW_AIRPORTS) {
        process.stdout.write(`  ${ap} `);
        all.push(...(await fetchAirportWindow(ap, from, to)));
        console.log();
        await sleep(DELAY_MS);
      }
    }
    const uniq = new Map(all.map((f) => [f.fr24_id, f]));
    const flights = [...uniq.values()];
    writeFileSync(FLIGHT_LIST, JSON.stringify({ batch: BATCH, updated_at: new Date().toISOString(), flights }, null, 2));
    const targets = flights.filter(isTarget);
    console.log(`\n台灣端客運班(去重) ${flights.length} 筆 → flight-list.json`);
    console.log(`其中目標航線 ${targets.length} 筆`);
    breakdown(targets);
    console.log(`\nsummary 請求次數: ${summaryReq}（~${flights.length * 2} credits）`);
    console.log(`下一步: --mode tracks（將抓 ${targets.length} 班軌跡 ≈ ${targets.length * 40} credits）`);
    return;
  }

  if (mode === "tracks") {
    if (!existsSync(FLIGHT_LIST)) {
      console.error(`❌ 找不到 ${FLIGHT_LIST}，請先跑 --mode summary`);
      process.exit(1);
    }
    const flights: Summary[] = JSON.parse(readFileSync(FLIGHT_LIST, "utf-8")).flights;
    const targets = flights.filter(isTarget);
    const { done, failed } = loadDoneFailed();
    const todo = targets.filter((f) => !done.has(f.fr24_id) && !failed.has(f.fr24_id));
    console.log(`目標航線 ${targets.length} 筆 | 已完成 ${done.size} | 失敗 ${failed.size} | 待處理 ${todo.length}`);
    console.log(`預估花費: ${todo.length} × 40 ≈ ${todo.length * 40} credits\n`);
    if (dryRun) {
      console.log("🧪 --dry-run，結束。");
      breakdown(targets);
      return;
    }
    const collectedAt = Math.floor(new Date().getTime() / 1000);
    let ok = 0, empty = 0, fail = 0, consec = 0;
    for (let i = 0; i < todo.length; i++) {
      const f = todo[i]!;
      process.stdout.write(`[${i + 1}/${todo.length}] ${f.callsign || f.flight} (${f.fr24_id}) ... `);
      try {
        const raw = await fetchTrack(f.fr24_id);
        const pts = parseTrackPoints(raw);
        if (pts && pts.length >= 2) {
          const out = {
            fr24_id: f.fr24_id,
            callsign: f.callsign || f.flight || "",
            registration: f.reg || "",
            aircraft_type: f.type || "",
            origin_icao: f.orig_icao || "",
            origin_iata: "",
            dest_icao: f.dest_icao || "",
            dest_iata: "",
            dep_time: isoToUnix(f.datetime_takeoff),
            arr_time: isoToUnix(f.datetime_landed),
            status: f.flight_ended ? "landed" : "active",
            trail_points: pts.length,
            path: pts,
            flight_number: f.flight || "",
            operating_as: f.operating_as || "",
            painted_as: f.painted_as || "",
            hex: f.hex || "",
            dest_icao_actual: f.dest_icao_actual || "",
            first_seen: isoToUnix(f.first_seen),
            last_seen: isoToUnix(f.last_seen),
            batch: BATCH,
            collected_at: collectedAt,
          };
          writeFlightRegions(out, out.origin_icao, out.dest_icao);
          appendFileSync(DONE_NDJSON, `${f.fr24_id}\n`);
          ok++; consec = 0;
          console.log(`✅ ${pts.length} 點`);
        } else {
          appendFileSync(FAILED_NDJSON, `${f.fr24_id}\n`);
          empty++; consec = 0;
          console.log("⚪ 無軌跡");
        }
      } catch (err) {
        appendFileSync(FAILED_NDJSON, `${f.fr24_id}\n`);
        fail++; consec++;
        console.log(`❌ ${(err as Error).message}`);
        if (consec >= 15) {
          console.error("\n🛑 連續 15 筆失敗，中止以省 credits。排查後重跑即可續接。");
          break;
        }
      }
      await sleep(DELAY_MS);
    }
    console.log(`\n=== 完成 ===\n成功 ${ok} | 無軌跡 ${empty} | 失敗 ${fail} | tracks 請求 ${trackReq}`);
    console.log(`輸出: ${REGIONS_DIR}/{TW,JP,US}.jsonl`);
    return;
  }

  console.error(`未知 mode: ${mode}（用 probe|summary|tracks）`);
  process.exit(1);
}

main().catch((e) => {
  console.error("\n致命錯誤:", e);
  process.exit(1);
});
