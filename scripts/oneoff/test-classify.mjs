// 驗證 classify.ts 對真實 JSONL 的分類效果
// 用法: node scripts/oneoff/test-classify.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// 簡化版：inline 關鍵邏輯（避免 import TS source）
import { getAircraftInfo, CATEGORY_LABELS } from "../../src/data/aircraftDatabase.ts";
import { getAirlineInfo } from "../../src/data/airlineDatabase.ts";
import { classifyDuration, classifyRouteScope, classifyPurpose, isDiverted, isWetLeaseOrCodeshare } from "../../src/data/classify.ts";

const AIRPORTS_DIR = "public/tracks/airports";
const files = readdirSync(AIRPORTS_DIR).filter((f) => f.endsWith(".jsonl"));

const counters = {
  category: {},
  purpose: {},
  duration: {},
  routeScope: {},
  diverted: 0,
  wetLease: 0,
  total: 0,
  acFallback: 0,
  opFallback: 0,
};

const seen = new Set();
for (const fn of files) {
  const lines = readFileSync(join(AIRPORTS_DIR, fn), "utf-8").split("\n").filter(Boolean);
  for (const line of lines) {
    let f;
    try { f = JSON.parse(line); } catch { continue; }
    if (seen.has(f.fr24_id)) continue;
    seen.add(f.fr24_id);
    counters.total++;

    const ac = getAircraftInfo(f.aircraft_type);
    if (ac.category === "other" && f.aircraft_type) counters.acFallback++;
    counters.category[ac.category] = (counters.category[ac.category] || 0) + 1;

    const op = getAirlineInfo(f.operating_as);
    if (op.country === "XX" && f.operating_as) counters.opFallback++;

    const p = classifyPurpose(f);
    counters.purpose[p] = (counters.purpose[p] || 0) + 1;

    const d = classifyDuration(f);
    counters.duration[d] = (counters.duration[d] || 0) + 1;

    const r = classifyRouteScope(f);
    counters.routeScope[r] = (counters.routeScope[r] || 0) + 1;

    if (isDiverted(f)) counters.diverted++;
    if (isWetLeaseOrCodeshare(f)) counters.wetLease++;
  }
}

const fmt = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k.padEnd(20)} ${v.toLocaleString().padStart(7)} (${(v / counters.total * 100).toFixed(1)}%)`).join("\n");

console.log(`Total unique flights: ${counters.total.toLocaleString()}\n`);
console.log("== Aircraft Category ==");
console.log(fmt(counters.category));
console.log(`\n  (fallback "other" with aircraft_type present: ${counters.acFallback})`);
console.log("\n== Flight Purpose ==");
console.log(fmt(counters.purpose));
console.log("\n== Duration ==");
console.log(fmt(counters.duration));
console.log("\n== Route Scope ==");
console.log(fmt(counters.routeScope));
console.log(`\n== Special ==`);
console.log(`  Diverted:        ${counters.diverted}  (${(counters.diverted / counters.total * 100).toFixed(2)}%)`);
console.log(`  Wet Lease/CS:    ${counters.wetLease}  (${(counters.wetLease / counters.total * 100).toFixed(2)}%)`);
console.log(`  Unknown airline: ${counters.opFallback}  (${(counters.opFallback / counters.total * 100).toFixed(1)}%)`);
