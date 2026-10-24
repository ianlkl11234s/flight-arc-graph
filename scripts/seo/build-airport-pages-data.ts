/**
 * 從本機 public/tracks/（gitignored）算出機場靜態頁資料 → scripts/seo/airport-pages-data.json
 * 用法：npx tsx scripts/seo/build-airport-pages-data.ts
 * 契約見 airportPagesTypes.ts。逐行串流讀 L0 JSONL，只 parse "path" 之前的欄位。
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  MIN_FLIGHTS_FOR_PAGE,
  type AirportPageEntry,
  type AirportPagesData,
  type RouteStat,
} from './airportPagesTypes';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TRACKS_DIR = path.join(ROOT, 'public/tracks');
const OUT = path.join(ROOT, 'scripts/seo/airport-pages-data.json');

interface ManifestAirport {
  flights: number;
  dates?: Record<string, number>;
  fullDates?: string[];
  datesArr?: Record<string, number>;
  datesDep?: Record<string, number>;
  dailyFiles?: Record<string, { path: string }>;
}

interface Meta {
  iata: string | null;
  nameZh: string | null;
  nameEn: string;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
}

interface Row {
  fr24_id?: string;
  callsign?: string;
  aircraft_type?: string;
  origin_icao?: string;
  dest_icao?: string;
}

const sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
const orNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function top<T extends { count: number }>(
  m: Map<string, number>,
  n: number,
  mk: (k: string, c: number) => T,
): T[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, n)
    .map(([k, c]) => mk(k, c));
}

function parseRow(line: string): Row | null {
  const i = line.indexOf(',"path":');
  try {
    return JSON.parse(i >= 0 ? line.slice(0, i) + '}' : line) as Row;
  } catch {
    return null;
  }
}

async function main() {
  const t0 = Date.now();
  const manifest = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, 'manifest.json'), 'utf8')) as {
    generatedAt: string;
    airports: Record<string, ManifestAirport>;
  };
  const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/airport-points.geojson'), 'utf8')) as {
    features: { geometry: { coordinates: [number, number] }; properties: Record<string, unknown> }[];
  };
  const metaByIcao = new Map<string, Meta>();
  for (const f of geo.features) {
    const p = f.properties;
    const icao = orNull(p.icao);
    if (!icao) continue;
    metaByIcao.set(icao, {
      iata: orNull(p.iata),
      nameZh: orNull(p.nameZh),
      nameEn: orNull(p.nameEn) ?? orNull(p.name) ?? icao,
      city: orNull(p.city),
      country: orNull(p.country),
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    });
  }

  const entries: AirportPageEntry[] = [];
  const mismatches: { icao: string; manifest: number; actual: number }[] = [];
  let skippedNoGeo = 0;
  let belowThreshold = 0;

  for (const [icao, a] of Object.entries(manifest.airports)) {
    if (!(a.flights >= MIN_FLIGHTS_FOR_PAGE)) {
      belowThreshold++;
      continue;
    }
    const meta = metaByIcao.get(icao);
    if (!meta) {
      skippedNoGeo++;
      continue;
    }

    const seen = new Set<string>();
    const routes = new Map<string, { arr: number; dep: number }>();
    const airlines = new Map<string, number>();
    const aircraft = new Map<string, number>();

    for (const df of Object.values(a.dailyFiles ?? {})) {
      const file = path.join(TRACKS_DIR, df.path);
      if (!fs.existsSync(file)) continue;
      const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line) continue;
        const r = parseRow(line);
        if (!r || !r.fr24_id || seen.has(r.fr24_id)) continue;
        seen.add(r.fr24_id);

        const o = r.origin_icao || '';
        const d = r.dest_icao || '';
        if (d === icao && o && o !== icao) {
          const x = routes.get(o) ?? { arr: 0, dep: 0 };
          x.arr++;
          routes.set(o, x);
        } else if (o === icao && d && d !== icao) {
          const x = routes.get(d) ?? { arr: 0, dep: 0 };
          x.dep++;
          routes.set(d, x);
        }
        const code = r.callsign?.match(/^([A-Z]{2,3})/)?.[1];
        if (code) airlines.set(code, (airlines.get(code) ?? 0) + 1);
        const t = r.aircraft_type?.trim();
        if (t) aircraft.set(t, (aircraft.get(t) ?? 0) + 1);
      }
    }

    if (seen.size !== a.flights) mismatches.push({ icao, manifest: a.flights, actual: seen.size });

    const topRoutes: RouteStat[] = [...routes.entries()]
      .map(([k, v]) => ({ icao: k, arr: v.arr, dep: v.dep, total: v.arr + v.dep }))
      .sort((x, y) => y.total - x.total || (x.icao < y.icao ? -1 : x.icao > y.icao ? 1 : 0))
      .slice(0, 10);

    entries.push({
      icao,
      iata: meta.iata,
      nameZh: meta.nameZh,
      nameEn: meta.nameEn,
      city: meta.city,
      country: meta.country,
      lat: meta.lat,
      lng: meta.lng,
      flights: a.flights,
      arr: sum(a.datesArr),
      dep: sum(a.datesDep),
      dates: Object.keys(a.dates ?? {}).sort(),
      fullDates: a.fullDates ?? [],
      topRoutes,
      topAirlines: top(airlines, 8, (code, count) => ({ code, count })),
      topAircraft: top(aircraft, 8, (type, count) => ({ type, count })),
    });
  }

  entries.sort((x, y) => y.flights - x.flights || (x.icao < y.icao ? -1 : x.icao > y.icao ? 1 : 0));
  const data: AirportPagesData = {
    generatedAt: manifest.generatedAt,
    minFlights: MIN_FLIGHTS_FOR_PAGE,
    airports: entries,
  };
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');

  const size = fs.statSync(OUT).size;
  console.log(`機場頁數：${entries.length}`);
  console.log(`略過（門檻以下）：${belowThreshold}；略過（不在 geojson）：${skippedNoGeo}`);
  console.log(`筆數不一致：${mismatches.length}`);
  for (const m of mismatches.slice(0, 10)) console.log(`  ${m.icao} manifest=${m.manifest} actual=${m.actual}`);
  console.log(`輸出：${path.relative(ROOT, OUT)}（${(size / 1024).toFixed(1)} KB）`);
  console.log(`耗時：${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
