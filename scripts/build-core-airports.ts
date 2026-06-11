/**
 * build-core-airports.ts
 *
 * 從 scripts/flight-list.json（Step 1 班表）+ scripts/track-done.ndjson（已抓軌跡 id）
 * 產出 scripts/core-airports.json：
 *   - 哪些機場是「主動查詢」(core)
 *   - 每座 core 機場哪些台灣日期算「抓滿」(fullDates)
 *
 * fullDates 規則（與 docs/data-coverage.md 的「主力日期」同義）：
 *   該機場該日（台灣時間 UTC+8）已抓軌跡 done ≥ 50 筆，且 done/scheduled ≥ 80%
 *
 * 之後 split-tracks.ts 讀本檔，把 isCore / fullDates 寫進 manifest.json。
 *
 * Usage: npx tsx scripts/build-core-airports.ts
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FLIGHT_LIST = join(__dirname, "flight-list.json");
const TRACK_DONE = join(__dirname, "track-done.ndjson");
const OUT_FILE = join(__dirname, "core-airports.json");

const MIN_DONE = 50; // 該日最少軌跡數
const MIN_RATIO = 0.8; // 該日完成度（done/scheduled）

interface ListedFlight {
  fr24_id: string;
  orig_icao: string | null;
  dest_icao: string | null;
  datetime_takeoff: string | null;
  first_seen: string | null;
}

/** UTC ISO 字串 → 台灣時間日期 (YYYY-MM-DD)，與前端 App.tsx 的切日邏輯一致 */
function toTwDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return d.toISOString().slice(0, 10);
}

function main() {
  if (!existsSync(FLIGHT_LIST) || !existsSync(TRACK_DONE)) {
    console.error("❌ 需要 scripts/flight-list.json 與 scripts/track-done.ndjson");
    process.exit(1);
  }

  console.log("=== build-core-airports ===\n");

  // 1. 已抓軌跡的 fr24_id 集合
  const doneIds = new Set<string>();
  for (const line of readFileSync(TRACK_DONE, "utf-8").split("\n")) {
    const id = line.trim();
    if (id) doneIds.add(id);
  }
  console.log(`📖 track-done: ${doneIds.size} 筆`);

  // 2. 班表 + 主動查詢機場
  const list = JSON.parse(readFileSync(FLIGHT_LIST, "utf-8")) as {
    completed: string[];
    flights: ListedFlight[];
  };
  const coreIcaos = new Set(list.completed.map((c) => c.split(":")[0]!));
  console.log(`📖 flight-list: ${list.flights.length} 班次, ${coreIcaos.size} 座主動查詢機場`);

  // 3. 每座 core 機場 × 台灣日期 → scheduled / done
  const stats = new Map<string, Map<string, { scheduled: number; done: number }>>();
  for (const f of list.flights) {
    const ts = f.datetime_takeoff ?? f.first_seen;
    if (!ts) continue;
    const date = toTwDate(ts);
    const isDone = doneIds.has(f.fr24_id);
    for (const icao of [f.orig_icao, f.dest_icao]) {
      if (!icao || !coreIcaos.has(icao)) continue;
      let byDate = stats.get(icao);
      if (!byDate) stats.set(icao, (byDate = new Map()));
      let s = byDate.get(date);
      if (!s) byDate.set(date, (s = { scheduled: 0, done: 0 }));
      s.scheduled++;
      if (isDone) s.done++;
    }
  }

  // 4. fullDates 判定
  const airports: Record<
    string,
    { fullDates: string[]; dateStats: Record<string, { scheduled: number; done: number }> }
  > = {};
  for (const icao of [...coreIcaos].sort()) {
    const byDate = stats.get(icao) ?? new Map();
    const fullDates: string[] = [];
    const dateStats: Record<string, { scheduled: number; done: number }> = {};
    for (const [date, s] of [...byDate.entries()].sort()) {
      dateStats[date] = s;
      if (s.done >= MIN_DONE && s.done / s.scheduled >= MIN_RATIO) fullDates.push(date);
    }
    airports[icao] = { fullDates, dateStats };
  }

  const out = {
    generatedAt: new Date().toISOString(),
    rule: `done >= ${MIN_DONE} && done/scheduled >= ${MIN_RATIO}（台灣時間切日）`,
    airports,
  };
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 1));

  // 統計
  const withFull = Object.values(airports).filter((a) => a.fullDates.length > 0).length;
  console.log(`\n✅ core-airports.json: ${coreIcaos.size} 座 core，其中 ${withFull} 座有 fullDates`);
  for (const icao of ["RCTP", "OMDB", "KSEA", "ZBAA", "RJTT", "RCFG"]) {
    const a = airports[icao];
    if (a) console.log(`   ${icao}: fullDates = [${a.fullDates.join(", ")}]`);
  }
}

main();
