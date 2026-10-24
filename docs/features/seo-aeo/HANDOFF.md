# Flight Arc SEO／AEO 交接：照 Mini Taiwan Pulse 的做法讓網站被搜尋與 AI 找到

> 建立：2026-10-24，由 mini-taiwan-pulse session 撰寫。範本專案：`../mini-taiwan-pulse`（以下簡稱 Pulse）。
> 目標：Google／Bing 收錄 Flight Arc，ChatGPT、Claude、Perplexity 這類 AI 搜尋能讀到並引用網站內容。

## 1. 核心原則（Pulse 實際踩過）

1. **內容必須在原始 HTML 裡。** GPTBot、ClaudeBot、PerplexityBot 不執行 JavaScript（Vercel〈The rise of the AI crawler〉，2024-12）。一頁 React 程式的空 `<div id="root">` 對它們等於空白頁；Google 會跑 JS，但排程慢、不保證。Pulse 在 2026-09-20 被 Google 檢索到的就是一張空白首頁。
2. **一份內容一個網址。** 彈窗、query 參數切換的畫面沒有獨立網址，搜尋引擎無法逐頁收錄（Google Search Central〈JavaScript SEO basics〉）。要被找到的內容，給它路徑型網址（`/xxx/`）和靜態 HTML。
3. **子目錄優於子網域。** 長文、說明頁放同網域子目錄（Pulse 用 `/blog/`），權重累積在同一個網站。
4. **網址是契約。** 發布後不要改；真的要改就在 nginx 加 301。
5. **每個靜態資產都用測試守住。** robots、sitemap、llms.txt、首頁 meta，Pulse 都有契約測試，避免日後改壞沒人發現。

正本：Pulse `docs/LESSONS.md` 第 9 條、`docs/features/blog/README.md`「為什麼不做成地圖上的彈窗」、`docs/audit/site-health-2026-10-16.md`。

## 2. Pulse 做了什麼（可照抄的範本）

### 第一包：速贏（Pulse #609，隨 v2.9.0 上線）

| 項目 | Pulse 檔案 | 重點 |
|---|---|---|
| robots.txt | `public/robots.txt` | `Allow: /`；逐一明示允許 GPTBot、OAI-SearchBot、ChatGPT-User、ClaudeBot、Claude-SearchBot、Claude-User、PerplexityBot、Perplexity-User；最後 `Sitemap:` 指向完整網址；不想被收錄的路徑（例如 `/api/`）`Disallow` |
| sitemap.xml | `public/sitemap.xml` | 每個公開網址一個 `<url>`，帶 `<lastmod>`；多語系加 hreflang |
| llms.txt | `public/llms.txt` | 依 llmstxt.org：`# 名稱`、一段 `>` 引言、`## 小節` 底下的連結清單（每行一句說明） |
| 首頁 meta | `index.html` 第 4–52 行 | canonical、hreflang、description、og:*、twitter:card、JSON-LD（WebSite＋WebApplication，含免費的 Offer） |
| 首頁靜態說明 | `index.html` `#root` 內 | 直接寫一段 `<h1>`＋網站介紹＋主要功能＋資料來源＋隱私連結；React `createRoot` 掛載時會整段取代，使用者看不到，爬蟲讀得到。**不可改 `hydrateRoot`**（測試有守） |
| 不存在的檔案回 404 | `nginx.conf` | 靜態資源路徑缺檔回 404，不要被 SPA fallback 吞成 200 的 index.html（soft-404 會被 Google 降權） |
| 契約測試 | `src/map/__tests__/seoAssets.test.ts`、`nginxCachePolicy.test.ts` | robots 有 AI 爬蟲與 Sitemap、sitemap 網址完整、llms.txt 格式、index.html 的 JSON-LD 可解析且 `#root` 內有 h1 |

上線後：在 Google Search Console 以「網域」資源驗證（Cloudflare 會自動加 TXT 紀錄，不要刪）、提交 sitemap、對首頁「要求建立索引」；約兩週後查 `site:<網域>` 與「網頁」報表。

### 第二包：靜態文章專區（Pulse #670，v2.13.0）

- `content/blog/<slug>.md`（Markdown＋front matter）→ build 時由 `src/blog/generator.ts` 產生 `<root>/blog/**` 靜態 HTML，加進 vite rollup input。
- 每篇：獨立網址 `/blog/<slug>/`、開頭兩三句直接回答「這是什麼、在哪裡看」（AI 摘要最常引用）、`## 常見問題` 自動產生 FAQPage JSON-LD、BlogPosting JSON-LD、RSS、左側目錄。
- 地圖畫面用嵌入版 iframe（`/embed?...`）放進文章，CSP `script-src 'self'`（不用 inline script）。
- nginx `location ^~ /blog/`：放在 SPA fallback 之前、缺頁 404、無結尾斜線 301。
- 寫作流程是一支 skill：Pulse `.claude/skills/blog-writing/SKILL.md`（選題→抽 Threads 素材→查證數字→寫→截圖→登記 sitemap／llms.txt→預覽）。

