# 重構進度追蹤（Refactoring Status）

> 對應計畫：[`refactoring-roadmap.md`](./refactoring-roadmap.md)
> 分支：`refactor/phase1-manifest-catalog`
> 開始：2026-06-12 夜間自主執行
> 規則：每項需自行測試驗證通過才打勾 ✅

---

## Phase 1：manifest 資料目錄（isCore / dates / fullDates）

### 設計決策（執行前定案）

- **`isCore` 來源**：`scripts/flight-list.json` 的 `completed` 清單（295 筆、~165 座主動查詢機場）。這是機器可讀的權威來源，比手工清單可靠。
- **`fullDates` 來源**（三層合成）：
  1. completed 新格式 `ICAO:from:to` 的精確 UTC 時間窗 → 換算台灣日期
  2. 舊格式（純 ICAO）→ 用 `docs/data-coverage.md` 的「主力日期」表轉錄成 curated config
  3. 最後與實際資料交叉驗證：fullDates 必須在該機場該日**實際軌跡數 ≥ 門檻**，避免「時刻表抓了但軌跡還沒抓」的機場（KSEA/ZBAA/ZBAD）被誤標
- **`dates`**：純資料計算——split-tracks 掃 JSONL 時統計每機場每日（台灣時間 UTC+8）軌跡筆數，輸出 `{ "2026-02-18": 412, ... }`，前端日期選單據此顯示可用日期與筆數。
- **`--manifest-only` 模式**：split-tracks 新 flag，串流統計不在記憶體保留 flights、不重寫 region 檔（沿用既有 manifest 的 regions 區塊）→ 避開已知 OOM 問題（status doc 記載 4GB heap 不夠）。
- **時區**：日期一律以台灣時間（UTC+8）切日，與前端 UI 慣例一致（需先驗證前端現有 availableDates 的計算方式並對齊）。

### 工作項目

- [x] **1. 建 `scripts/build-core-airports.ts`** — 從 flight-list.json completed + curated 主力日期表，產出 `scripts/core-airports.json`
  - 驗證標準：unique core 機場數 ≈ 165；RCTP fullDates 含 2/17-2/24；OMDB 含 2/28、4/5；KSEA/ZBAA/ZBAD 不得有 fullDates（軌跡未抓，由步驟 3 交叉驗證歸零）
  - ✅ 實際結果：165 座 core、74 座有 fullDates。**不需 curated 表**——flight-list.json + track-done.ndjson 可直接重算「done ≥ 50 且完成度 ≥ 80%」規則。RCTP = 2/18-2/24（完成度 99-100%；2/17 正確排除，data-coverage.md 的「2/17-2/24」是 UTC 日期慣例，UI 用台灣時間）；OMDB = 2/25、2/28、4/5（= 戰爭觀察三日期，完成度 97-100%）；KSEA/ZBAA/ZBAD fullDates 為空 ✓
- [x] **2. 改 `scripts/split-tracks.ts`** — manifest 加 `isCore` / `dates`（每日筆數）/ `fullDates`；新增 `--manifest-only` flag
  - ✅ typecheck 過；`--manifest-only` 串流統計（不留 flights 在記憶體）、regions 區塊沿用既有值。另修正兩個資料品質問題：dep_time=0 fallback 到 path 首點時間戳（與前端一致）+ sanity floor 1e9 擋掉接近 epoch 的壞時間戳（如 KEWR path[0][3]=98 → 原會算成 1970-01-01）
- [x] **3. 重建 manifest** — 跑 `split-tracks --manifest-only`
  - ✅ RCTP dates 41 天（2/17-3/28，2/18=614 與班表吻合）；OMDB fullDates=[2/25, 2/28, 4/5]；KSEA isCore=true 但 fullDates=[]（軌跡未抓，交叉驗證正確排除）；長尾機場 isCore=false；totalFlights 41,655 不變；regions 區塊一致；1970-01-01 雜訊清除
- [x] **4. 前端資料層** — flightLoader.ts `AirportManifestEntry` 型別 + `getAirportDates` / `getAirportFullDates` / `isAirportCore`；useFlightData 暴露 `airportCatalog`
  - ✅ typecheck 過
