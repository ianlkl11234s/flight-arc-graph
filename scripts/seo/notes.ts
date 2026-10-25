/**
 * 長文（/notes/）靜態頁的純函式渲染：不讀檔、不碰 DOM。
 * 讀檔與寫檔在 generate-notes.ts。規格見 content/notes/README.md。
 */
import { Marked, type Tokens } from "marked";
import { esc, jsonLd } from "./htmlShared";

export interface NoteMeta {
  title: string;
  description: string;
  slug: string;
  date: string;
  updated?: string;
  tags: string[];
  cover?: string;
  coverAlt?: string;
  mapLink?: string;
}
export interface NotePost {
  meta: NoteMeta;
  body: string;
}
export interface NotesContext {
  origin: string;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AUTHOR_URL = "https://mini-taiwan-pulse.itsmigu.com/blog/about/";
const len = (s: string) => [...s].length;

// ───────────────────────── front matter ─────────────────────────

function parseValue(raw: string): string | string[] {
  const v = raw.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(",").map((x) => unquote(x.trim())).filter(Boolean) : [];
  }
  return unquote(v);
}
function unquote(v: string): string {
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/** 解析 front matter（YAML 子集：字串、[a, b] 陣列、行尾 # 註解需前有空白）並驗證。 */
export function parseFrontMatter(src: string, file = "(unknown)"): NotePost {
  const fail = (msg: string): never => {
    throw new Error(`${file}: ${msg}`);
  };
  const m = src.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return fail("缺少 front matter（檔案需以 --- 開頭並以 --- 結束）");
  const raw: Record<string, string | string[]> = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const km = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!km) return fail(`front matter 無法解析：「${line}」`);
    // 去掉未被引號包住的行尾註解
    let val = km[2];
    if (!/^["']/.test(val.trim())) val = val.replace(/\s+#.*$/, "");
    raw[km[1]] = parseValue(val);
  }
  const str = (k: string, required: boolean): string | undefined => {
    const v = raw[k];
    if (v === undefined || v === "") {
      if (required) fail(`缺少必填欄位 ${k}`);
      return undefined;
    }
    if (Array.isArray(v)) return fail(`${k} 必須是字串`);
    return v;
  };
  const title = str("title", true)!;
  const description = str("description", true)!;
  const slug = str("slug", true)!;
  const date = str("date", true)!;
  const updated = str("updated", false);
  const cover = str("cover", false);
  const coverAlt = str("coverAlt", false);
  const mapLink = str("mapLink", false);
  if (!SLUG_RE.test(slug)) fail(`slug「${slug}」格式不符（只能小寫英數與連字號）`);
  if (len(title) > 32) fail(`title 超過 32 字（${len(title)}）`);
  if (len(description) > 120) fail(`description 超過 120 字（${len(description)}）`);
  if (!DATE_RE.test(date)) fail(`date「${date}」需為 YYYY-MM-DD`);
  if (updated && !DATE_RE.test(updated)) fail(`updated「${updated}」需為 YYYY-MM-DD`);
  if (cover && !coverAlt) fail("有 cover 必須有 coverAlt");
  if (mapLink && !mapLink.startsWith("/")) fail("mapLink 需為站內路徑（以 / 開頭）");
  const tagsRaw = raw.tags;
  if (tagsRaw !== undefined && !Array.isArray(tagsRaw)) fail("tags 需為 [a, b] 陣列");
  return {
    meta: { title, description, slug, date, updated, tags: (tagsRaw as string[] | undefined) ?? [], cover, coverAlt, mapLink },
    body: m[2],
  };
}

// ───────────────────────── markdown ─────────────────────────

const plainInline = (s: string) =>
  s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .trim();

/** 抓 `## 常見問題` 底下每個 `### 問題` 與其後文字（到下一個 ### 或 ## 為止）。 */
export function extractFaq(markdown: string): { question: string; answer: string }[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+常見問題\s*$/.test(l));
  if (start < 0) return [];
  const out: { question: string; answer: string }[] = [];
  let cur: { question: string; buf: string[] } | null = null;
  const flush = () => {
    if (cur) {
      const answer = plainInline(cur.buf.join(" ").replace(/\s+/g, " "));
      if (answer) out.push({ question: cur.question, answer });
    }
    cur = null;
  };
  for (const l of lines.slice(start + 1)) {
    if (/^##\s/.test(l)) break;
    const q = l.match(/^###\s+(.+?)\s*$/);
    if (q) {
      flush();
      cur = { question: plainInline(q[1]), buf: [] };
    } else if (cur) {
      cur.buf.push(l.trim());
    }
  }
  flush();
  return out;
}

/** 內文引用的本地圖片檔名（供 generator 檢查檔案是否存在） */
export function extractImageFiles(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g)) out.push(localImageName(m[1]));
  return out;
}

