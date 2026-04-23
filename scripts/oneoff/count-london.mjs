import 'dotenv/config';

const TOKEN = process.env.FR24_API_TOKEN;
const FROM = '2026-02-17T16:00:00Z'; // TW 2/18 00:00
const TO   = '2026-02-18T16:00:00Z'; // TW 2/18 24:00

// 10 London-area airports per Wikipedia; EGLF = Farnborough as likely 10th
const AIRPORTS = ['EGLL','EGKK','EGSS','EGGW','EGLC','EGMC','EGTK','EGKB','EGMD','EGLF'];
const PAGE_SIZE = 300;

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
      throw new Error(`${ap} HTTP ${res.status}: ${body.slice(0, 200)}`);
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

console.log(`Time window (UTC): ${FROM} → ${TO} (= TW 2/18 全天)`);
console.log(`機場        | 航班數  | API 頁數`);
console.log(`------------|---------|--------`);
let grandTotal = 0, grandPages = 0;
for (const ap of AIRPORTS) {
  try {
    const { total, pages } = await countAirport(ap);
    console.log(`${ap.padEnd(11)} | ${String(total).padStart(7)} | ${String(pages).padStart(6)}`);
    grandTotal += total;
    grandPages += pages;
  } catch (e) {
    console.log(`${ap.padEnd(11)} | ERROR   | ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 2200));
}
console.log(`------------|---------|--------`);
console.log(`總計        | ${String(grandTotal).padStart(7)} | ${String(grandPages).padStart(6)}`);
console.log(`\nSchedule credits 預估: ${grandPages} pages × 38.7 ≈ ${Math.round(grandPages * 38.7)} credits`);
console.log(`Track credits 預估: ${grandTotal} flights × ~12 ≈ ${grandTotal * 12} credits`);
