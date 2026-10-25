// node --import tsx --test scripts/design/tests/notes.test.mjs（npm run design:test）
// 長文（/notes/）靜態頁的渲染契約。fixture 為測試用假文章。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  parseFrontMatter,
  renderNote,
  extractFaq,
  renderNotesIndex,
  renderNotesRss,
  renderNotesSitemap,
} from "../../seo/notes.ts";

const ORIGIN = "https://flight-arc.itsmigu.com";
const ctx = { origin: ORIGIN };

const fm = (over = {}) => {
  const base = {
    title: "測試文章 <b>",
    description: "這是一篇 & 測試",
    slug: "test-post",
    date: "2026-10-25",
    tags: "[颱風, 桃園機場]",
    mapLink: "/?a=RCTP&d=2026-07-11",
    ...over,
  };
  return (
    "---\n" +
    Object.entries(base)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n") +
    "\n---\n"
  );
};

const BODY = `開頭直接回答結論。

## 第一節

內文 UNIQUE_BODY_TEXT，[站內](/?a=RCTP) 與 [外部](https://example.com/x)。

![航跡示意 <圖>](pic.jpg)

### 小節

## 第二節

更多內容。

## 常見問題

### 為什麼會這樣？

因為 **原因**，詳見 [說明](https://example.com)。
第二行。

### 第二題？

第二題的答案。

## 資料與方法

資料來源 FlightRadar24。
`;

const post = (over = {}, body = BODY) => parseFrontMatter(fm(over) + body, "test-post.md");

describe("parseFrontMatter", () => {
  it("解析字串與陣列", () => {
    const p = post({ updated: "2026-10-30" });
    assert.equal(p.meta.slug, "test-post");
    assert.deepEqual(p.meta.tags, ["颱風", "桃園機場"]);
    assert.equal(p.meta.updated, "2026-10-30");
    assert.ok(p.body.startsWith("開頭"));
  });
  it("行尾註解被忽略", () => {
    const p = parseFrontMatter("---\ntitle: T  # 註解\ndescription: D\nslug: a-b\ndate: 2026-01-01\n---\nx", "a-b.md");
    assert.equal(p.meta.title, "T");
  });
  it("缺必填欄位 throw 且帶檔名", () => {
    assert.throws(() => parseFrontMatter(fm({ title: null }) + "x", "foo.md"), /foo\.md.*title/);
    assert.throws(() => parseFrontMatter("沒有 front matter", "bar.md"), /bar\.md/);
  });
  it("slug 格式", () => {
    assert.throws(() => post({ slug: "Bad_Slug" }), /slug/);
    assert.throws(() => post({ slug: "-bad" }), /slug/);
  });
  it("title ≤32、description ≤120", () => {
    assert.doesNotThrow(() => post({ title: "字".repeat(32) }));
    assert.throws(() => post({ title: "字".repeat(33) }), /title/);
    assert.doesNotThrow(() => post({ description: "字".repeat(120) }));
    assert.throws(() => post({ description: "字".repeat(121) }), /description/);
  });
  it("date 格式", () => {
    assert.throws(() => post({ date: "2026/10/25" }), /date/);
  });
  it("有 cover 必須有 coverAlt", () => {
    assert.throws(() => post({ cover: "cover.jpg" }), /coverAlt/);
    assert.doesNotThrow(() => post({ cover: "cover.jpg", coverAlt: "封面" }));
  });
});