const isExternal = (href: string) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href);
function localImageName(href: string): string {
  return decodeURI(href.split(/[?#]/)[0].split("/").pop() ?? href);
}

interface Toc {
  id: string;
  text: string;
}

function renderBody(post: NotePost): { html: string; toc: Toc[] } {
  const { slug } = post.meta;
  const toc: Toc[] = [];
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      heading(this: any, t: Tokens.Heading) {
        const inner = this.parser.parseInline(t.tokens) as string;
        if (t.depth === 2) {
          const id = `s${toc.length + 1}`;
          toc.push({ id, text: plainInline(t.text) });
          return `<h2 id="${id}">${inner}</h2>\n`;
        }
        return `<h${t.depth}>${inner}</h${t.depth}>\n`;
      },
      image(t: Tokens.Image) {
        if (isExternal(t.href)) throw new Error(`${slug}: 不可使用外站圖片：${t.href}`);
        const src = `/notes/${slug}/${encodeURI(localImageName(t.href))}`;
        return `<figure><img src="${esc(src)}" alt="${esc(t.text)}" loading="lazy" /><figcaption>${esc(t.text)}</figcaption></figure>`;
      },
      link(this: any, t: Tokens.Link) {
        const inner = this.parser.parseInline(t.tokens) as string;
        const title = t.title ? ` title="${esc(t.title)}"` : "";
        const ext = /^(?:https?:)?\/\//i.test(t.href);
        const attrs = ext ? ' rel="noopener" target="_blank"' : "";
        return `<a href="${esc(t.href)}"${title}${attrs}>${inner}</a>`;
      },
      html(t: Tokens.HTML | Tokens.Tag) {
        return esc(t.text);
      },
    },
  });
  return { html: md.parse(post.body) as string, toc };
}

// ───────────────────────── pages ─────────────────────────

