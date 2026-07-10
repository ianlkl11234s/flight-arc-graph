/**
 * Build Top 1000 global airports list for systematic schedule sweep.
 *
 * 來源：
 *   - scripts/airports-cache.csv (OurAirports dump)
 *   - public/tracks/manifest.json (現有被動觸及流量，當 traffic proxy)
 *
 * 篩選：
 *   1. type ∈ {large_airport, medium_airport}
 *   2. scheduled_service = yes
 *   3. icao_code 存在（4 碼）
 *   4. 排除 manifest 裡 isCore=true 的（已主動抓過）
 *
 * Rank：
 *   - 有 manifest flights → 用真實 flights 數
 *   - 沒有 → 用 country baseline + type weight
 *
 * 輸出：scripts/top1000-airports.json
 *   [{ rank, icao, iata, name, country, continent, type,
 *      est_daily_flights, est_pages, est_credits }]
 *
 * Usage: npx tsx scripts/build-top1000-airports.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const CSV_PATH = join(ROOT, "scripts/airports-cache.csv");
const MANIFEST_PATH = join(ROOT, "public/tracks/manifest.json");
const OUT_PATH = join(ROOT, "scripts/top1000-airports.json");

const TARGET_SIZE = 1000;
const PAGE_SIZE = 300;        // FR24 Essential
const CREDITS_PER_PAGE = 227; // 實測校準 2026-07-11（FR24 dashboard 254,821/1,122），舊值 38.7 低估 ~5.9×

// ── CSV parser (naive but works for OurAirports) ─────────────────────
function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = parseLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const fields = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = fields[i] || ""; });
    return row;
  });
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// ── 主流程 ──────────────────────────────────────────

console.log("=== Build Top 1000 Airports ===\n");

const csvText = readFileSync(CSV_PATH, "utf-8");
const rows = parseCsv(csvText);
console.log(`OurAirports CSV: ${rows.length} 列`);

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
const mAirports: Record<string, { flights: number; isCore: boolean }> =
  manifest.airports || {};
const coreSet = new Set(
  Object.entries(mAirports).filter(([, v]) => v.isCore).map(([k]) => k),
);
console.log(`Manifest 機場: ${Object.keys(mAirports).length}, 已主動 (isCore): ${coreSet.size}\n`);

// ── 篩選 ──
const candidates = rows.filter((r) => {
  const type = (r["type"] || "").replace(/"/g, "");
  const sched = (r["scheduled_service"] || "").replace(/"/g, "");
  const icao = (r["icao_code"] || r["ident"] || "").replace(/"/g, "");
  if (!icao || icao.length !== 4) return false;
  if (sched !== "yes") return false;
  if (type !== "large_airport" && type !== "medium_airport") return false;
  if (coreSet.has(icao)) return false; // 排除已主動
  return true;
});
console.log(`候選機場（large+medium, scheduled, 4碼 ICAO, 未主動）: ${candidates.length}\n`);

// ── Country baseline：用該國 manifest 機場「中位數」（避免單一爆量拉高 mean）──
// 拆 large / medium 各算各的中位數
const countryBaselineLarge = new Map<string, number>();
const countryBaselineMedium = new Map<string, number>();
{
  const buckets: Record<"large" | "medium", Map<string, number[]>> = {
    large: new Map(), medium: new Map(),
  };
  for (const r of rows) {
    const icao = (r["icao_code"] || r["ident"] || "").replace(/"/g, "");
    const country = (r["iso_country"] || "").replace(/"/g, "");
    const type = (r["type"] || "").replace(/"/g, "");
    if (!icao || !country) continue;
    const m = mAirports[icao];
    if (!m || m.flights < 5) continue;
    const bucket = type === "large_airport" ? "large" :
                   type === "medium_airport" ? "medium" : null;
    if (!bucket) continue;
    const arr = buckets[bucket].get(country) || [];
    arr.push(m.flights);
    buckets[bucket].set(country, arr);
  }
  const median = (arr: number[]) => {
    const s = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
  };
  for (const [c, a] of buckets.large) countryBaselineLarge.set(c, median(a));
  for (const [c, a] of buckets.medium) countryBaselineMedium.set(c, median(a));
}
console.log(`Country baseline: large=${countryBaselineLarge.size} 國 / medium=${countryBaselineMedium.size} 國\n`);

// ── 排名 ──
interface Cand {
  icao: string;
  iata: string;
  name: string;
  country: string;
  continent: string;
  type: string;
  est_daily_flights: number;
  est_pages: number;
  est_credits: number;
  source: "manifest" | "baseline" | "fallback";
}

const TYPE_FALLBACK = { large_airport: 80, medium_airport: 20 };
const GLOBAL_FALLBACK = 30;

const ranked: Cand[] = candidates.map((r) => {
  const icao = (r["icao_code"] || r["ident"] || "").replace(/"/g, "");
  const iata = (r["iata_code"] || "").replace(/"/g, "");
  const name = (r["name"] || "").replace(/"/g, "");
  const country = (r["iso_country"] || "").replace(/"/g, "");
  const continent = (r["continent"] || "").replace(/"/g, "");
  const type = (r["type"] || "").replace(/"/g, "");

  let est: number;
  let source: Cand["source"];
  const mEntry = mAirports[icao];
  if (mEntry && mEntry.flights >= 5) {
    // 用 manifest 真實數字（被動 → 實際單向略多，乘 1.5 抓 outbound）
    est = Math.round(mEntry.flights * 1.5);
    source = "manifest";
  } else {
    const baseline = type === "large_airport"
      ? countryBaselineLarge.get(country)
      : countryBaselineMedium.get(country);
    if (baseline !== undefined) {
      est = baseline;
      source = "baseline";
    } else {
      est = TYPE_FALLBACK[type as "large_airport" | "medium_airport"] || GLOBAL_FALLBACK;
      source = "fallback";
    }
  }

  const pages = Math.max(1, Math.ceil(est / PAGE_SIZE));
  const credits = Math.round(pages * CREDITS_PER_PAGE);

  return {
    icao, iata, name, country, continent, type,
    est_daily_flights: est,
    est_pages: pages,
    est_credits: credits,
    source,
  };
});

// 排序：先依 est_daily_flights 降序，同分依 type (large 優先)
ranked.sort((a, b) => {
  if (b.est_daily_flights !== a.est_daily_flights) {
    return b.est_daily_flights - a.est_daily_flights;
  }
  if (a.type === "large_airport" && b.type !== "large_airport") return -1;
  if (b.type === "large_airport" && a.type !== "large_airport") return 1;
  return a.icao.localeCompare(b.icao);
});

const top = ranked.slice(0, TARGET_SIZE);

// ── 加 rank + 統計 ──
const output = top.map((x, i) => ({ rank: i + 1, ...x }));

const totalEstFlights = top.reduce((s, x) => s + x.est_daily_flights, 0);
const totalEstPages = top.reduce((s, x) => s + x.est_pages, 0);
const totalEstCredits = top.reduce((s, x) => s + x.est_credits, 0);

const bySource = {
  manifest: top.filter((x) => x.source === "manifest").length,
  baseline: top.filter((x) => x.source === "baseline").length,
  fallback: top.filter((x) => x.source === "fallback").length,
};

const byContinent: Record<string, number> = {};
const byCountry: Record<string, number> = {};
for (const x of top) {
  byContinent[x.continent] = (byContinent[x.continent] || 0) + 1;
  byCountry[x.country] = (byCountry[x.country] || 0) + 1;
}

const payload = {
  generated_at: new Date().toISOString(),
  target_size: TARGET_SIZE,
  total: top.length,
  excluded_active: coreSet.size,
  rank_method: "manifest.flights × 1.5 (outbound proxy); fallback to country baseline; fallback to type default",
  totals: {
    est_daily_flights: totalEstFlights,
    est_pages: totalEstPages,
    est_credits: totalEstCredits,
    pct_of_monthly_quota: ((totalEstCredits / 666000) * 100).toFixed(2) + "%",
  },
  source_breakdown: bySource,
  by_continent: byContinent,
  top_countries: Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 20),
  airports: output,
};

writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));

// ── Console 報表 ──
console.log("=== Top 1000 結果 ===\n");
console.log(`輸出: ${OUT_PATH}\n`);
console.log(`機場數: ${top.length} / 目標 ${TARGET_SIZE}`);
console.log(`已主動排除: ${coreSet.size}\n`);

console.log("流量估算來源分佈:");
console.log(`  manifest (真實): ${bySource.manifest}`);
console.log(`  country baseline: ${bySource.baseline}`);
console.log(`  type fallback   : ${bySource.fallback}\n`);

console.log("Top 20 機場（按估算流量降序）:");
console.log("rank  ICAO  IATA  est_flt  pages  credits  country  type");
console.log("----  ----  ----  -------  -----  -------  -------  -----");
output.slice(0, 20).forEach((x) => {
  console.log(
    `${String(x.rank).padStart(4)}  ${x.icao}  ${x.iata.padEnd(4)}  ${String(x.est_daily_flights).padStart(7)}  ${String(x.est_pages).padStart(5)}  ${String(x.est_credits).padStart(7)}  ${x.country.padEnd(7)}  ${x.type}`,
  );
});

console.log("\nTop 10 國家分佈:");
Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([c, n]) => {
  console.log(`  ${c}: ${n} 座`);
});

console.log("\n洲別分佈:");
for (const [c, n] of Object.entries(byContinent).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c}: ${n}`);
}

console.log("\n=== 總額度預估（2026-02-18 outbound 單日掃描）===");
console.log(`  est_daily_flights : ${totalEstFlights.toLocaleString()}`);
console.log(`  est_pages         : ${totalEstPages.toLocaleString()}`);
console.log(`  est_credits       : ${totalEstCredits.toLocaleString()} (${payload.totals.pct_of_monthly_quota} of monthly quota)`);
console.log(`  est_track_credits : ${(totalEstFlights * 40).toLocaleString()} (僅供參考，本批不抓軌跡)`);
