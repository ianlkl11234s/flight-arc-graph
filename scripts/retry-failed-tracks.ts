/**
 * Retry script for failed fr24_ids from a specific batch.
 * Reads scripts/retry-targets.txt (one fr24_id per line).
 * Adds network-level retry that fetch-tracks.ts lacks.
 *
 * Outcomes:
 *  - 200 OK with tracks → append to airport JSONL, add to track-done.ndjson, remove from track-failed.ndjson
 *  - 404 → keep in track-failed.ndjson (truly missing)
 *  - persistent network failure (3 retries) → keep in track-failed.ndjson
 *
 * Usage:
 *   npx tsx scripts/retry-failed-tracks.ts
 */
import dotenv from "dotenv";
import { readFileSync, appendFileSync, writeFileSync, existsSync } from "fs";

dotenv.config();

const TOKEN = process.env.FR24_API_TOKEN;
if (!TOKEN) throw new Error("FR24_API_TOKEN not found in .env");

const API_BASE = "https://fr24api.flightradar24.com/api";
const FLIGHT_LIST = "scripts/flight-list.json";
const RETRY_TARGETS = "scripts/retry-targets.txt";
const DONE_FILE = "scripts/track-done.ndjson";
const FAILED_FILE = "scripts/track-failed.ndjson";
const AIRPORTS_DIR = "public/tracks/airports";
const DELAY_MS = 2200;
const NETWORK_MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isoToUnix(s: string | undefined): number {
  if (!s) return 0;
  return Math.floor(new Date(s).getTime() / 1000);
}

/** 4 位小數 + 整數高度（與 fetch-tracks.ts reducePrecision 一致，寫的是同一批 JSONL） */
function reducePrecision(
  points: [number, number, number, number][],
): [number, number, number, number][] {
  return points.map(([lat, lon, alt, ts]) => [
    +lat.toFixed(4),
    +lon.toFixed(4),
    Math.round(alt),
    ts,
  ]);
}

/**
 * 解析 flight-tracks 回傳，輸出 [lat, lon, alt(公尺), unix_ts]
 * ——與 fetch-tracks.ts parseTrackPoints 同一份契約。
 *
 * ⚠️ 2026-07 前的舊碼寫成 [lat, lon, alt(生英呎，未轉換), gspeed]：高度單位錯、
 *    第 4 欄放的是地速不是時間戳。存量資料（全庫約 3.3%）的高度已由
 *    scripts/oneoff/migrate-alt-units.ts 反解為公尺；時間戳無法回復，維持原樣。
 */
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
  } else if (typeof data === "object" && (data as Record<string, unknown>).tracks) {
    tracks = (data as Record<string, unknown>).tracks as unknown[];
  }
  if (!tracks.length) return null;
  const points = tracks
    .map((p) => {
      const o = p as Record<string, unknown>;
      const lat = Number(o.lat ?? o.latitude ?? 0);
      const lon = Number(o.lng ?? o.lon ?? o.longitude ?? 0);
      // FR24 flight-tracks 的 alt 一律是英呎（實測 100% 為 25 ft 倍數），無條件轉公尺
      const alt = Number(o.alt ?? o.altitude ?? o.alt_baro ?? o.altitude_m ?? 0);
      const ts = Number(
        o.timestamp
          ? typeof o.timestamp === "string"
            ? isoToUnix(o.timestamp)
            : o.timestamp
          : o.ts ?? 0,
      );
      if (lat === 0 || lon === 0 || ts === 0) return null;
      return [lat, lon, Math.round(alt * 0.3048), ts] as [
        number,
        number,
        number,
        number,
      ];
    })
    .filter((p): p is [number, number, number, number] => p !== null);
  return points.length > 0 ? points : null;
}

let totalRequests = 0;

