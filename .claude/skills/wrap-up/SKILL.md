---
name: wrap-up
description: Session 結束後收尾的 skill。當使用者說 /wrap-up、「收工」、「收尾」、「session 結束」、「做完了」、「整理記憶」時觸發。讀本 session 脈絡 + git log + 現有文件 → 更新三個活的地方（docs/backlog/ 狀態檔、README 覆蓋表、auto-memory）→ 產出 diff 給用戶 review → atomic commit → 不自動 push。
user_invocable: true
---

# /wrap-up — Session 收尾 SOP

> 舊的 `.claude/memory/` 9 檔記憶系統已於 2026-07-08 歸檔至 `docs/archive/claude-memory-2026-04/`，本 skill 不再維護它。

## 目的

Session 結束時：
1. 分析本次做了什麼、學到什麼、失誤什麼
2. 把還沒同步的狀態寫回**三個活的地方**（見下）
3. 變更以 diff 給用戶 review，確認後 atomic commit
4. 不 push，保留用戶最後 review 機會

## 三個維護目標

| # | 地方 | 更新條件 | 內容 |
|---|------|---------|------|
| 1 | `docs/backlog/` 狀態檔 | 本 session 有進度或新待辦 | `data-fetching-status.md`（接力點、完成項、目標清單）、`refactoring-roadmap.md` 第六節進度表（Phase 狀態、順手做清單） |
| 2 | README「軌跡資料量（Track Coverage）」表 | **僅當本 session 有抓資料** | region 軌跡數、總筆數、Top 15 機場、最後更新日 — 數字一律以重建後的 `public/tracks/manifest.json` 為準 |
| 3 | auto-memory | 有值得跨 session 留的事 | 接力點、教訓、用戶偏好 — 交給 Claude 內建的記憶指引處理（不在 repo 內，不進 commit） |

事故紀錄（現象/根因/對策）另有去處：長文寫 `.claude/pitfalls/`。

## 執行流程（5 階段）

### Stage 1: Gather

**平行執行**：

1. `git log --oneline origin/master..HEAD`（本地未 push）+ `git log -15 --oneline` + `git status`
2. Read `docs/backlog/data-fetching-status.md` 開頭（接力點）與 `refactoring-roadmap.md` 第六節（進度表）
3. 若本 session 有抓資料：Read README 覆蓋表 + `public/tracks/manifest.json` 摘要

**然後**回顧本 session 對話：用戶要求了什麼、做了哪些動作、哪裡卡住、有沒有被糾正。

### Stage 2: Analyze

事件分類：

| 事件類型 | 寫到哪 |
|---|---|
| 抓完一輪資料 | README 覆蓋表 + data-fetching-status.md（移完成項、記新接力點） |
| 重構 / 功能有進度 | refactoring-roadmap.md 進度表（或對應 backlog 檔） |
| 新待辦 idea | docs/backlog/ 對應檔（抓資料類 → data-fetching-status；架構類 → refactoring-roadmap） |
| 踩坑並修好 | `.claude/pitfalls/` 新檔（現象/根因/對策） |
| 接力點 / 教訓 / 偏好 | auto-memory（內建記憶指引） |

**寫回規則**：數字先驗證（`wc -l`、manifest），不單信對話摘要。

### Stage 3: Draft

產出**總表**（檔案 × 變動類型 × 摘要）給用戶一眼看全，然後每個變動 show 實際 diff。

### Stage 4: Confirm

問用戶：全採用 / 修哪幾個 / skip 哪些。**等用戶回覆才進 Stage 5**。

### Stage 5: Atomic Commit

- 一個主題一個 commit（docs 更新可合為一個 `docs:` commit；程式修改照原本慣例分開）
- Commit 前若動到 TS 檔：`npm run typecheck`
- 完成後 `git status` 確認 tree clean，**提醒用戶**「要 push 嗎？`git push origin master`」，**不要自己 push**

## 注意事項

- **Read first**：Edit 前先 Read 目標檔
- **不跨 session 臆測**：只根據本 session 對話 + git log + 現有文件
- **auto-memory 不進 commit**：它不在 repo 內，Stage 5 只 commit repo 檔案
- **若本 session 沒什麼好記**（純閒聊 / 只讀不改）：跟用戶確認「看起來沒需要 wrap-up，要強制留紀錄嗎？」
