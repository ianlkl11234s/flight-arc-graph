// node --import tsx --test scripts/design/tests/airportPages.test.mjs（npm run design:test）
// 機場靜態 SEO 頁的渲染契約。fixture 為測試用假資料，非真實統計。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  renderAirportPage,
  renderAirportIndex,
  renderAirportsSitemap,
  renderAirportsNginxMap,
} from "../../seo/airportPages.ts";

const ORIGIN = "https://flight-arc.itsmigu.com";

// ⚠️ 測試資料（非真實）：名稱刻意含 < 與 & 以驗證 escape
const FIXTURE = {
  generatedAt: "2026-10-20T03:00:00.000Z",
  minFlights: 30,
  airports: [
    {
      icao: "RCTP", iata: "TPE", nameZh: "測試<桃園> & 機場", nameEn: "Test Taoyuan", city: "Taoyuan", country: "TW",
      lat: 25.08, lng: 121.23, flights: 1234, arr: 600, dep: 634,
      dates: ["2026-02-18", "2026-02-19", "2026-03-01"], fullDates: ["2026-02-18"],
      topRoutes: [
        { icao: "RJTT", arr: 20, dep: 30, total: 50 },
        { icao: "ZZZZ", arr: 1, dep: 2, total: 3 },
      ],
      topAirlines: [{ code: "EVA", count: 100 }, { code: "QQQ", count: 5 }],
      topAircraft: [{ type: "B77W", count: 80 }],
    },
    {
      icao: "RJTT", iata: "HND", nameZh: null, nameEn: "Test Haneda", city: null, country: "JP",
      lat: 35.55, lng: 139.78, flights: 99, arr: 50, dep: 49,
      dates: ["2026-02-18"], fullDates: [], topRoutes: [], topAirlines: [], topAircraft: [],
    },
  ],
};
const ctx = {
  origin: ORIGIN,
  names: {
    RCTP: { nameZh: FIXTURE.airports[0].nameZh, nameEn: "Test Taoyuan", iata: "TPE" },
    RJTT: { nameZh: null, nameEn: "Test Haneda", iata: "HND" },
    ZZZZ: { nameZh: null, nameEn: "No Page Airport", iata: null },
  },
  pageIcaos: new Set(["RCTP", "RJTT"]),
  generatedAt: FIXTURE.generatedAt,
};

describe("renderAirportPage", () => {
  const html = renderAirportPage(FIXTURE.airports[0], ctx);

  it("基本 SEO 元素", () => {
    assert.match(html, /<h1/);
    assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}/airports/rctp/" />`));
    assert.ok(html.includes('<html lang="zh-Hant-TW">'));
    assert.ok(html.includes(`${ORIGIN}/og-image.jpg`));
    assert.ok(html.includes('name="twitter:card"'));
    assert.ok(!html.includes("zeabur.app"));
    assert.ok(!/<script(?![^>]*ld\+json)/.test(html), "不可載入 JS");
  });

  it("JSON-LD 可解析，含 Airport 與 BreadcrumbList", () => {
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    const graph = JSON.parse(ld)["@graph"];
    const types = graph.map((g) => g["@type"]);
    assert.deepEqual(types, ["Airport", "BreadcrumbList"]);
    assert.equal(graph[0].icaoCode, "RCTP");
    assert.equal(graph[0].iataCode, "TPE");
    assert.equal(graph[0].address.addressCountry, "TW");
    assert.equal(graph[1].itemListElement.length, 3);
  });

  it("內容：資料截至、CTA、數字來自 entry", () => {
    assert.ok(html.includes("資料截至 2026-10-20"));
    assert.ok(html.includes('href="/?a=RCTP"'));
    assert.ok(html.includes("1,234"));
    assert.ok(html.includes("2026-02-18 至 2026-03-01"));
    assert.ok(html.includes("長榮航空"), "airlineDatabase 應可在 node 下使用");
    assert.ok(html.includes("QQQ"));
  });

  it("escape 生效", () => {
    assert.ok(!html.includes("測試<桃園>"));
    assert.ok(html.includes("測試&lt;桃園&gt; &amp; 機場"));
  });

  it("對端有頁用 <a>，沒頁不是", () => {
    assert.ok(html.includes('<a href="/airports/rjtt/">'));
    assert.ok(html.includes("No Page Airport"));
    assert.ok(!html.includes('href="/airports/zzzz/"'));
  });

  it("無 IATA／無城市時不報錯也不放空欄位", () => {
    const h = renderAirportPage({ ...FIXTURE.airports[1], iata: null }, ctx);
    assert.ok(h.includes("（RJTT）"));
    const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"][0];
    assert.ok(!("iataCode" in ld));
    assert.ok(!("addressLocality" in ld.address));
  });
});

describe("總覽／sitemap／nginx map", () => {
  it("總覽頁連到每座機場", () => {
    const html = renderAirportIndex(FIXTURE, ctx);
    assert.ok(html.includes('href="/airports/rctp/"'));
    assert.ok(html.includes('href="/airports/rjtt/"'));
    assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}/airports/" />`));
  });

  it("sitemap loc 皆為小寫 canonical 網址", () => {
    const xml = renderAirportsSitemap(FIXTURE, ctx);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.equal(locs.length, FIXTURE.airports.length + 1);
    for (const l of locs) {
      assert.ok(l.startsWith(`${ORIGIN}/airports/`), l);
      assert.equal(l, l.toLowerCase());
      assert.ok(l.endsWith("/"), l);
    }
    assert.ok(xml.includes("<lastmod>2026-10-20</lastmod>"));
  });

  it("nginx map 每座機場一行小寫 key（map 不分大小寫，重複 key 會讓 nginx 起不來）", () => {
    const map = renderAirportsNginxMap(FIXTURE);
    const lines = map.trim().split("\n");
    assert.equal(lines.length, FIXTURE.airports.length);
    assert.ok(lines.includes("rctp rctp;"));
    assert.equal(new Set(lines.map((l) => l.split(" ")[0])).size, lines.length);
    for (const l of lines) assert.ok(l.endsWith(";"), l);
  });
});

const DATA_PATH = "scripts/seo/airport-pages-data.json";
describe("airport-pages-data.json", { skip: !existsSync(DATA_PATH) && "資料檔尚未產生" }, () => {
  it("結構符合契約", () => {
    const d = JSON.parse(readFileSync(DATA_PATH, "utf8"));
    assert.ok(!Number.isNaN(Date.parse(d.generatedAt)));
    assert.ok(Array.isArray(d.airports) && d.airports.length > 0);
    for (const a of d.airports) {
      assert.ok(a.flights >= d.minFlights, `${a.icao} flights ${a.flights} < minFlights`);
      assert.match(a.icao, /^[A-Z0-9]{4}$/);
    }
  });
});
