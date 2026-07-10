---
name: track-round
description: Flight Arc「抓取一輪」FR24 資料工作流：fetch-flights → fetch-tracks → split-tracks → 同步文件 → 上傳 S3。當使用者說「抓下一輪」「抓軌跡」「fetch tracks」「抓 XX 機場的資料」「接續抓取」「補抓軌跡」「跑一輪抓取」時觸發。
user_invocable: true
---

# /track-round — 抓取一輪 SOP

FR24 Essential 方案限制：**300 筆/次、30 次/分鐘、666,000 credits/月**。

## 🌐 Top-1000 P2 長期模式（2/18 全球網，跨數月）

若這次是在推進「全球前 1000 大機場 2/18 軌跡」戰役（65,421 條 ≈ 2.62M credits ≈ 4 個月），走這個特化迴圈：**跳過 Step 1（1000 座時刻表已全掃完）、日期固定 2026-02-18、按 rank 分批、`--max-credits` 封頂**。每個 session：

```bash
# 0. 一鍵看狀態（現算：進度/目前批次/本週期額度/漂移警告/建議指令）
npx tsx scripts/campaign-status.ts
#    有漂移警告（沒 split / 沒上 S3）→ 先補做再抓

# 1. 照它印的「建議指令」跑（--rank 與 --max-credits 已算好）；務必先 --dry-run 確認 todo
caffeinate -i npx tsx scripts/fetch-tracks.ts --airports-file scripts/top1000-airports.json \
  --rank <目前批次> --date 2026-02-18 --max-credits <算好的值> 2>&1 | tee scripts/_p2-batch.log
#    ⚠️ macOS 睡眠會殺 8 小時長跑 → caffeinate。track-done 保證中斷零損失，可隨時續跑

# 2. 補救網路 blip：track-failed 新增的 id → scripts/retry-targets.txt → retry-failed-tracks.ts
# 3. 重建 manifest：NODE_OPTIONS="--max-old-space-size=12288" npx tsx scripts/split-tracks.ts
# 4. 同步 README 覆蓋表 + data-fetching-status.md（campaign 進度不用手改，campaign-status 現算）
# 5. 上傳：npm run s3:upload（→ Zeabur 端 sh /app/scripts/pull-from-s3.sh）
# 6. commit scripts/fetch-sessions.ndjson + campaign-top1000.json（帳本進 git = 跨月審計）
```

- **額度追蹤**：`fetch-tracks` 每次跑完自動 append 一行到 `scripts/fetch-sessions.ndjson`（含 SIGINT / circuit breaker）。月額度重置後，從 FR24 dashboard 讀實際餘額，更新 `campaign-top1000.json` 的 `budget.manual_remaining` / `manual_remaining_as_of`。
- **進度真相永遠現算**：文件過期不影響，`campaign-status.ts` 掃 `scripts/flights` vs `track-done` 得出。
- 細節與批次表 → `docs/backlog/data-fetching-status.md` 最上方「🔖 下次接續」。

---

## Step 0: 先讀狀態（必做）

讀 `docs/backlog/data-fetching-status.md`：
- 開頭「🔖 下次接續（接力點）」→ 有未完成項就先接續，不要開新目標
- 「🎯 目前目標清單」→ 確認這輪要抓哪些機場、預估額度

若接力點只差軌跡（時刻表已抓），直接跳 Step 2。

## Step 1: fetch-flights（抓時刻表）

```bash
npx tsx scripts/fetch-flights.ts \
  --from 2026-02-17 --to 2026-03-02 \
  --airports VTBS,VTBD
```

- **額度**：~38.7 credits / page（每 page 300 筆）
- **14 天上限**：單次查詢範圍不可超過 14 天，更長要分段（如 2/26~3/11 + 3/12~3/28）
- **參數**：
  - `--from` / `--to` — 日期範圍（YYYY-MM-DD 或 ISO）。⚠️ 是 `--from`/`--to`，**不是** `--from-time`/`--to-time`（那是 fetch-tracks 的）；誤用會 fallback 成「今天往前 3 天」
  - `--airports A,B,C` — 覆蓋預設（預設 = 台灣 22 座）
  - `--airports-file path` — 讀 JSON 清單（如 `scripts/top1000-airports.json`）
  - `--direction outbound|inbound|both` — 預設 outbound（單向、零重複命中）
  - `--batch-size N` — 跑 N 座機場後自動停（0 = 不停）
  - `--range A-B` — 只跑清單中第 A~B 座（1-based 含頭含尾）
- **輸出**（皆 gitignored）：新格式 `scripts/flights/{ICAO}/{YYYY-MM-DD}.json` 優先；legacy `scripts/flight-list.json` fallback
- ⚠️ 主動查詢的班次遠多於被動觸及（如浦東被動 330 vs 主動 1,488）→ Track 額度要用 Step 1 的**實際結果**估算