/** 長文版型照 Mini Taiwan Pulse /blog；皮膚用 Flight Arc 的 tokens（琥珀、2px 圓角）。 */
export const NOTES_STYLE = `
.notes-theme--dark{--notes-bg:#0b0d0f;--notes-fill:rgba(255,255,255,.05);--notes-text-strong:#e7ebee;--notes-text:#a2abb3;--notes-text-muted:#69727a;--notes-border:rgba(214,222,230,.16);--notes-border-soft:rgba(214,222,230,.08);--notes-accent:#f2a93b;--notes-accent-soft:rgba(242,169,59,.14);--notes-link:#f2a93b;color-scheme:dark}
.notes-theme--light{--notes-bg:#f8f9fa;--notes-fill:rgba(0,0,0,.04);--notes-text-strong:#10151a;--notes-text:#4c555d;--notes-text-muted:#7d868e;--notes-border:rgba(18,24,30,.18);--notes-border-soft:rgba(18,24,30,.09);--notes-accent:#a86200;--notes-accent-soft:rgba(168,98,0,.12);--notes-link:#a86200;color-scheme:light}
.notes{--notes-radius:2px;--notes-pill:99px;--notes-font:"PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;--notes-mono:ui-monospace,SFMono-Regular,Menlo,monospace;--notes-small:14px;--notes-body:17px;--notes-h3:19px;--notes-h2:23px;--notes-h1:32px;--notes-measure:36em;--notes-side:208px;--notes-gap:48px;--notes-wide:calc(var(--notes-side) + var(--notes-gap) + var(--notes-measure))}
.notes-theme--dark .notes-only-light,.notes-theme--light .notes-only-dark{display:none}
*{box-sizing:border-box}
html{scroll-padding-top:72px}
body.notes{margin:0;background:var(--notes-bg);color:var(--notes-text);font-family:var(--notes-font);font-size:var(--notes-body);line-height:1.85;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.notes a{color:var(--notes-link);text-underline-offset:3px}
.notes a:focus-visible,.notes button:focus-visible,.notes summary:focus-visible{outline:2px solid var(--notes-accent);outline-offset:2px}
.notes-nav{position:sticky;top:0;z-index:1;background:var(--notes-bg);border-bottom:1px solid var(--notes-border-soft)}
.notes-nav__inner,.notes-footer__inner{max-width:calc(var(--notes-wide) + 96px);margin:0 auto;padding:16px 48px;display:flex;align-items:center;gap:24px}
.notes-nav__back,.notes-nav__theme{font:inherit;font-size:var(--notes-small);line-height:1.6;white-space:nowrap;padding:2px 16px;border:1px solid var(--notes-border);border-radius:var(--notes-pill);background:var(--notes-fill)}
.notes-nav__back{text-decoration:none}
.notes-nav__theme{color:var(--notes-text);cursor:pointer}
.notes-nav__brand{color:var(--notes-text-strong)!important;text-decoration:none;font-weight:700;font-size:var(--notes-small);display:flex;align-items:baseline;gap:12px;min-width:0}
.notes-nav__brand span{color:var(--notes-text-muted);font-weight:400;font-family:var(--notes-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.notes-nav__links{margin-left:auto;display:flex;gap:24px;font-size:var(--notes-small)}
.notes-nav__links a{color:var(--notes-text-muted);text-decoration:none}
.notes-nav__links a:hover{color:var(--notes-text-strong)}
.notes-main{padding:48px 48px 0}
.notes-main--post{max-width:calc(var(--notes-wide) + 96px);margin:0 auto;display:grid;grid-template-columns:var(--notes-side) minmax(0,var(--notes-measure));gap:var(--notes-gap);align-items:start}
.notes-main--wide .notes-listing{max-width:var(--notes-wide);margin:0 auto}
.notes-article{min-width:0}
.notes-article--solo{max-width:var(--notes-measure);margin:0 auto}
.notes-side{position:sticky;top:72px;max-height:calc(100vh - 96px);overflow-y:auto;display:flex;flex-direction:column;gap:32px;padding-top:4px;font-size:var(--notes-small);line-height:1.6}
.notes-side__toc summary,.notes-side__title{margin:0 0 12px;color:var(--notes-text-strong);font-weight:600;list-style:none}
.notes-side__toc summary{cursor:default}
.notes-side__toc summary::-webkit-details-marker{display:none}
.notes-side ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;border-left:1px solid var(--notes-border)}
.notes-side ol a{display:block;padding:4px 0 4px 16px;margin-left:-1px;border-left:2px solid transparent;color:var(--notes-text-muted);text-decoration:none}
.notes-side ol a:hover{color:var(--notes-text-strong)}
.notes-side ol a[aria-current="true"]{color:var(--notes-accent);border-left-color:var(--notes-accent)}
.notes-share{display:flex;flex-wrap:wrap;gap:12px}
.notes-share-end{display:none;margin-top:2.4em;font-size:var(--notes-small)}
.notes-share a,.notes-share button{font:inherit;font-size:var(--notes-small);line-height:1.6;color:var(--notes-text);text-decoration:none;padding:2px 16px;border:1px solid var(--notes-border);border-radius:var(--notes-pill);background:var(--notes-fill);cursor:pointer}
.notes-share a:hover,.notes-share button:hover{border-color:var(--notes-accent);color:var(--notes-text-strong)}
.notes-crumb{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:var(--notes-small);color:var(--notes-text-muted)}
.notes-crumb a{text-decoration:none}
.notes-tag{padding:0 12px;border:1px solid var(--notes-border);border-radius:var(--notes-pill);line-height:1.7}
.notes-article h1,.notes-listing h1{margin:16px 0;font-size:var(--notes-h1);line-height:1.35;color:var(--notes-text-strong);text-wrap:balance;letter-spacing:.01em}
.notes-byline{margin:0;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:var(--notes-small);color:var(--notes-text-muted)}
.notes-byline__name{color:var(--notes-text-strong)!important;font-weight:600;text-decoration:none}
.notes-cover{margin:32px 0}
.notes-cover img,.notes-prose figure img{display:block;width:100%;height:auto;border-radius:var(--notes-radius);border:1px solid var(--notes-border);background:var(--notes-fill)}
.notes-cover figcaption,.notes-prose figcaption{margin-top:12px;font-size:var(--notes-small);color:var(--notes-text-muted);line-height:1.6}
.notes-open{display:inline-block;margin:0 0 8px;font-size:var(--notes-small);font-weight:600;text-decoration:none;padding:8px 16px;border-radius:var(--notes-radius);border:1px solid var(--notes-accent);background:var(--notes-accent-soft)}
.notes-prose{color:var(--notes-text);margin-top:24px}
.notes-prose p,.notes-prose ul,.notes-prose ol{margin:0 0 1.1em}
.notes-prose li+li{margin-top:.35em}
.notes-prose h2{margin:2em 0 .7em;font-size:var(--notes-h2);line-height:1.4;color:var(--notes-text-strong);text-wrap:balance}
.notes-prose h3{margin:1.6em 0 .5em;font-size:var(--notes-h3);line-height:1.45;color:var(--notes-text-strong)}
.notes-prose strong{color:var(--notes-text-strong)}
.notes-prose blockquote{margin:0 0 1.1em;padding:4px 0 4px 24px;border-left:2px solid var(--notes-accent);color:var(--notes-text-muted)}
.notes-prose code{font-family:var(--notes-mono);font-size:.88em;padding:.1em .35em;border-radius:var(--notes-radius);background:var(--notes-fill)}
.notes-prose hr{border:0;border-top:1px solid var(--notes-border);margin:2em 0}
.notes-prose figure{margin:1.6em 0}
.notes-prose table{width:100%;border-collapse:collapse;font-size:var(--notes-small);display:block;overflow-x:auto}
.notes-prose th,.notes-prose td{padding:6px 10px;border-bottom:1px solid var(--notes-border);text-align:left}
.notes-disclaimer{margin-top:2.4em;font-size:var(--notes-small);color:var(--notes-text-muted)}
.notes-author{margin-top:2.4em;padding-top:24px;border-top:1px solid var(--notes-border);font-size:var(--notes-small);color:var(--notes-text-muted)}
.notes-author p{margin:0 0 4px}
.notes-author__name{font-weight:600;display:flex;gap:12px;align-items:baseline}
.notes-author__name a{color:var(--notes-text-strong);text-decoration:none}
.notes-author__name span{font-weight:400}
.notes-pager{margin-top:2.4em;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.notes-pager a{display:flex;flex-direction:column;gap:2px;padding:16px 24px;border:1px solid var(--notes-border);border-radius:var(--notes-radius);color:var(--notes-text-strong);text-decoration:none;font-size:var(--notes-small);line-height:1.5}
.notes-pager a:hover{border-color:var(--notes-accent)}
.notes-pager span{color:var(--notes-text-muted)}
.notes-pager__next{text-align:right}
.notes-related{margin-top:2.4em}
.notes-related h2{margin:0 0 12px;font-size:var(--notes-small);color:var(--notes-text-strong)}
.notes-cards{list-style:none;margin:0;padding:0}
.notes-cards--grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:24px}
.notes-card a{display:flex;flex-direction:column;gap:8px;text-decoration:none;color:inherit}
.notes-card__media img,.notes-card__ph,.notes-hero__media img{display:block;width:100%;aspect-ratio:16/9;height:auto;object-fit:cover;border-radius:var(--notes-radius);border:1px solid var(--notes-border);background:var(--notes-fill)}
.notes-card__meta{margin:0;display:flex;flex-wrap:wrap;gap:12px;font-size:var(--notes-small);color:var(--notes-text-muted)}
.notes-card h3{margin:0;font-size:var(--notes-body);line-height:1.5;color:var(--notes-text-strong)}
.notes-card a:hover h3,.notes-hero:hover h2{color:var(--notes-link)}
.notes-listing__lead{margin:0 0 24px;color:var(--notes-text-muted)}
.notes-hero{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:32px;align-items:center;text-decoration:none;color:inherit;margin-bottom:48px}
.notes-hero h2{margin:8px 0;font-size:var(--notes-h2);line-height:1.4;color:var(--notes-text-strong);text-wrap:balance}
.notes-hero__text>p:last-child{margin:0;font-size:var(--notes-small);color:var(--notes-text-muted)}
.notes-footer{margin-top:64px;border-top:1px solid var(--notes-border-soft)}
.notes-footer__inner{justify-content:space-between;flex-wrap:wrap;font-size:var(--notes-small);color:var(--notes-text-muted)}
@media (max-width:960px){
.notes-main--post{grid-template-columns:minmax(0,1fr);gap:24px;max-width:calc(var(--notes-measure) + 96px)}
.notes-side{position:static;max-height:none;overflow:visible;gap:16px}
.notes-side__toc{border:1px solid var(--notes-border);border-radius:var(--notes-radius);padding:12px 16px}
.notes-side__toc summary{margin:0;cursor:pointer}
.notes-side__toc[open] summary{margin-bottom:12px}
.notes-side__share{display:none}
.notes-share-end{display:block}
}
@media (max-width:640px){
.notes-main{padding:24px 16px 0}
.notes-nav__inner,.notes-footer__inner{padding:12px 16px;gap:16px}
.notes-nav__brand span,.notes-nav__links{display:none}
.notes-nav__theme{margin-left:auto}
.notes-article h1,.notes-listing h1{font-size:26px}
.notes-hero{grid-template-columns:1fr;gap:12px}
.notes-pager{grid-template-columns:1fr}
.notes-pager__next{text-align:left}
}
`.trim();

