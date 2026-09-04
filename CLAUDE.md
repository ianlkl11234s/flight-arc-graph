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
- ⚠️ **`Flight.path` 是 `TrackPath` 類別，不是陣列**（`src/types/trackPath.ts`，SoA typed array）。用 `p.lat(i)` / `p.lng(i)` / `p.alt(i)` / `p.t(i)` / `p.length` 存取；`p.at(i)` 會配置新陣列，**熱路徑不要用**。沒有 `.map()` / `for..of`
- ⚠️ **要觸發重繪一律走 `src/map/repaintScheduler.ts`**，不要直接呼叫 `map.triggerRepaint()`：有事發生用 `notifyActivity(map)`，只是裝飾動畫（光球呼吸、極光 shimmer）用 `requestDecorativeRepaint(map)`。直接呼叫會繞過「暫停降頻 / 30 秒閒置停止」的節流

## 資料架構

- **高度單位**：所有軌跡高度一律**公尺**（磁碟上是 `path[i][2]`，前端載入後是 `TrackPath` 的 `alt(i)`）。2026-07-27 修正 fetch-tracks 舊 bug（`alt>1000` 才轉換，≤1000 ft 以生英呎落地）並以 `scripts/oneoff/migrate-alt-units.ts` 全量反解存量資料（marker：`public/tracks/.alt-units-migrated`，不可重跑）；前端 loader 不再做任何單位轉換
- **LOD 分層**（2026-09-03 起）：每個 daily shard 另有 `{date}.l1.jsonl`（eps 50 m）與 `.l2.jsonl`（eps 250 m），由 `split-tracks.ts --lod-only` 產出（3D DP，高度 ×3）。前端依 zoom band 換層：**z > 9.5 → L0、7.2–9.5 → L1、≤ 7.2 → L2**（±0.3 hysteresis）。
  - **換層只換 path 解析度，不換資料來源** —— 航班集合必須恆定，否則 Summary 數字會變
  - 缺 LOD 檔會 graceful fallback 到 L0，不會壞
  - `tracks/lod-files.txt`（每行 `相對路徑<TAB>bytes`）是 `pull-from-s3.sh` 用來知道有哪些 LOD 可拉的清單；主 manifest **不記錄** LOD。重產清單：`npx tsx scripts/split-tracks.ts --lod-manifest-only`
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

## 渲染改動的驗收（必做）

改任何影響畫面的東西，commit 前要過這三關（工具在 `scripts/perf/`，用法見其 README §5–§8）：

```bash
cd scripts/perf
node visual-check.mjs --compare       # 6 場景逐像素；門檻 pctOver8 < 0.15% 且不成塊
node summary-snapshot.mjs --compare    # Summary 面板數字必須完全相同
sh ab-run.sh <tag> s2                  # 效能 A/B
```

- **判讀 A/B 看 `brief.py` 的 `perFrame.script`，不要看 `busyPct`**（噪聲 ±6 個百分點，同一份程式碼連跑三次可以是 41/52/53%）
- **換螢幕、闔筆電再開、插拔外接顯示器之後 baseline 一律作廢重建**（`--baseline`），否則會看到假 FAIL。判別法：diff 若壓倒性落在 sidebar／底部控制列而地圖主體乾淨就是環境問題
- 每個 commit 通過驗收後就重建 baseline，否則後面的改動會把前面的合法差異算到自己頭上

## 部署流程

```bash
# 1. 確認 build
npm run typecheck

# 2. Push 後 Zeabur 自動 build

# 3. Zeabur 終端機拉資料（Alpine 容器無 bash 且 WORKDIR=/，須 sh + 絕對路徑）
sh /app/scripts/pull-from-s3.sh            # 含 LOD（L1/L2），約多 1.2 GB
sh /app/scripts/pull-from-s3.sh --no-lod   # 跳過 LOD：功能正常但拉遠時回落全解析度
```

也可以不進 Zeabur 終端機，用 CLI 直接跑（service id 見 `zeabur service list`）：
```bash
npx zeabur@latest service exec --id <service-id> -i=false -- \
  sh -c "nohup sh /app/scripts/pull-from-s3.sh > /data/pull-$(date +%Y%m%d).log 2>&1 & echo started"
```
LOD 有 9,476 個小檔、逐檔 wget，全新拉約需 2 小時；用 `find /data/tracks/airports -name '*.l?.jsonl' | wc -l` 看進度。

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
- [**軌跡渲染：現況與演進**](docs/features/trajectory-rendering.md) — 管線全貌、7 個月的架構演進、**踩過的坑與被推翻的假設**（改渲染前先看第三節）
- [Atlas Bloom · Globe](docs/features/atlas-bloom-globe.md) — 機場總覽 Three.js additive bloom 星圖 + custom layer 貼合 Mapbox 球體（可跨專案移植）

YouTube 影片錄製 + 後製流程 → `/video-production` skill（`.claude/skills/video-production/SKILL.md`）。
