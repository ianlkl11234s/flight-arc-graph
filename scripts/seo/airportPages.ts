/**
 * 機場靜態頁（/airports/<icao>/）的純函式渲染：不讀檔、不碰 DOM。
 * 讀檔與寫檔在 generate-airport-pages.ts。資料契約見 airportPagesTypes.ts。
 */
import { esc, jsonLd, BASE_STYLE } from "./htmlShared";
import type { AirportPageEntry, AirportPagesData } from "./airportPagesTypes";
import { getAirlineDisplayName } from "../../src/data/airlineDatabase";

export { esc };

export interface RenderContext {
  origin: string;
  /** 對端機場顯示名稱 */
  names: Record<string, { nameZh: string | null; nameEn: string; iata: string | null }>;
  /** 有獨立頁面的 ICAO（大寫） */
  pageIcaos: Set<string>;
  /** 軌跡索引 generatedAt（ISO）；用於「資料截至」。缺省時退回該機場最後一個有資料的日期 */
  generatedAt?: string;
}

const n = (v: number) => v.toLocaleString("en-US");
const displayName = (e: { nameZh: string | null; nameEn: string }) => e.nameZh ?? e.nameEn;
const pagePath = (icao: string) => `/airports/${icao.toLowerCase()}/`;

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["zh-Hant"], { type: "region" });
    const r = regionNames.of(code);
    return r && r !== code ? r : code;
  } catch {
    return code;
  }
}

function head(opts: {
  title: string;
  description: string;
  url: string;
  origin: string;
  ld: unknown;
}): string {
  const t = esc(opts.title);
  const d = esc(opts.description);
  const u = esc(opts.url);
  return `<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
<link rel="canonical" href="${u}" />
<meta name="description" content="${d}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${t}" />
<meta property="og:url" content="${u}" />
<meta property="og:site_name" content="Flight Arc" />
<meta property="og:description" content="${d}" />
<meta property="og:locale" content="zh_TW" />
<meta property="og:image" content="${esc(opts.origin)}/og-image.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">
${jsonLd(opts.ld)}
</script>
<style>
${BASE_STYLE}
</style>
</head>`;
}

const dateOf = (iso: string) => iso.slice(0, 10);

function airportLink(icao: string, ctx: RenderContext): string {
  const up = icao.toUpperCase();
  const nm = ctx.names[up];
  const label = nm ? displayName(nm) : up;
  const code = nm?.iata ? `${nm.iata}／${up}` : up;
  const text = `${esc(label)}（${esc(code)}）`;
  return ctx.pageIcaos.has(up) ? `<a href="${pagePath(up)}">${text}</a>` : text;
}

export function renderAirportPage(entry: AirportPageEntry, ctx: RenderContext): string {
  const { origin } = ctx;
  const icao = entry.icao.toUpperCase();
  const name = displayName(entry);
  const codes = entry.iata ? `${entry.iata}／${icao}` : icao;
  const url = `${origin}${pagePath(icao)}`;
  const first = entry.dates[0] ?? "";
  const last = entry.dates[entry.dates.length - 1] ?? "";
  const range = first === last ? first : `${first} 至 ${last}`;
  const asOf = ctx.generatedAt ? dateOf(ctx.generatedAt) : last;
  const title = `${name}（${codes}）航班軌跡｜Flight Arc`;
  const description = `Flight Arc 收錄 ${name}（${codes}）${range} 間 ${n(entry.dates.length)} 個日期、共 ${n(entry.flights)} 筆航班的起降軌跡（進場 ${n(entry.arr)}、離場 ${n(entry.dep)}），可在 3D 地圖上回放。`;

  const airport: Record<string, unknown> = {
    "@type": "Airport",
    "@id": `${url}#airport`,
    name,
    icaoCode: icao,
    url,
    geo: { "@type": "GeoCoordinates", latitude: entry.lat, longitude: entry.lng },
  };
  if (entry.iata) airport.iataCode = entry.iata;
  const address: Record<string, string> = {};
  if (entry.city) address.addressLocality = entry.city;
  if (entry.country) address.addressCountry = entry.country;
  if (Object.keys(address).length) airport.address = { "@type": "PostalAddress", ...address };
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      airport,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Flight Arc", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "機場總覽", item: `${origin}/airports/` },
          { "@type": "ListItem", position: 3, name, item: url },
        ],
      },
    ],
  };

  const routeRows = entry.topRoutes
    .map(
      (r) =>
        `<tr><td>${airportLink(r.icao, ctx)}</td><td class="num">${n(r.arr)}</td><td class="num">${n(r.dep)}</td><td class="num">${n(r.total)}</td></tr>`,
    )
    .join("\n");
  const airlineRows = entry.topAirlines
    .map((a) => {
      const label = getAirlineDisplayName(a.code);
      const shown = label && label !== a.code ? `${esc(label)}（${esc(a.code)}）` : esc(a.code);
      return `<tr><td>${shown}</td><td class="num">${n(a.count)}</td></tr>`;
    })
    .join("\n");
  const aircraftRows = entry.topAircraft
    .map((a) => `<tr><td>${esc(a.type)}</td><td class="num">${n(a.count)}</td></tr>`)
    .join("\n");

  const routesSection = entry.topRoutes.length
    ? `<h2>主要往來機場</h2>
<p class="note">依本站收錄的航班統計；「飛來」是從對端飛到${esc(name)}，「飛往」是從${esc(name)}飛往對端。</p>
<div class="tablewrap"><table>
<thead><tr><th>機場</th><th class="num">飛來</th><th class="num">飛往</th><th class="num">合計</th></tr></thead>
<tbody>
${routeRows}
</tbody></table></div>`
    : "";
  const airlinesSection = entry.topAirlines.length
    ? `<h2>主要航空公司</h2>
<div class="tablewrap"><table>
<thead><tr><th>航空公司</th><th class="num">航班數</th></tr></thead>
<tbody>
${airlineRows}
</tbody></table></div>`
    : "";
  const aircraftSection = entry.topAircraft.length
    ? `<h2>主要機型</h2>
<div class="tablewrap"><table>
<thead><tr><th>機型</th><th class="num">航班數</th></tr></thead>
<tbody>
${aircraftRows}
</tbody></table></div>`
    : "";

  return `<!doctype html>
<html lang="zh-Hant-TW">
${head({ title, description, url, origin, ld })}
<body>
<main>
<nav class="crumbs" aria-label="麵包屑"><a href="/">Flight Arc</a> › <a href="/airports/">機場總覽</a> › ${esc(name)}</nav>
<h1>${esc(name)}（${esc(codes)}）航班軌跡</h1>
<p class="lead">Flight Arc 收錄了${esc(name)}在 ${esc(range)} 間 ${n(entry.dates.length)} 個日期、共 ${n(entry.flights)} 筆航班的起降軌跡，可在 3D 地圖上回放。</p>
<p><a class="cta" href="/?a=${encodeURIComponent(icao)}">在 3D 地圖上看${esc(name)}</a></p>

<h2>收錄統計</h2>
<dl class="stats">
<div><dt>收錄航班</dt><dd>${n(entry.flights)}</dd></div>
<div><dt>進場</dt><dd>${n(entry.arr)}</dd></div>
<div><dt>離場</dt><dd>${n(entry.dep)}</dd></div>
<div><dt>有資料的日期</dt><dd>${n(entry.dates.length)}</dd></div>
<div><dt>完整日期</dt><dd>${n(entry.fullDates.length)}</dd></div>
</dl>
<p class="note">資料期間：${esc(range)}。「完整日期」指當天該機場的起降大致都有收錄；其餘日期只收錄部分航班。未收錄的日期不代表沒有航班。</p>

${routesSection}
${airlinesSection}
${aircraftSection}

<footer>
<p>資料截至 ${esc(asOf)}（依 Flight Arc 軌跡索引）。航班資料來源：FlightRadar24 API。數字為本站收錄的航班，並非該機場的完整營運量；未收錄的日期不代表沒有航班。</p>
<p><a href="/">Flight Arc 首頁</a> · <a href="/airports/">所有機場</a></p>
</footer>
</main>
</body>
</html>
`;
}