function head(o: {
  title: string;
  description: string;
  url: string;
  origin: string;
  image: string;
  type: "article" | "website";
  ld: unknown;
}): string {
  const t = esc(o.title);
  const d = esc(o.description);
  const u = esc(o.url);
  return `<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
<link rel="canonical" href="${u}" />
<meta name="description" content="${d}" />
<meta name="color-scheme" content="dark light" />
<meta property="og:type" content="${o.type}" />
<meta property="og:title" content="${t}" />
<meta property="og:url" content="${u}" />
<meta property="og:site_name" content="Flight Arc" />
<meta property="og:description" content="${d}" />
<meta property="og:locale" content="zh_TW" />
<meta property="og:image" content="${esc(o.image)}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="alternate" type="application/rss+xml" title="Flight Arc 長文" href="${esc(o.origin)}/notes/feed.xml" />
<script src="/notes/notes.js"></script>
<script type="application/ld+json">
${jsonLd(o.ld)}
</script>
<style>
${NOTES_STYLE}
</style>
</head>`;
}

const noteUrl = (ctx: NotesContext, slug: string) => `${ctx.origin}/notes/${slug}/`;
const notePath = (slug: string) => `/notes/${slug}/`;
const sortPosts = (posts: NotePost[]) =>
  [...posts].sort((a, b) => b.meta.date.localeCompare(a.meta.date) || a.meta.slug.localeCompare(b.meta.slug));

