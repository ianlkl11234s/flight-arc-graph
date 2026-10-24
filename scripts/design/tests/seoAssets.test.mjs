// node --import tsx --test scripts/design/tests/seoAssets.test.mjs（npm run design:test）
// SEO／AEO 速贏資產契約（照 mini-taiwan-pulse src/map/__tests__/seoAssets.test.ts）：
// 索引檔存在且互相一致，index.html 帶 canonical／og／JSON-LD／#root 靜態說明，nginx 缺檔回 404。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const ORIGIN = "https://flight-arc.itsmigu.com";
const read = (p) => readFileSync(p, "utf8");

describe("SEO／AEO 靜態資產", () => {
  it("robots.txt 允許全部、明示 AI 爬蟲並指向 sitemap", () => {
    const robots = read("public/robots.txt");
    assert.match(robots, /User-agent: \*\s+Allow: \//);
    for (const bot of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended"]) {
      assert.ok(robots.includes(`User-agent: ${bot}`), `缺 ${bot}`);
    }
    assert.ok(!/^Disallow: \/\s*$/m.test(robots), "不可整站 Disallow");
    // 具名群組不繼承 *：每一組都要擋軌跡原始檔路徑
    const groups = robots.split(/\n(?=User-agent: )/).filter((g) => g.startsWith("User-agent: "));
    for (const g of groups) {
      for (const path of ["/data/", "/tracks/", "/airspace/"]) {
        assert.ok(g.includes(`Disallow: ${path}`), `${g.split("\n")[0]} 缺 Disallow: ${path}`);
      }
    }
    assert.ok(robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`));
    assert.ok(robots.includes(`Sitemap: ${ORIGIN}/sitemap-airports.xml`));
  });

  it("sitemap.xml 列出首頁完整網址與 lastmod，且只放 canonical 網域", () => {
    const sm = read("public/sitemap.xml");
    assert.ok(sm.includes(`<loc>${ORIGIN}/</loc>`));
    assert.match(sm, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    for (const loc of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      assert.ok(loc[1].startsWith(`${ORIGIN}/`), `非 canonical 網域：${loc[1]}`);
      assert.ok(!loc[1].includes("?"), `query 狀態不是獨立頁：${loc[1]}`);
    }
  });

  it("llms.txt 依 llmstxt.org：H1、引言、H2 清單，數字標明時間點", () => {
    const llms = read("public/llms.txt");
    assert.ok(llms.startsWith("# Flight Arc\n"));
    assert.match(llms, /\n> \S/);
    assert.match(llms, /\n## \S/);
    assert.ok(llms.includes("https://github.com/ianlkl11234s/flight-arc-graph"));
    assert.match(llms, /截至 \d{4}-\d{2}-\d{2}/);
  });

  it("index.html：canonical、og、JSON-LD 可解析、#root 內有 h1", () => {
    const html = read("index.html");
    assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}/" />`));
    assert.match(html, /<meta name="description" content="[^"]{50,}"/);
    assert.ok(html.includes(`<meta property="og:url" content="${ORIGIN}/" />`));
    const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    assert.ok(ogImage?.startsWith(`${ORIGIN}/`), "og:image 要是完整網址");
    assert.ok(existsSync(`public/${ogImage.slice(ORIGIN.length + 1)}`), "og:image 檔案要在 public/");
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(ld, "缺 JSON-LD");
    const graph = JSON.parse(ld)["@graph"];
    assert.deepEqual(graph.map((g) => g["@type"]), ["WebSite", "WebApplication", "Person"]);
    assert.match(html, /<div id="root">[\s\S]*<h1[\s>]/);
    assert.ok(!html.includes("zeabur.app"), "canonical 以外的網域不可出現");
  });

  it("main.tsx 用 createRoot（靜態說明會被取代，不可改 hydrateRoot）", () => {
    const main = read("src/main.tsx");
    assert.ok(main.includes("createRoot("));
    assert.ok(!main.includes("hydrateRoot"));
  });

  it("nginx：有副檔名的缺檔回 404，不被 SPA fallback 吞成 200", () => {
    const conf = read("nginx.conf");
    assert.match(conf, /map \$uri \$spa_fallback \{[\s\S]*?default \/index\.html;[\s\S]*?@notfound;/);
    assert.match(conf, /location \/ \{\s*try_files \$uri \$uri\/ \$spa_fallback;/);
    assert.match(conf, /location @notfound \{\s*return 404;/);
    assert.match(conf, /^\s*charset utf-8;/m, "llms.txt 等中文文字檔要帶 charset");
  });
});
