# Flight Arc — 專案規則

## 📋 資料抓取狀態

**任何關於「下一步抓哪些機場」「目前抓到哪了」的討論，先讀**
👉 [`docs/backlog/data-fetching-status.md`](docs/backlog/data-fetching-status.md)

該檔案追蹤：目標機場群、主動/被動狀態、API 額度預估、操作指令。每完成一輪抓取後同步更新。

## 🔄 抓完軌跡後的同步更新（必做）

每次跑完 `fetch-tracks.ts` + `split-tracks.ts` 後，務必同步更新三處（數字一律以重建後的 `public/tracks/manifest.json` 為準）：

1. **README.md「軌跡資料量（Track Coverage）」表**（region 數、總筆數、Top 15、最後更新日）
2. **`docs/backlog/data-fetching-status.md`**（狀態欄、移除已完成項、記接力點）
3. **記憶 `project_fetch_resume_point.md`**（若有未抓完的接力點）

完整抓取工作流（指令、額度、補救）→ `/track-round` skill（`.claude/skills/track-round/SKILL.md`）。

## Build 檢查（必做）

**每次 commit 前，必須執行 `npm run typecheck`（即 `tsc -b`）確認無錯誤。**

這是 CI/CD 使用的同一個指令。常見的 build 失敗原因：
- 解構變數後未使用（`noUnusedLocals: true`）
- 函式參數未使用（`noUnusedParameters: true`）
- `tsc --noEmit` 通過但 `tsc -b` 失敗（行為不同）

```bash
# ✅ 正確：用 tsc -b（跟 CI 一致）
npm run typecheck

# ❌ 錯誤：tsc --noEmit 可能漏檢
npx tsc --noEmit
```

## 程式碼慣例

- 使用 inline styles（非 CSS 檔案）
- 所有 UI 元件需支援 `isDarkTheme`（Light / Dark 主題）
- 機場資料統一放在 `src/map/cameraPresets.ts`
- 資料載入統一走 `src/data/flightLoader.ts`
- 路徑 fallback 順序：`/data/` (Zeabur volume) → `/` (local public/) → S3
- 即時動畫渲染用 Three.js（非 Mapbox GeoJSON source），避免 setData 瓶頸

## 資料架構

- 航線軌跡：`tracks/airports/{ICAO}.jsonl`（NDJSON 格式，per-airport lazy loading）
  - fetch-tracks.ts **直接 append** 寫入此檔（dep + dest 各一份），不再經過 aviation_data.json
  - split-tracks.ts 掃 JSONL 做 dedupe + 產生 region + manifest
- 空域快照：`airspace/days/{YYYY-MM-DD}.jsonl`（按天分檔）
- 索引：`tracks/manifest.json`、`airspace/manifest.json`
- 進度記錄：`scripts/track-done.ndjson`、`scripts/track-failed.ndjson`（append-only，gitignored）
  - 每行一個 `fr24_id`，fetch-tracks 用來跳過已抓過的航班
  - 取代舊的 `scripts/track-progress.json`（322MB，有 RangeError，已 migrate 到 NDJSON）
- 航班清單（Step 1 產出，皆 gitignored）：fetch-tracks 讀「`scripts/flights/{ICAO}/{YYYY-MM-DD}.json` ∪ `scripts/flight-list.json`」聯集（按 fr24_id 去重）—— 兩個 store 都看得到，不再有「讀不到某批」問題。fetch-flights 寫 per-date 檔為 merge-write（不覆蓋）。
- 命名機場群：`scripts/airport-groups.json`（如 `TW`），fetch-flights/fetch-tracks 都吃 `--group TW`
- 庫存視圖：`npx tsx scripts/flights-inventory.ts --group TW` — 每座機場的時刻表/已抓軌跡/缺口/補完 credits（通用版，戰役專用是 campaign-status）
- ⚠️ fetch-tracks 安全網：沒帶 `--max-credits`/`--limit`/`--dry-run` 任一 → 自動 dry-run，不會手滑噴 credit

## 部署流程

```bash
# 1. 確認 build
npm run typecheck

# 2. Push 後 Zeabur 自動 build

# 3. Zeabur 終端機拉資料（Alpine 容器無 bash 且 WORKDIR=/，須 sh + 絕對路徑）
sh /app/scripts/pull-from-s3.sh
```

> ⚠️ Region 清單分散兩處 hardcode：`split-tracks.ts`（產出）與 `pull-from-s3.sh` 的 `for R in ...`（消費）。新增 region 時兩邊都要同步改（UK、CN 都曾漏加）。

## 時區

- 所有 UI 時間顯示為台灣時間（UTC+8）
- `timeToUnixTW()` 接受台灣時間字串
- 場景預設的 `time` 欄位為台灣時間
- FR24 API 的 session key 為 UTC/ISO 格式

## 功能文件

已完成功能的細節（功能清單、相關檔案、技術決策）外移至 `docs/features/`：

- [Cinema Mode](docs/features/cinema-mode.md) — 速度選項、Orbit、Keyframe 序列、儲存/載入
- [Color Theme System](docs/features/color-theme-system.md) — 6 組 preset、多色停漸層、即時微調
- [Recording Overlay](docs/features/recording-overlay.md) — 動態 overlay、右下角資訊、4K 錄製
- [Dynamic Viewshed](docs/features/dynamic-viewshed.md) — Track Single 視域扇形 / 掃描線
- [Atlas Bloom · Globe](docs/features/atlas-bloom-globe.md) — 機場總覽 Three.js additive bloom 星圖 + custom layer 貼合 Mapbox 球體（可跨專案移植）

YouTube 影片錄製 + 後製流程 → `/video-production` skill（`.claude/skills/video-production/SKILL.md`）。