/** 中文長文約每分鐘 450 字；英數單字另計。 */
export function readingMinutes(markdown: string): number {
  const cjk = (markdown.match(/[㐀-鿿]/g) ?? []).length;
  const words = (markdown.replace(/[㐀-鿿]/g, " ").match(/[A-Za-z0-9]+/g) ?? []).length;
  return Math.max(1, Math.round(cjk / 450 + words / 220));
}

function formatDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${y} 年 ${Number(m)} 月 ${Number(day)} 日`;
}

function topNav(): string {
  return `
<header class="notes-nav">
<div class="notes-nav__inner">
<a class="notes-nav__back" href="/">← 回到地圖</a>
<a class="notes-nav__brand" href="/notes/">長文<span>Flight Arc</span></a>
<nav class="notes-nav__links" aria-label="長文"><a href="/notes/">文章</a><a href="/airports/">機場</a></nav>
<button class="notes-nav__theme" type="button" data-theme-toggle aria-label="切換淺色／深色">淺色</button>
</div>
</header>`;
}

function footer(): string {
  return `
<footer class="notes-footer">
<div class="notes-footer__inner">
<span>© Migu · <a href="/">Flight Arc 首頁</a></span>
<span><a href="/notes/">所有長文</a> · <a href="/notes/feed.xml">RSS</a> · <a href="/airports/">機場總覽</a></span>
</div>
</footer>`;
}

function shareLinks(ctx: NotesContext, meta: NoteMeta): string {
  const u = noteUrl(ctx, meta.slug);
  const url = encodeURIComponent(u);
  const text = encodeURIComponent(`${meta.title} ${u}`);
  return `<div class="notes-share">
