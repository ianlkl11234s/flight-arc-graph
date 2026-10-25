/**
 * build 時（vite build 之後）產生機場靜態 SEO 頁。
 * 讀 scripts/seo/airport-pages-data.json 與 public/airport-points.geojson，
 * 寫 dist/airports/<icao>/index.html、dist/airports/index.html、dist/sitemap-airports.xml、
 * build/nginx/airports.map（給 Dockerfile 複製進 nginx，不放 dist）。
 *
 * 用法：npx tsx scripts/seo/generate-airport-pages.ts
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AirportPagesData } from "./airportPagesTypes";
import {
  renderAirportPage,
  renderAirportIndex,
  renderAirportsSitemap,
  renderAirportsNginxMap,
  type RenderContext,
} from "./airportPages";

const ORIGIN = "https://flight-arc.itsmigu.com";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = join(root, "dist");
const dataPath = join(root, "scripts/seo/airport-pages-data.json");
const pointsPath = join(root, "public/airport-points.geojson");

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

if (!existsSync(dist)) {
  console.error("找不到 dist/，請先跑 vite build 再執行本腳本");
  process.exit(1);
}
if (!existsSync(dataPath)) {
  console.error(`找不到 ${dataPath}，請先跑 build-airport-pages-data.ts`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(dataPath, "utf8")) as AirportPagesData;

const names: RenderContext["names"] = {};
const geo = JSON.parse(readFileSync(pointsPath, "utf8")) as {
  features: { properties: { icao?: string; iata?: string | null; nameZh?: string | null; nameEn?: string; name?: string } }[];
};
for (const f of geo.features) {
  const p = f.properties;
  if (!p.icao) continue;
  names[p.icao.toUpperCase()] = { nameZh: p.nameZh ?? null, nameEn: p.nameEn ?? p.name ?? p.icao, iata: p.iata ?? null };
}
for (const a of data.airports) {
  names[a.icao.toUpperCase()] = { nameZh: a.nameZh, nameEn: a.nameEn, iata: a.iata };
}

const ctx: RenderContext = {
  origin: ORIGIN,
  names,
  pageIcaos: new Set(data.airports.map((a) => a.icao.toUpperCase())),
  generatedAt: data.generatedAt,
};

for (const a of data.airports) {
  write(join(dist, "airports", a.icao.toLowerCase(), "index.html"), renderAirportPage(a, ctx));
}
write(join(dist, "airports", "index.html"), renderAirportIndex(data, ctx));
write(join(dist, "sitemap-airports.xml"), renderAirportsSitemap(data, ctx));
write(join(root, "build/nginx/airports.map"), renderAirportsNginxMap(data));

console.log(`機場頁：產出 ${data.airports.length} 頁 + /airports/ 總覽（資料截至 ${data.generatedAt.slice(0, 10)}）`);