## 3. Flight Arc 現況（2026-10-24 唯讀盤點，develop 463adac）

- React 19＋Vite 6 單頁；只有 `index.html` 一支入口；路徑永遠是 `/`，狀態全在 query（`src/data/urlState.ts:35-64`，例如 `a`＝機場）。
- `index.html` 只有 `lang="zh-TW"`、`<title>Flight Arc</title>`、favicon、空的 `#root`。**沒有** description、og、canonical、JSON-LD、靜態內文。
- `public/` 沒有 robots.txt、sitemap.xml、llms.txt、og 圖。
- 部署：Zeabur，`Dockerfile`（node:22 build → nginx:alpine），`nginx.conf` 聽 8080，SPA fallback `try_files $uri $uri/ /index.html`（`:29-31`），沒有 CSP／安全標頭。
- 正式網域有兩種說法：`flight-arc.itsmigu.com`（`.claude/pitfalls/zeabur-exec-524-timeout-2026-08.md:61`）與 `flight-arc.zeabur.app`（`src/components/InfoModal.tsx:438`）。
- 可做成獨立頁的資料：`public/airport-points.geojson`（3,625 座機場，含 icao／iata／中英文名／城市／國家／capturedFlights）。
- 沒有 vitest，測試用 `node --test`（`npm run design:test`）；沒有 GitHub Actions；分支 develop → master（`docs/RELEASING.md`），CHANGELOG 在 `docs/changelog.md`。

## 4. 建議做法（分三包，依序）

### A. 速贏（一個 PR，先做）
1. 決定 canonical 網域（見 §5）。
2. `index.html`：canonical、description、og:*（`og:image` 先用現有截圖或之後補 1200×630）、twitter:card、JSON-LD（WebApplication＋作者 Person；作者頁可連 Pulse 的 `/blog/about/`）、`#root` 內靜態說明（h1、Flight Arc 是什麼、資料範圍與來源、怎麼用、隱私／作者連結）。
3. `public/robots.txt`、`public/sitemap.xml`、`public/llms.txt`（照 Pulse 格式）。
4. nginx：靜態資源缺檔回 404；`docker-compose.yml` 的 `3721:80` 與 nginx 8080 不一致順手確認。
5. 契約測試：用 `node --test` 寫一支（對照 Pulse `seoAssets.test.ts` 的五項斷言）。
6. 上線後 Search Console 提交 sitemap。

### B. 機場靜態頁（主要流量來源，先問使用者）
- 用 `airport-points.geojson` 在 build 時為每座機場產生 `/airports/<icao>/` 靜態頁：標題含「<機場中文名>（<IATA>）航班航跡」、開頭一句說明、收錄航班數與日期範圍、主要航線、截圖或一張連到 `/?a=<ICAO>` 的按鈕。
- 頁數多（3,000+），要注意：只產生有資料的機場、內容不能只是換名字的模板（薄內容會被判重複）、sitemap 可拆 sitemap index。
- nginx 加 `location ^~ /airports/`（放在 SPA fallback 之前、缺頁 404）。

### C. 長文
- 製作過程、資料故事（繞航、颱風疏散、進場規律）適合寫成長文。可在 Flight Arc 自己開 `/notes/`，或寫在 Pulse 筆記並連過來（Pulse 目前決定 Flight Arc 是獨立應用，不寫進 Pulse 筆記；要寫在哪裡先問使用者）。

## 5. 開工前要使用者決定

1. canonical 網域：`flight-arc.itsmigu.com` 還是 `flight-arc.zeabur.app`？另一個要 301 過去，或至少 canonical 指向正式那個。
2. 機場頁要不要做（B 包）、網址格式（建議 `/airports/<icao>/`）。
3. 長文放哪（C 包）。
4. og 圖要不要另外做一張 1200×630。

## 6. 驗收

- `curl -s <網域>/ | grep '<h1'` 有內容（不靠 JS）；`curl -sI <網域>/robots.txt`、`/sitemap.xml`、`/llms.txt` 都 200；`curl -sI <網域>/assets/not-exist.js` 回 404。
- JSON-LD 用 Google Rich Results Test 驗過。
- Search Console sitemap 狀態「成功」；兩週後 `site:<網域>` 出現首頁。
- 用 agent-browser 開正式站確認畫面沒被靜態說明影響（掛載後應完全被取代）。

## 7. 參考檔案（Pulse，路徑相對於 GIS 工作區）

- `mini-taiwan-pulse/index.html`
- `mini-taiwan-pulse/public/robots.txt`、`public/sitemap.xml`、`public/llms.txt`
- `mini-taiwan-pulse/nginx.conf`（`location ^~ /blog/`、404 規則）
- `mini-taiwan-pulse/src/map/__tests__/seoAssets.test.ts`
- `mini-taiwan-pulse/src/blog/generator.ts`、`docs/features/blog/README.md`
- `mini-taiwan-pulse/docs/audit/site-health-2026-10-16.md`（全站健檢，SEO／AEO 章節）