<a href="https://www.threads.net/intent/post?text=${text}" rel="noopener" target="_blank">Threads</a>
<a href="https://social-plugins.line.me/lineit/share?url=${url}" rel="noopener" target="_blank">LINE</a>
<button type="button" data-copy-link="${esc(u)}">複製連結</button>
</div>`;
}

const coverSrc = (m: NoteMeta) => (m.cover ? `/notes/${m.slug}/${encodeURI(m.cover)}` : "");
function cardImg(m: NoteMeta): string {
  return m.cover
    ? `<img src="${esc(coverSrc(m))}" alt="" width="1600" height="900" loading="lazy" decoding="async" />`
    : `<span class="notes-card__ph"></span>`;
}
function postCard(p: NotePost): string {
  const m = p.meta;
  return `<li class="notes-card"><a href="${notePath(esc(m.slug))}"><div class="notes-card__media">${cardImg(m)}</div>
<p class="notes-card__meta"><time datetime="${m.date}">${formatDate(m.date)}</time></p>
<h3>${esc(m.title)}</h3></a></li>`;
}

/** 上一篇＝較早的那篇，下一篇＝較新的那篇；posts 需已依日期新到舊排序。 */
function neighbors(sorted: NotePost[], slug: string): { prev?: NotePost; next?: NotePost } {
  const i = sorted.findIndex((p) => p.meta.slug === slug);
  if (i < 0) return {};
  return { prev: sorted[i + 1], next: i > 0 ? sorted[i - 1] : undefined };
}

export function renderNote(post: NotePost, ctx: NotesContext, allPosts: NotePost[] = [post]): string {
  const { meta } = post;
  const { origin } = ctx;
  const url = noteUrl(ctx, meta.slug);
  const { html, toc } = renderBody(post);
  const faq = extractFaq(post.body);
  const image = meta.cover ? `${origin}/notes/${meta.slug}/${encodeURI(meta.cover)}` : `${origin}/og-image.jpg`;

  const graph: unknown[] = [
    {
      "@type": "BlogPosting",
      "@id": `${url}#post`,
      headline: meta.title,
      description: meta.description,
      datePublished: meta.date,
      dateModified: meta.updated ?? meta.date,
      inLanguage: "zh-Hant-TW",
      author: { "@type": "Person", name: "Migu", url: AUTHOR_URL },
      image,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      ...(meta.tags.length ? { keywords: meta.tags.join(", ") } : {}),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Flight Arc", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "長文", item: `${origin}/notes/` },
        { "@type": "ListItem", position: 3, name: meta.title, item: url },
      ],
    },
  ];
  if (faq.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }
  const ld = { "@context": "https://schema.org", "@graph": graph };

  const sorted = sortPosts(allPosts.some((p) => p.meta.slug === meta.slug) ? allPosts : [post, ...allPosts]);
  const { prev, next } = neighbors(sorted, meta.slug);
  const related = sorted.filter((p) => p.meta.slug !== meta.slug).slice(0, 3);

  const updated = meta.updated && meta.updated !== meta.date
    ? `<span>更新於 <time datetime="${meta.updated}">${formatDate(meta.updated)}</time></span>`
    : "";
  const cover = meta.cover
    ? `\n<figure class="notes-cover"><img src="${esc(coverSrc(meta))}" alt="${esc(meta.coverAlt ?? "")}" width="1600" height="900" decoding="async" fetchpriority="high" /><figcaption>${esc(meta.coverAlt ?? "")}</figcaption></figure>`
    : "";
  const cta = meta.mapLink ? `\n<p><a class="notes-open" href="${esc(meta.mapLink)}">在 3D 地圖上看</a></p>` : "";
  const tocList = toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("");
  const pager = prev || next
    ? `
<nav class="notes-pager" aria-label="上一篇與下一篇">
${prev ? `<a class="notes-pager__prev" href="${notePath(esc(prev.meta.slug))}"><span>← 上一篇</span>${esc(prev.meta.title)}</a>` : "<span></span>"}
${next ? `<a class="notes-pager__next" href="${notePath(esc(next.meta.slug))}"><span>下一篇 →</span>${esc(next.meta.title)}</a>` : "<span></span>"}
</nav>`
    : "";
  const relatedBlock = related.length
    ? `
<section class="notes-related">
<h2>相關文章</h2>
<ul class="notes-cards notes-cards--grid">${related.map(postCard).join("\n")}
</ul>
</section>`
    : "";

  return `<!doctype html>
<html lang="zh-Hant-TW" class="notes-theme--dark">
${head({ title: `${meta.title}｜Flight Arc`, description: meta.description, url, origin, image, type: "article", ld })}
<body class="notes">${topNav()}
<main class="notes-main notes-main--post">
<aside class="notes-side" aria-label="本文目錄">
<details class="notes-side__toc" open>
<summary>本文目錄</summary>
<ol data-toc>${tocList}</ol>
</details>
<div class="notes-side__share">
<p class="notes-side__title">分享</p>
${shareLinks(ctx, meta)}
</div>
</aside>
<article class="notes-article">
<nav class="notes-crumb" aria-label="麵包屑"><a href="/notes/">長文</a>${meta.tags.map((t) => `<span class="notes-tag">${esc(t)}</span>`).join("")}</nav>
<h1>${esc(meta.title)}</h1>
<p class="notes-byline">
<a class="notes-byline__name" href="${AUTHOR_URL}" rel="noopener" target="_blank">Migu</a>
<time datetime="${meta.date}">${formatDate(meta.date)}</time>${updated}
<span>約 ${readingMinutes(post.body)} 分鐘</span>
</p>${cover}${cta}
<div class="notes-prose">
${html}</div>
<p class="notes-disclaimer">航班資料來源：FlightRadar24 API。數字為 Flight Arc 收錄的航班，並非完整營運量；時間為台灣時間（UTC+8）。</p>
<div class="notes-share-end"><p class="notes-side__title">分享這篇</p>${shareLinks(ctx, meta)}</div>
<aside class="notes-author">
<p class="notes-author__name"><a href="${AUTHOR_URL}" rel="noopener" target="_blank">Migu</a><span>Flight Arc 作者</span></p>
<p>做 Flight Arc 的人，用航班軌跡資料看機場與航線發生的事。</p>
</aside>${pager}${relatedBlock}
</article>
</main>${footer()}
</body>
</html>
`;
}