async function fetchTrack(fr24Id: string): Promise<{ ok: true; data: unknown } | { ok: false; reason: "404" | "network" | "http_err"; detail?: string }> {
  const url = `${API_BASE}/flight-tracks?flight_id=${fr24Id}`;

  for (let attempt = 1; attempt <= NETWORK_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}`, "Accept-Version": "v1" },
      });
      totalRequests++;

      if (res.ok) return { ok: true, data: await res.json() };
      if (res.status === 404) return { ok: false, reason: "404" };
      if (res.status === 429) {
        const wait = Math.min(15 * Math.pow(2, attempt - 1), 120);
        console.log(`    ⏳ 429, wait ${wait}s (${attempt}/${NETWORK_MAX_RETRIES})`);
        await sleep(wait * 1000);
        continue;
      }
      const body = await res.text();
      return { ok: false, reason: "http_err", detail: `${res.status} ${body.slice(0, 100)}` };
    } catch (e: unknown) {
      const msg = (e as Error).message;
      if (attempt < NETWORK_MAX_RETRIES) {
        const wait = 5 * Math.pow(2, attempt - 1); // 5, 10, 20s
        console.log(`    🔁 net err "${msg}", wait ${wait}s (${attempt}/${NETWORK_MAX_RETRIES})`);
        await sleep(wait * 1000);
        continue;
      }
      return { ok: false, reason: "network", detail: msg };
    }
  }
  return { ok: false, reason: "network", detail: "max retries" };
}

interface FlightMeta {
  fr24_id: string;
  flight?: string;
  callsign?: string;
  operating_as?: string;
  painted_as?: string;
  type?: string;
  reg?: string;
  orig_icao?: string;
  dest_icao?: string;
  dest_icao_actual?: string;
  datetime_takeoff?: string;
  datetime_landed?: string;
  first_seen?: string;
  last_seen?: string;
  flight_ended?: boolean;
  hex?: string;
}

function buildOutput(flight: FlightMeta, points: [number, number, number, number][]) {
  return {
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
}

function writeFlightToJsonl(flight: FlightMeta, output: object) {
  const targets = new Set<string>();
  if (flight.orig_icao) targets.add(flight.orig_icao);
  if (flight.dest_icao) targets.add(flight.dest_icao);
  if (flight.dest_icao_actual && flight.dest_icao_actual !== flight.dest_icao) {
    targets.add(flight.dest_icao_actual);
  }
  for (const icao of targets) {
    if (!icao || icao === "—" || icao.length !== 4) continue;
    appendFileSync(`${AIRPORTS_DIR}/${icao}.jsonl`, JSON.stringify(output) + "\n");
  }
}

async function main() {
  console.log("=== Retry Failed Tracks ===\n");

  const targets = readFileSync(RETRY_TARGETS, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  console.log(`目標: ${targets.length} 筆\n`);

  const flightList = JSON.parse(readFileSync(FLIGHT_LIST, "utf-8")) as { flights: FlightMeta[] };
  const flightMap = new Map(flightList.flights.map((f) => [f.fr24_id, f]));

  // Load existing failed to rewrite at end
  const existingFailed = new Set(
    existsSync(FAILED_FILE)
      ? readFileSync(FAILED_FILE, "utf-8").split("\n").filter((l) => l.trim())
      : [],
  );

  let successCount = 0;
  let still404 = 0;
  let stillNetwork = 0;
  let stillHttpErr = 0;
  let notFoundMeta = 0;

  // ── Circuit breaker ──
  const CB_CONSECUTIVE_FAIL = 15;
  const CB_WINDOW_SIZE = 50;
  const CB_WINDOW_FAIL_RATE = 0.5;
  const CB_MIN_SAMPLES = 20;
  let consecutiveFails = 0;
  const recentResults: boolean[] = [];

  const startTime = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const fid = targets[i]!;
    const flight = flightMap.get(fid);
    const pct = ((i + 1) / targets.length * 100).toFixed(1);

    process.stdout.write(`[${i + 1}/${targets.length}] ${pct}% ${fid} `);

    if (!flight) {
      console.log(`⚠️ no metadata`);
      notFoundMeta++;
      continue;
    }

    const result = await fetchTrack(fid);

    let thisRequestFailed = false; // 真網路/HTTP 異常才算（404 不算 — 是合法回應）
    if (result.ok) {
      const points = parseTrackPoints(result.data);
      if (points && points.length >= 2) {
        const out = buildOutput(flight, points);
        writeFlightToJsonl(flight, out);
        appendFileSync(DONE_FILE, fid + "\n");
        existingFailed.delete(fid);
        successCount++;
        console.log(`✅ ${points.length} 點`);
      } else {
        console.log(`⚪ 無軌跡點`);
        still404++;
      }
    } else if (result.reason === "404") {
      console.log(`❌ 404 真不存在`);
      still404++;
    } else if (result.reason === "network") {
      console.log(`❌ 網路: ${result.detail}`);
      stillNetwork++;
      thisRequestFailed = true;
    } else {
      console.log(`❌ ${result.detail}`);
      stillHttpErr++;
      thisRequestFailed = true;
    }

    // ── Circuit breaker check ──
    if (thisRequestFailed) consecutiveFails++;
    else consecutiveFails = 0;

    recentResults.push(!thisRequestFailed);
    if (recentResults.length > CB_WINDOW_SIZE) recentResults.shift();

    if (consecutiveFails >= CB_CONSECUTIVE_FAIL) {
      console.error(
        `\n🛑 CIRCUIT BREAKER: 連續 ${consecutiveFails} 筆失敗，疑似系統性異常。停止以節省 credits。`,
      );
      break;
    }
    if (recentResults.length >= CB_MIN_SAMPLES) {
      const fails = recentResults.filter((r) => !r).length;
      const rate = fails / recentResults.length;
      if (recentResults.length >= CB_WINDOW_SIZE && rate > CB_WINDOW_FAIL_RATE) {
        console.error(
          `\n🛑 CIRCUIT BREAKER: 最近 ${recentResults.length} 筆失敗率 ${(rate * 100).toFixed(0)}% > 50%。停止。`,
        );
        break;
      }
    }

    await sleep(DELAY_MS);
  }

  // Rewrite failed.ndjson without successfully retried ones
  writeFileSync(FAILED_FILE, [...existingFailed].join("\n") + "\n");

  const dur = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log("\n=== 統計 ===\n");
  console.log(`成功救回:       ${successCount}`);
  console.log(`仍 404:         ${still404}`);
  console.log(`仍網路失敗:     ${stillNetwork}`);
  console.log(`仍 HTTP 錯誤:   ${stillHttpErr}`);
  console.log(`metadata 找不到: ${notFoundMeta}`);
  console.log(`API 請求數:     ${totalRequests}`);
  console.log(`耗時:           ${dur} 分鐘`);
  console.log(`failed.ndjson:  ${existingFailed.size} 筆（已移除救回的）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