- [x] **5. 日期選單依機場過濾** — 單一機場模式 availableDates 改用 manifest 目錄；日曆 tooltip 顯示「N flights（完整/部分）」、部分日期文字調暗；預設日期邏輯：2/18 ∈ fullDates 用 2/18 → 否則第一個 fullDate → 否則筆數最多日；**切換機場時**若當前日期非新機場完整日自動跳 preferredDate（手動選部分日期不會被蓋掉）
  - ✅ agent-browser 實測：選 OMDB 自動跳 2/25（1,160 班）；二月 tooltip「25→1160（完整）、28→777（完整）、18→156（部分）...」；四月「5→465（完整）」；切回 RCTP 自動跳回 2/18（614 班）
- [x] **6. 機場清單 core 優先** — LocationsPanel 加搜尋框（涵蓋 manifest 全部 1,356 座，原本只能選 138 個 camera presets）；結果分「核心機場」/「更多機場（資料不完整）」折疊區；AirportButton 顯示筆數 + ◐ 被動標記；選中被動機場顯示橘色資料品質 banner
  - ✅ 實測：搜 OMDB → 核心機場(1)；搜 ZGSZ → 核心(0) + 折疊區「◐ 214」；選 ZGSZ 出現「◐ 被動收集資料」banner
  - ⚠️ 已知限制（記入 Phase 2）：非 preset 機場選中後鏡頭不會跳轉（無座標來源），資料正常載入
- [x] **7. 整體驗證** — `npm run typecheck` + dev server 冒煙測試（單機場/region/組合三種模式都能載入、timeline 正常播放）
  - ✅ agent-browser 實測：單機場（RCTP 5,787 / OMDB 2,740 / ZGSZ 214 被動）、TW region（1,094 班 @ 2/18）、TW 國際組合（906 班）皆正常；timeline 60x 播放時間正常前進（03:07→03:11）；console 無 error（僅 dev 環境 Loader 正常 log）
- [x] **8. 文件同步 + commit** — 更新 roadmap 進度表、本檔打勾、commit（含 typecheck）
  - ✅ typecheck 通過後 commit（見執行紀錄）

### 風險與回滾

- 新欄位全部 optional，舊 manifest 照常運作（additive，無破壞性）
- 不動任何軌跡 JSONL；唯一改寫的檔案是 manifest.json（git 不追蹤，S3 另傳）
- 回滾 = 切回 master 分支即可

### 執行紀錄

- 2026-06-12 夜間：建立計畫，開始執行
- 2026-06-13 ~02:15：**Phase 1 全部完成**。摘要：
  - `scripts/core-airports.json`（210KB）進 git——讓 manifest 重建不依賴 gitignored 的 flight-list.json
  - manifest.json 已重建（含新欄位），**尚未上傳 S3** —— 部署前記得跑既有上傳流程，否則線上版退回舊行為（無壞處，僅看不到新功能）
  - KSEA/ZBAA/ZBAD 軌跡抓完後：重跑 `build-core-airports.ts` + `split-tracks.ts --manifest-only`，fullDates 會自動出現
  - 已知限制（→ Phase 2）：非 camera-preset 機場選中後鏡頭不跳轉（無全球座標來源）；region / set 模式的日期目錄仍用舊邏輯（set 改 per-airport 載入時一併處理）

### 給用戶的驗收路徑（早上看這裡）

1. `git log` 看 commit；`npm run dev` 開啟
2. Locations 面板 → 搜「OMDB」→ 選取 → 應自動跳到 2/25（1,160 班）
3. Calendar 面板 → 二月只有 25、28 是亮的完整日（hover 看筆數 tooltip），四月 5 日完整
4. 搜「ZGSZ」→ 在「更多機場（資料不完整）」折疊區 → 選取後出現橘色 ◐ banner
5. 確認沒問題後：上傳 manifest.json 到 S3 + merge 回 master

---

## Phase 2：Region/Scope 解耦（未開始）

待 Phase 1 驗收後規劃細項。

## Phase 3：比較/配色統一（未開始）

## Phase 4：JSONL 按日期分檔（未開始）
