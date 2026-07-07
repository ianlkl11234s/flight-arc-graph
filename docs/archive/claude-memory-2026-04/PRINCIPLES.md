# Principles

不用再重複溝通的預設與慣例。新增原則時註明日期。

## 專案預設（溝通層）

- **基準日期**：TW 2/18（主力 campaign 日，倫敦 / 台灣 / 新加坡皆以此對齊）
- **基準時區**：UI 顯示一律 **TW（UTC+8）**；API 查詢一律 UTC
- **TW 全日換算**：`TW 2/18 00:00 ~ 24:00` = `UTC 2/17 16:00 ~ 2/18 16:00`
- **回應語言**：繁體中文，技術術語保留英文

## 技術慣例

- **Python / pip**：永遠 `python3` / `pip3`，不是 `python` / `pip`
- **Commit 前必跑**：`npm run typecheck`（= `tsc -b`，與 CI 一致）。**不要**用 `tsc --noEmit`（會漏檢）
- **Shell**：Zeabur Alpine 容器**沒有 bash**，所有 deploy 腳本 shebang 一律 `#!/bin/sh`，執行用 `sh xxx.sh`（2026-04-23 新增）
- **路徑 fallback 順序**：`/data/`（Zeabur volume）→ `/`（local `public/`）→ S3
- **即時渲染**：用 Three.js，避免 Mapbox GeoJSON `source.setData`（setData 每幀 2-3ms 是瓶頸）
- **機場資料**：統一放 `src/map/cameraPresets.ts`
- **資料載入**：統一走 `src/data/flightLoader.ts`
- **Inline styles**：UI 用 inline styles（非獨立 CSS），所有元件需支援 `isDarkTheme`

## FR24 API 原則

- Essential 方案：300 筆/次、30 req/分鐘、666,000 credits/月
- `flight-summary/light` ≈ 38.7 credits/次
- `flight-tracks` ≈ 12 credits/次（估計值）
- 單次查詢 ≤ **14 天**
- `fetch-tracks` 自動將軌跡寫入 **dep + dest 雙邊 JSONL**

## 資料流原則

- Tracks **不進 git**，走 S3 + Zeabur pull 流程
- 進度記錄用 **append-only NDJSON**（`track-done.ndjson` / `track-failed.ndjson`）
- **禁止**對累積進度做 `JSON.stringify` 整檔 re-serialize（歷史事故，見 INCIDENT #old-1）
- Airport JSONL 必須雙向（同一航班在 dep 和 dest 的 JSONL 各一份）

## 記憶系統原則

- `.claude/memory/` **commit 進 git**，英文檔名、繁中內容
- Session 結束用 `/wrap-up` skill 自動更新
- 一檔一 atomic commit，prefix `memory:`
- `/wrap-up` 不自動 push，留給用戶最後確認

## 行為原則（Claude 自律）

- **不盲信 memory**：凡涉及「某資料是否存在」「某機場是否已抓」類判斷，先 `Grep` / `Read` 驗證現況，不靠記憶（2026-04-23 教訓）
- **成本估算要標示來源**：寫「實測」或「估算」，不混淆
- **改上游資料 pipeline → 下游全查**：`grep -r` 所有消費端，避免漏改（2026-04-23 UK region 教訓）

## 新增機場資料 — 三層同步原則（2026-04-23 新增）

新增機場群時，**資料 / UI / 邊界**三層缺一不可：

1. **資料層**：`fetch-flights` + `fetch-tracks` → `public/tracks/airports/*.jsonl`
2. **UI 層**：`src/map/cameraPresets.ts` 加 `AIRPORT_INFO` + `CAMERA_PRESETS`（缺了 tab dropdown 不顯示）
3. **邊界層**：`scripts/fetch-airport-boundaries.ts --icao ...` 更新 `public/airports.geojson`（缺了地圖上沒機場輪廓）

三層都要更新 → 否則 UI 看起來像「沒抓到」（參 REFLECTIONS 2026-04-23 晚段）。

## 外部 API 可靠性（2026-04-23 新增）

- **Overpass**：用 `execFileSync('curl', [...])` 而非 Node 內建 fetch（後者 ETIMEDOUT）
- **FR24**：Node fetch 正常，維持現狀

## Zeabur 容器操作（2026-04-23 新增）

- 容器 WORKDIR 預設 `/`（不是 `/app`）
- 執行 script 一律用絕對路徑：`sh /app/scripts/pull-from-s3.sh`
- 或先 `cd /app` 再執行相對路徑
