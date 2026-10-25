---
name: notes-writing
description: 撰寫與更新 Flight Arc 的長文（/notes/）。當使用者說「寫一篇長文」「新增筆記文章」「寫 notes」「把這個分析寫成文章」「更新某篇文章」時使用：選題確認 → 開分支 → 從軌跡資料查證每個數字 → 寫 Markdown 與出處檔 → 截圖 → build 預覽 → 使用者同意才開 PR。本 skill 不做：改長文版型或產生器（直接改 scripts/seo/notes.ts）、抓新的軌跡資料（track-round skill）。
---

# Flight Arc 長文寫作流程

正本規格（front matter、結構、字數、FAQ、出處檔）→ [`content/notes/README.md`](../../../content/notes/README.md)。本檔只寫流程與坑，不重抄規格。

## 1. 選題

1. 題目必須有本站資料撐得起來（`public/tracks/manifest.json` 查得到的機場與日期）。先查 manifest 確認範圍，再提案。
2. 用一則訊息跟使用者確認：標題方向、slug（發布後不改）、要回答的 3–5 個問題，附建議值讓使用者能回「照建議」。

## 2. 分支

從最新 develop 開 `docs/notes-<slug>`（或併在功能分支裡）。工作區常有平行 session 的改動，不要碰、不要 revert。

## 3. 查證數字（最重要）

- 每個數字都從資料重算，不用記憶、MEMORY.md 或舊報告的數字（舊報告只當線索）。
- 統計一律換算台灣時間（UTC+8）、以 `fr24_id` 去重（同一航班同時在起降兩端機場檔）。只用 L0 檔（不含 `.l1`／`.l2`）。
- 平均值只用 manifest 的 `fullDates`（完整日）；部分收錄的日期會拉低平均，文中要講用了哪幾天。
- 外部事實（颱風警報時間、跑道編號、新聞）用網路查證，出處檔記網址與存取日期；查不到寫〔待確認〕，發布前清掉。
- 記憶體壓力高：逐行串流，每行只 parse `,"path":` 之前的欄位。分析腳本放 scratchpad，不進 repo；結果與指令寫進 `<slug>.sources.md`。
- 航空公司名稱用 `src/data/airlineDatabase.ts`（2026-10 修過 TGW＝酷航、TTW＝台灣虎航）。

## 4. 寫

照 README：開頭兩三句直答、4–6 個 `##`、`## 常見問題` 3 題、`## 資料與方法`。白話，不出現程式名詞。地圖連結參數見 `src/data/urlState.ts`（`a` 機場、`d` 日期、`n` 天數、`t` 時刻）。

## 5. 截圖

- 用 agent-browser **加 `--headed`**（headless 的 WebGL 會全黑）開本機 dev server 的地圖網址，等開場雷達結束（約 20 秒）再截。
- 封面 1600×900；內文圖寬 1600 以內；`sips -s format jpeg -s formatOptions 82` 壓到 400 KB 以下，放 `public/notes/<slug>/`。
- 截完關掉瀏覽器 session 與該 port 的 dev server（只 kill 那個 PID）。

## 6. 預覽與驗收

```bash
npm run build                      # 最後一步會產 dist/notes/**
npm run design:test                # notes 與 seoAssets 契約測試
```
本機沒有 Docker 時，用 brew nginx 載入 nginx.conf 驗 `/notes/<slug>/` 200、`/notes/<slug>` 301、不存在 404，並 `curl` 確認全文在原始 HTML。給使用者看頁面後，同意才開 PR。

## 7. 登記

新文章自動進 `/notes/` 列表、RSS、`sitemap-notes.xml`，不用手動登記。若是第一篇某類主題，視需要更新 `public/llms.txt` 的「長文筆記」說明。