export function renderNotesIndex(posts: NotePost[], ctx: NotesContext): string {
  const { origin } = ctx;
  const url = `${origin}/notes/`;
  const title = "長文｜Flight Arc";
  const description = "用 Flight Arc 的航班軌跡資料寫成的長文：颱風、機場與航線的故事，附 3D 地圖連結。";
  const sorted = sortPosts(posts);
  const [featured, ...rest] = sorted;
  const hero = featured
    ? `
<a class="notes-hero" href="${notePath(esc(featured.meta.slug))}">
<div class="notes-hero__media">${cardImg(featured.meta)}</div>
<div class="notes-hero__text">
<p class="notes-card__meta"><span>最新</span><time datetime="${featured.meta.date}">${formatDate(featured.meta.date)}</time></p>
<h2>${esc(featured.meta.title)}</h2>
<p>${esc(featured.meta.description)}</p>
</div>
</a>`
    : `\n<p>尚無文章。</p>`;
  const grid = rest.length ? `\n<ul class="notes-cards notes-cards--grid">${rest.map(postCard).join("\n")}\n</ul>` : "";
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Flight Arc", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "長文", item: url },
        ],
      },
    ],
  };
  return `<!doctype html>
<html lang="zh-Hant-TW" class="notes-theme--dark">
${head({ title, description, url, origin, image: `${origin}/og-image.jpg`, type: "website", ld })}
<body class="notes">${topNav()}
<main class="notes-main notes-main--wide">
<div class="notes-listing">
<h1>長文</h1>
<p class="notes-listing__lead">${esc(description)}</p>${hero}${grid}
</div>
</main>${footer()}
</body>
</html>
`;
}

