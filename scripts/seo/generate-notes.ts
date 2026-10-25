/**
 * build 時（vite build 之後）產生 /notes/ 長文靜態頁。
 * 讀 content/notes/*.md（排除 README.md 與 *.sources.md），
 * 寫 dist/notes/<slug>/index.html、dist/notes/index.html、dist/notes/feed.xml、dist/sitemap-notes.xml。
 *
 * 用法：npx tsx scripts/seo/generate-notes.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFrontMatter,
  extractImageFiles,
  renderNote,
  renderNotesIndex,
  renderNotesRss,
  renderNotesSitemap,
  type NotePost,
} from "./notes";

const ORIGIN = "https://flight-arc.itsmigu.com";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = join(root, "dist");
const contentDir = join(root, "content/notes");

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

if (!existsSync(dist)) {
  console.error("找不到 dist/，請先跑 vite build 再執行本腳本");
  process.exit(1);
}

const files = existsSync(contentDir)
  ? readdirSync(contentDir)
      .filter((f) => f.endsWith(".md") && f !== "README.md" && !f.endsWith(".sources.md"))
      .sort()
  : [];

const ctx = { origin: ORIGIN };
const posts: NotePost[] = [];
const seen = new Set<string>();
for (const f of files) {
  const post = parseFrontMatter(readFileSync(join(contentDir, f), "utf8"), f);
  if (f !== `${post.meta.slug}.md`) throw new Error(`${f}: 檔名必須等於 slug（${post.meta.slug}.md）`);
  if (seen.has(post.meta.slug)) throw new Error(`${f}: slug 重複`);
  seen.add(post.meta.slug);
  const imgs = new Set(extractImageFiles(post.body));
  if (post.meta.cover) imgs.add(post.meta.cover);
  for (const img of imgs) {
    if (!existsSync(join(root, "public/notes", post.meta.slug, img))) {
      console.warn(`警告：${f} 引用的圖片 ${img} 不在 public/notes/${post.meta.slug}/`);
    }
  }
  posts.push(post);
}

for (const p of posts) write(join(dist, "notes", p.meta.slug, "index.html"), renderNote(p, ctx, posts));
write(join(dist, "notes", "index.html"), renderNotesIndex(posts, ctx));
write(join(dist, "notes", "feed.xml"), renderNotesRss(posts, ctx));
write(join(dist, "sitemap-notes.xml"), renderNotesSitemap(posts, ctx));

console.log(`長文：產出 ${posts.length} 篇 + /notes/ 列表 + feed.xml + sitemap-notes.xml`);
