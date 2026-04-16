# track-progress.json 瘦身 migration（2026-04-16）

## 背景問題

舊資料流：
```
fetch-tracks.ts
  ├→ scripts/track-progress.json  ← 中介檔，記每個 fr24_id 的完整 FlightOutput（含 path）
  └→ public/tracks/aviation_data.json  ← 最終 output

split-tracks.ts
  └→ public/tracks/airports/{ICAO}.jsonl
```

因 `track-progress.json` 存「完整 output」（含座標陣列），累積到 **322MB**。
每寫 10 筆就 `JSON.stringify` 整個檔 → 接近 V8 max string limit → **RangeError**。

實際狀況：軌跡本身寫入沒壞（資料都在），但 `saveProgress` 時序不可靠，且再加 13K 筆幾乎必掛。

## 新資料流

```
fetch-tracks.ts
  ├→ scripts/track-done.ndjson       (每行 fr24_id，append-only)
  ├→ scripts/track-failed.ndjson     (每行 fr24_id，append-only)
  └→ public/tracks/airports/{ICAO}.jsonl  (每筆成功軌跡直接 append，dep + dest 各一份)

split-tracks.ts
  └→ 掃 airports/*.jsonl → dedupe + 產生 regions/*.jsonl + manifest.json
```

關鍵改變：
- 進度記錄只存 `fr24_id`（短字串），不存 path → **322MB → 137KB**
- Append-only → 永遠不會 RangeError
- 跳過 `aviation_data.json` 中介檔（已廢棄）
- JSONL 是 single source of truth

## Migration 執行紀錄

- 腳本：`scripts/migrate-progress.ts`
- 執行命令：`NODE_OPTIONS='--max-old-space-size=8192' npx tsx scripts/migrate-progress.ts`
- 結果：
  - `completed`: 15,539 筆 → `track-done.ndjson` (137 KB)
  - `failed`: 23 筆 → `track-failed.ndjson`
  - 補寫缺漏 JSONL：數百筆（historic split-tracks 遺漏）
  - Airports 檔案數：471 → 654（補齊歷史遺漏）
  - 備份：`scripts/track-progress.json.bak`（.gitignored）

## 驗證方式

```bash
# 1. 乾跑驗證 load 邏輯
npx tsx scripts/fetch-tracks.ts --airports RCBS --dry-run

# 2. 小規模真抓（2 筆）
npx tsx scripts/fetch-tracks.ts --airports RCBS --limit 2

# 3. 重跑 dry-run，確認 done 已更新、會自動 skip
npx tsx scripts/fetch-tracks.ts --airports RCBS --limit 2 --dry-run
```

## 新參數

`fetch-tracks.ts` 新增：
- `--limit N`：最多處理 N 筆（測試用）
- `--dry-run`：只印 todo 數量，不打 API

## 後續清理（觀察期結束後）

確認新流程穩定後（例如跑完 1~2 個 batch 沒問題），可手動刪除：
```bash
rm scripts/track-progress.json       # 原 322MB 檔，已 migrate
rm scripts/track-progress.json.bak   # 備份，確認 ok 才刪
```

`aviation_data.json` 已不再由 `fetch-tracks.ts` 產生，若存在可留作歷史快照或刪除。

## 不要再做的事

- ❌ 在 `fetch-tracks.ts` 或任何地方 `JSON.stringify` 累積的 completed outputs
- ❌ 讓中介檔存「完整航班 output（含 path）」—— 只該存 id
- ❌ 用 `aviation_data.json` 作為 tracks 的流水線中介