describe("renderNote", () => {
  const html = renderNote(post(), ctx);

  it("h2 加 id 並收進目錄（不含 h3）", () => {
    assert.match(html, /<h2 id="s1">第一節<\/h2>/);
    assert.match(html, /<h2 id="s2">第二節<\/h2>/);
    assert.match(html, /<a href="#s1">第一節<\/a>/);
    assert.ok(!html.includes('href="#s1">小節'));
    assert.match(html, /<h3>小節<\/h3>/);
    assert.doesNotMatch(html, /<a href="#[^"]*">小節<\/a>/);
  });
  it("全文出現在 HTML", () => {
    assert.ok(html.includes("UNIQUE_BODY_TEXT"));
    assert.ok(html.includes("資料來源 FlightRadar24"));
  });
  it("圖片包 figure/figcaption，src 改為 /notes/<slug>/", () => {
    assert.match(html, /<figure><img src="\/notes\/test-post\/pic\.jpg" alt="航跡示意 &lt;圖&gt;"/);
    assert.match(html, /<figcaption>航跡示意 &lt;圖&gt;<\/figcaption>/);
  });
  it("外站圖片 throw", () => {
    assert.throws(() => renderNote(post({}, "![x](https://evil.com/a.jpg)"), ctx), /外站圖片/);
    assert.throws(() => renderNote(post({}, "![x](//evil.com/a.jpg)"), ctx), /外站圖片/);
  });
  it("外部連結 noopener＋_blank，站內連結不加", () => {
    assert.match(html, /<a href="https:\/\/example\.com\/x" rel="noopener" target="_blank">外部<\/a>/);
    assert.match(html, /<a href="\/\?a=RCTP">站內<\/a>/);
  });
  it("canonical、og、mapLink", () => {
    assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}/notes/test-post/" />`));
    assert.ok(html.includes(`content="${ORIGIN}/og-image.jpg"`));
    assert.match(html, /<meta name="twitter:card"/);
    assert.match(html, /href="\/\?a=RCTP&amp;d=2026-07-11">在 3D 地圖上看/);
  });
  it("有 cover 時 og:image 用 cover 完整網址", () => {
    const h = renderNote(post({ cover: "cover.jpg", coverAlt: "封面" }), ctx);
    assert.ok(h.includes(`property="og:image" content="${ORIGIN}/notes/test-post/cover.jpg"`));
  });
  it("JSON-LD 可 parse，含 BlogPosting、BreadcrumbList、FAQPage", () => {
    const m = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/);
    const ld = JSON.parse(m[1]);
    const types = ld["@graph"].map((x) => x["@type"]);
    assert.deepEqual(types, ["BlogPosting", "BreadcrumbList", "FAQPage"]);
    const bp = ld["@graph"][0];
    assert.equal(bp.author.name, "Migu");
    assert.equal(bp.datePublished, "2026-10-25");
    assert.equal(bp.dateModified, "2026-10-25");
    assert.equal(bp.mainEntityOfPage["@id"], `${ORIGIN}/notes/test-post/`);
    const crumbs = ld["@graph"][1].itemListElement;
    assert.equal(crumbs.length, 3);
    assert.equal(crumbs[1].item, `${ORIGIN}/notes/`);
    assert.equal(ld["@graph"][2].mainEntity.length, 2);
  });
  it("無 FAQ 時不產生 FAQPage", () => {
    const h = renderNote(post({}, "## 一\n\n內容\n"), ctx);
    assert.ok(!h.includes("FAQPage"));
  });
  it("escape：標題與描述中的 < & 不外洩", () => {
    assert.ok(!html.includes("<b>"));
    assert.ok(html.includes("測試文章 &lt;b&gt;"));
    assert.ok(html.includes("這是一篇 &amp; 測試"));
  });
  it("JSON-LD 內 < 被跳脫、內文 raw HTML 被 escape", () => {
    const h = renderNote(post({ title: "a</script>b" }, "## 一\n\n<script>alert(1)</script>\n"), ctx);
    assert.equal(h.split("</script>").length - 1, 2); // 只剩 notes.js 與 JSON-LD 自己的結尾
    assert.ok(!h.includes("<script>alert"));
  });
});

