# content/notes — Flight Arc 長文（/notes/）

每篇一個 `<slug>.md`，build 時由 `scripts/seo/generate-notes.ts` 產生 `dist/notes/<slug>/index.html`（純靜態、全文在原始 HTML）。本 README 與 `*.sources.md` 不會被發布。

## front matter

```yaml
---
title: 巴威颱風那三天，台灣的天空發生了什麼     # 必填，32 字內，含搜尋關鍵字
description: 一句到兩句的摘要                    # 必填，120 字內（meta description）
slug: typhoon-bavi-2026-07                       # 必填，[a-z0-9-]，必須等於檔名；發布後不改
date: 2026-10-25                                 # 必填，YYYY-MM-DD（發布日）
updated: 2026-10-30                              # 選填，實質修改才填
tags: [颱風, 桃園機場]                            # 選填
cover: cover.jpg                                 # 選填，圖片放 public/notes/<slug>/，1600×900、< 400 KB
coverAlt: 封面替代文字                            # 有 cover 就必填
mapLink: /?a=RCTP&d=2026-07-11                   # 選填，文首「在 3D 地圖上看」按鈕
---
```

## 內文規範

- 開頭兩三句直接回答「這篇在講什麼、結論是什麼」（AI 摘要最常引用這段），不要鋪陳。
- 用 `##` 分 4–6 節（自動產生目錄）；`###` 只在節內使用。
- 圖片 `![替代文字](檔名.jpg)`，檔案放 `public/notes/<slug>/`；不可用外站圖片。
- 連到地圖用一般連結，例如 `[在地圖上看 7/11 的桃園機場](/?a=RCTP&d=2026-07-11)`（參數見 `src/data/urlState.ts`）。
- 倒數第二節固定 `## 常見問題`，底下 3 題 `### 問題？`＋一段回答 → 自動產生 FAQPage JSON-LD。
- 最後一節 `## 資料與方法`：資料來源、範圍、時區（台灣時間 UTC+8）、限制（未收錄 ≠ 沒有航班）。
- 1,800–3,000 字；不出現程式識別字、檔名、欄位名。

## 數字查證

每個數字都要能溯源。同目錄放 `<slug>.sources.md`（不發布）：逐條列「文中句子 → 計算方式／檔案／指令 → 結果 → 時間點」；外部事實列網址與存取日期。查不到的寫〔待確認〕，不可猜。