## Step 2: fetch-tracks（抓軌跡）

```bash
# 先 dry-run 估數量
npx tsx scripts/fetch-tracks.ts --airports KSEA,ZBAA --dry-run

# 正式跑（可加 ISO 精準時區過濾）
npx tsx scripts/fetch-tracks.ts \
  --airports KSEA,ZBAA,ZBAD \
  --from-time 2026-02-17T16:00:00Z --to-time 2026-02-18T16:00:00Z
```

- **額度**：~40 credits / 班；速度 ~2 秒/筆（rate limit）→ 估時 = 班數 × 2s
- **自動跳過**：已在 `scripts/track-done.ndjson` 的 fr24_id 不重抓（全域、跨 session）
- **輸出**：append 到 `public/tracks/airports/{ICAO}.jsonl`（dep + dest 各一份）
- **Raw 備份**：`public/tracks/raw/{YYYY-MM}/{ab}/{fr24_id}.json.gz`
- **Circuit breaker**：連續 15 筆失敗或最近 50 筆 >50% 失敗會自動停
- **失敗補救**：失敗的 fr24_id 進 `scripts/track-failed.ndjson`。網路 blip 造成的大量失敗用：
  ```bash
  # 把要重試的 fr24_id 寫進 scripts/retry-targets.txt，然後
  npx tsx scripts/retry-failed-tracks.ts   # 帶 3 次網路 retry，歷史救回率 99.7%
  ```
  剩下的才是真 404。

## Step 3: split-tracks（重建 region + manifest）

```bash
# 完整跑（資料量大，預設 4GB heap 會 OOM，必加 NODE_OPTIONS）
NODE_OPTIONS="--max-old-space-size=12288" npx tsx scripts/split-tracks.ts

# 只重建 manifest（串流統計、低記憶體，避 OOM 的輕量選項）
npx tsx scripts/split-tracks.ts --manifest-only
```

- 掃 `airports/*.jsonl` 做 dedupe + 產生 `regions/*.jsonl` + `manifest.json`
- `--manifest-only` 不重寫 region 檔（regions 沿用既有值）；有新增 region 機場時要跑完整版
- ⚠️ **產出新 region 時**：`scripts/pull-from-s3.sh` 的 `for R in ...` 是 hardcode 清單，**必須同步加上新 region**，否則 Zeabur 拉不到（UK、CN 都曾漏加）

## Step 3.5: 新機場 UI 三層同步（僅當這輪有「新」主動機場）

新機場群要在 UI 完整顯示，**資料 / UI / 邊界**三層缺一不可，缺了會像「沒抓到」：

1. **資料層**：Step 1-3 已完成（`public/tracks/airports/*.jsonl`）
2. **UI 層**：`src/map/cameraPresets.ts` 加 `AIRPORT_INFO` + `CAMERA_PRESETS`（缺了機場 dropdown 不顯示）；新地區記得更新 overview preset
3. **邊界層**：`npx tsx scripts/fetch-airport-boundaries.ts --icao A,B,C` 更新 `public/airports.geojson`（找不到 aerodrome polygon 會自動 fallback 成 runway-buffer 矩形；腳本走 curl，勿改回 Node fetch — 對 Overpass 會 ETIMEDOUT）

改完跑 `npm run typecheck` 再 commit。

## Step 4: 同步文件（必做，三處）

數字一律以重建後的 `public/tracks/manifest.json` 為準：

1. **README.md「軌跡資料量（Track Coverage）」表** — region 軌跡數、總筆數（`wc -l scripts/track-done.ndjson`）、機場 JSONL 數、Top 15 機場、最後更新日
2. **`docs/backlog/data-fetching-status.md`** — 更新狀態欄、把完成項從接力點/目標清單移到「最近完成」、記新接力點
3. **記憶 `project_fetch_resume_point.md`** — 若這輪沒抓完，記下接力指令

## Step 5: 上傳 S3 + Zeabur 拉取

```bash
# 增量上傳（對照 scripts/upload-state.json 的 mtime；--force 全部重傳）
npm run s3:upload

# Zeabur 終端機執行（Alpine 容器無 bash 且 WORKDIR=/，須 sh + 絕對路徑）
sh /app/scripts/pull-from-s3.sh
```

軌跡資料**不進 git**，S3 路徑 `migu-gis-data-collector/flight-arc/`。

## 重要觀念

- **主動 ≠ 有完整資料**：被動機場 JSONL 只涵蓋「連到主動機場的航線」；要看完整主場流量必須對它跑 fetch-flights
- **軌跡雙寫**：每筆軌跡 append 到 dep + dest 兩個 ICAO.jsonl
- 台北時間整天 = UTC `前一天T16:00:00Z ~ 當天T16:00:00Z`