describe("renderNote 版型（照 Pulse /blog）", () => {
  const a = post({ slug: "post-a", date: "2026-10-01", title: "甲" });
  const b = post({ slug: "post-b", date: "2026-10-20", title: "乙" });
  const c = post({ slug: "post-c", date: "2026-10-10", title: "丙" });
  const html = renderNote(a, ctx, [a, b, c]);

  it("側欄 aside 含 data-toc 目錄（只收 h2）與分享", () => {
    assert.match(html, /<aside class="notes-side"/);
    assert.match(html, /<ol data-toc>/);
    assert.match(html, /data-copy-link="https:\/\/flight-arc\.itsmigu\.com\/notes\/post-a\/"/);
    assert.match(html, /threads\.net\/intent\/post/);
    assert.match(html, /social-plugins\.line\.me/);
  });
  it("頁首：回地圖連結、品牌、文章／機場連結、主題鈕", () => {
    assert.match(html, /<a class="notes-nav__back" href="\/">← 回到地圖<\/a>/);
    assert.match(html, /<a href="\/notes\/">文章<\/a><a href="\/airports\/">機場<\/a>/);
    assert.match(html, /data-theme-toggle/);
    assert.match(html, /\/notes\/feed\.xml">RSS</);
  });
  it("主題預設深色、notes.js 在 head 同步載入", () => {
    assert.match(html, /<html lang="zh-Hant-TW" class="notes-theme--dark">/);
    assert.match(html, /<meta name="color-scheme" content="dark light" \/>/);
    const headPart = html.slice(0, html.indexOf("</head>"));
    assert.match(headPart, /<script src="\/notes\/notes\.js"><\/script>/);
  });
  it("byline 有作者、日期、閱讀時間；相關文章與上下篇", () => {
    assert.match(html, /約 \d+ 分鐘/);
    assert.match(html, /<nav class="notes-pager"/);
    assert.match(html, /← 上一篇|下一篇 →/);
    assert.match(html, /<section class="notes-related">/);
  });
  it("只有 1 篇時不產生 pager 與 related", () => {
    const h = renderNote(a, ctx);
    assert.doesNotMatch(h, /<nav class="notes-pager"/);
    assert.doesNotMatch(h, /<section class="notes-related"/);
  });
  it("上一篇＝較早、下一篇＝較新", () => {
    const h = renderNote(c, ctx, [a, b, c]);
    assert.match(h, /notes-pager__prev" href="\/notes\/post-a\/"/);
    assert.match(h, /notes-pager__next" href="\/notes\/post-b\/"/);
  });
});

describe("extractFaq", () => {
  it("抽出問題與答案（到下一個 ### 或 ## 為止，去 markdown 標記）", () => {
    const faq = extractFaq(BODY);
    assert.equal(faq.length, 2);
    assert.equal(faq[0].question, "為什麼會這樣？");
    assert.equal(faq[0].answer, "因為 原因，詳見 說明。 第二行。");
    assert.equal(faq[1].answer, "第二題的答案。");
  });
  it("沒有常見問題節回傳空陣列", () => {
    assert.deepEqual(extractFaq("## 一\n\n內容"), []);
  });
});

describe("列表 / RSS / sitemap", () => {
  const a = post({ slug: "post-a", date: "2026-10-01", title: "甲" });
  const b = post({ slug: "post-b", date: "2026-10-20", title: "乙", updated: "2026-10-24" });
  const posts = [a, b];

  it("列表依日期新到舊，含標題與描述", () => {
    const h = renderNotesIndex(posts, ctx);
    assert.ok(h.indexOf("乙") < h.indexOf("甲"));
    assert.ok(h.includes("/notes/post-b/"));
    assert.ok(h.includes("這是一篇 &amp; 測試"));
  });
  it("列表頁有 hero（最新一篇、含描述）與卡片 grid，無主題分頁", () => {
    const h = renderNotesIndex(posts, ctx);
    assert.match(h, /<a class="notes-hero" href="\/notes\/post-b\/">/);
    assert.match(h, /<ul class="notes-cards notes-cards--grid">/);
    assert.ok(h.indexOf("<a class=\"notes-hero\"") < h.indexOf("<ul class=\"notes-cards"));
    assert.doesNotMatch(h, /notes-tabs/);
    assert.match(h, /<script src="\/notes\/notes\.js"><\/script>/);
  });
  it("0 篇時顯示尚無文章", () => {
    assert.ok(renderNotesIndex([], ctx).includes("尚無文章"));
  });
  it("sitemap：loc 皆以 /notes/ 開頭並以 / 結尾，lastmod = updated ?? date", () => {
    const x = renderNotesSitemap(posts, ctx);
    const locs = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.equal(locs.length, 3);
    for (const l of locs) {
      assert.ok(l.startsWith(`${ORIGIN}/notes/`), l);
      assert.ok(l.endsWith("/"), l);
    }
    assert.match(x, /post-b\/<\/loc>\s*<lastmod>2026-10-24</);
    assert.match(x, /post-a\/<\/loc>\s*<lastmod>2026-10-01</);
  });
  it("0 篇 sitemap 只含 /notes/", () => {
    const locs = [...renderNotesSitemap([], ctx).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(locs, [`${ORIGIN}/notes/`]);
  });
  it("RSS 基本結構", () => {
    const x = renderNotesRss(posts, ctx);
    assert.match(x, /<rss version="2\.0"/);
    assert.equal(x.match(/<item>/g).length, 2);
    assert.equal(x.match(/<\/item>/g).length, 2);
    assert.ok(x.includes(`<link>${ORIGIN}/notes/post-a/</link>`));
    assert.match(x, /<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}/);
  });
});

describe("content/notes 實際文章", () => {
  const dir = new URL("../../../content/notes/", import.meta.url);
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md" && !f.endsWith(".sources.md"))
    : [];
  if (files.length === 0) it("尚無文章，略過", { skip: true }, () => {});
  for (const f of files) {
    it(`${f} front matter 通過驗證且檔名等於 slug`, () => {
      const p = parseFrontMatter(readFileSync(new URL(f, dir), "utf8"), f);
      assert.equal(`${p.meta.slug}.md`, f);
      assert.doesNotThrow(() => renderNote(p, ctx));
    });
  }
});