export function renderAirportIndex(data: AirportPagesData, ctx: RenderContext): string {
  const { origin } = ctx;
  const url = `${origin}/airports/`;
  const title = "機場總覽｜Flight Arc";
  const description = `Flight Arc 為 ${n(data.airports.length)} 座機場建立了航班軌跡頁，每座機場至少收錄 ${n(data.minFlights)} 筆航班，可在 3D 地圖上回放起降軌跡。`;
  const groups = new Map<string, AirportPageEntry[]>();
  for (const a of data.airports) {
    const k = a.country ?? "";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(a);
  }
  const sections = [...groups.entries()]
    .map(([code, list]) => ({
      label: code ? countryName(code) : "其他",
      total: list.reduce((s, a) => s + a.flights, 0),
      list: [...list].sort((a, b) => b.flights - a.flights),
    }))
    .sort((a, b) => b.total - a.total)
    .map((g) => {
      const items = g.list
        .map((a) => {
          const codes = a.iata ? `${a.iata}／${a.icao}` : a.icao;
          return `<li><a href="${pagePath(a.icao)}">${esc(displayName(a))}（${esc(codes)}）</a> · ${n(a.flights)} 筆</li>`;
        })
        .join("\n");
      return `<h2>${esc(g.label)}（${n(g.list.length)}）</h2>\n<ul class="cols">\n${items}\n</ul>`;
    })
    .join("\n");
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Flight Arc", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "機場總覽", item: url },
        ],
      },
    ],
  };
  return `<!doctype html>
<html lang="zh-Hant-TW">
${head({ title, description, url, origin, ld })}
<body>
<main>
<nav class="crumbs" aria-label="麵包屑"><a href="/">Flight Arc</a> › 機場總覽</nav>
<h1>機場總覽</h1>
<p class="lead">這裡列出 Flight Arc 有獨立航班軌跡頁的 ${n(data.airports.length)} 座機場（收錄航班數達 ${n(data.minFlights)} 筆以上），依國家分組、國家內依收錄航班數排序。</p>
${sections}
<footer>
<p>資料截至 ${esc(dateOf(data.generatedAt))}（依 Flight Arc 軌跡索引）。航班資料來源：FlightRadar24 API。</p>
<p><a href="/">Flight Arc 首頁</a></p>
</footer>
</main>
</body>
</html>
`;
}

export function renderAirportsSitemap(data: AirportPagesData, ctx: RenderContext): string {
  const lastmod = dateOf(data.generatedAt);
  const locs = [`${ctx.origin}/airports/`, ...data.airports.map((a) => `${ctx.origin}${pagePath(a.icao)}`)];
  const urls = locs
    .map((l) => `  <url>\n    <loc>${esc(l)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

// nginx map 的字串 key 比對不分大小寫（同一機場寫大小寫兩行會 emerg「conflicting parameter」），
// 所以每座機場只寫一行小寫 key，/airports/RCTP/ 也查得到並由 nginx 301 到小寫。
export function renderAirportsNginxMap(data: AirportPagesData): string {
  return data.airports.map((a) => `${a.icao.toLowerCase()} ${a.icao.toLowerCase()};`).join("\n") + "\n";
}
