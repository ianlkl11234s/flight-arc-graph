import 'dotenv/config';

// 通用版 count script — 從 argv 讀機場清單與 label
// 用法: node count-airports.mjs ICAO1,ICAO2,... [label]
// 時間窗口固定為 TW 2/18 全天

const TOKEN = process.env.FR24_API_TOKEN;
const FROM = '2026-02-17T16:00:00Z'; // TW 2/18 00:00
const TO   = '2026-02-18T16:00:00Z'; // TW 2/18 24:00

const AIRPORTS = (process.argv[2] || '').split(',').map(s => s.trim()).filter(Boolean);
const LABEL = process.argv[3] || 'batch';
const PAGE_SIZE = 300;

if (!TOKEN) {
  console.error('Missing FR24_API_TOKEN in env');
  process.exit(1);
}
if (!AIRPORTS.length) {
  console.error('usage: node count-airports.mjs ICAO1,ICAO2,... [label]');
  process.exit(1);
}

async function countAirport(ap) {
  let total = 0;
  let pages = 0;
  let cursor = FROM;
  while (true) {
    const params = new URLSearchParams({
      flight_datetime_from: cursor,
      flight_datetime_to: TO,
      'airports[]': ap,
      limit: String(PAGE_SIZE),
      sort: 'asc',
    });
    const res = await fetch(`https://fr24api.flightradar24.com/api/flight-summary/light?${params}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Accept-Version': 'v1' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const j = await res.json();
    const rows = Array.isArray(j) ? j : (j.data ?? []);
    total += rows.length;
    pages++;
    if (rows.length < PAGE_SIZE) break;
    const last = rows[rows.length - 1];
    const next = last.datetime_takeoff || last.first_seen;
    if (!next || next <= cursor) break;
    cursor = next;
    if (cursor >= TO) break;
    await new Promise(r => setTimeout(r, 2200));
  }
  return { total, pages };
}

console.log(`Batch: ${LABEL}`);
console.log(`Time window (UTC): ${FROM} → ${TO} (= TW 2/18 全天)`);
console.log(`Airports: ${AIRPORTS.length} 座`);
console.log(`機場        | 航班數  | API 頁數`);
console.log(`------------|---------|--------`);
let grandTotal = 0, grandPages = 0;
const results = [];
for (const ap of AIRPORTS) {
  try {
    const { total, pages } = await countAirport(ap);
    console.log(`${ap.padEnd(11)} | ${String(total).padStart(7)} | ${String(pages).padStart(6)}`);
    results.push({ ap, total, pages });
    grandTotal += total;
    grandPages += pages;
  } catch (e) {
    console.log(`${ap.padEnd(11)} | ERROR   | ${e.message}`);
    results.push({ ap, error: e.message });
  }
  await new Promise(r => setTimeout(r, 2200));
}
console.log(`------------|---------|--------`);
console.log(`總計 (${LABEL}) | ${String(grandTotal).padStart(7)} | ${String(grandPages).padStart(6)}`);
console.log(`\nSchedule credits 預估: ${grandPages} pages × 38.7 ≈ ${Math.round(grandPages * 38.7)} credits`);
console.log(`Track credits 預估: ${grandTotal} flights × ~12 ≈ ${grandTotal * 12} credits`);

// 排序顯示（方便決定優先序）
console.log(`\n--- 依航班數排序 ---`);
results
  .filter(r => !r.error)
  .sort((a, b) => b.total - a.total)
  .forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.ap.padEnd(8)} ${String(r.total).padStart(5)} flights`));