export function renderNotesRss(posts: NotePost[], ctx: NotesContext): string {
  const { origin } = ctx;
  const sorted = sortPosts(posts);
  const pub = (d: string) => new Date(`${d}T00:00:00+08:00`).toUTCString();
  const items = sorted
    .map((p) => {
      const u = noteUrl(ctx, p.meta.slug);
      return `    <item>
      <title>${esc(p.meta.title)}</title>
      <link>${esc(u)}</link>
      <guid isPermaLink="true">${esc(u)}</guid>
      <pubDate>${pub(p.meta.date)}</pubDate>
      <description>${esc(p.meta.description)}</description>
    </item>`;
    })
    .join("\n");
  const last = sorted[0] ? pub(sorted[0].meta.updated ?? sorted[0].meta.date) : pub("1970-01-01");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Flight Arc 長文</title>
    <link>${esc(origin)}/notes/</link>
    <description>用航班軌跡資料寫成的長文</description>
    <language>zh-Hant-TW</language>
    <lastBuildDate>${last}</lastBuildDate>
    <atom:link href="${esc(origin)}/notes/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

export function renderNotesSitemap(posts: NotePost[], ctx: NotesContext): string {
  const sorted = sortPosts(posts);
  const entries = [
    { loc: `${ctx.origin}/notes/`, lastmod: sorted[0] ? (sorted[0].meta.updated ?? sorted[0].meta.date) : undefined },
    ...sorted.map((p) => ({ loc: noteUrl(ctx, p.meta.slug), lastmod: p.meta.updated ?? p.meta.date })),
  ];
  const urls = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${esc(e.loc)}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ""}\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
