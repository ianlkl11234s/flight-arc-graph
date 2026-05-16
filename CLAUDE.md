# Flight Arc — 專案規則

## 📋 資料抓取狀態

**任何關於「下一步抓哪些機場」「目前抓到哪了」的討論，先讀**
👉 [`docs/backlog/data-fetching-status.md`](docs/backlog/data-fetching-status.md)

該檔案追蹤：目標機場群、主動/被動狀態、API 額度預估、操作指令。每完成一輪抓取後同步更新。

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
- 航班清單：`scripts/flight-list.json`（Step 1 產出，gitignored）

## 部署流程

```bash
# 1. 確認 build
npm run typecheck

# 2. Push 後 Zeabur 自動 build

# 3. Zeabur 終端機拉資料
bash scripts/pull-from-s3.sh
```

## 時區

- 所有 UI 時間顯示為台灣時間（UTC+8）
- `timeToUnixTW()` 接受台灣時間字串
- 場景預設的 `time` 欄位為台灣時間
- FR24 API 的 session key 為 UTC/ISO 格式

## Cinema Mode（已完成）

### 功能清單
1. **速度選項**：1x、15x、30x、60x、120x、300x、600x
2. **Orbit 鏡頭旋轉**：Capture 模式下的 Cinema Bar，速度 0.2~8°/s，CW/CCW
3. **漸進式軌跡**：靜態軌跡 `progressive` 模式（飛過才顯示）
4. **Keyframe 系統**：擷取 → 排列 → 自動播放序列
   - Hold 階段（still / orbit with speed/direction）
   - Easing（ease-in-out / linear / ease-out）
   - Recapture、Loop、總時長顯示
   - Duration 輸入支援分:秒格式（m:ss），上限 99m59s
5. **儲存/載入**：localStorage 自動保存 + JSON 匯出/匯入
6. **收合式 CinemaBar**：▼ 收合 / Cinema ▲ 展開

### 新增檔案
- `src/hooks/useCinemaCamera.ts` — 鏡頭運動 hook（Orbit + Keyframe + Save/Load）
- `src/components/CinemaBar.tsx` — Capture 模式下的鏡頭控制 UI

## YouTube 影片製作流程（已完成）

### 標準流程

```bash
# Step 1: 開專用 Chrome（1920x1080，無 Retina 縮放）
npm run video:chrome

# Step 2: 在 Chrome 中開啟網頁 → Capture Mode → Sequence
#   - 設好 Keyframes（鏡頭序列）
#   - 按 HQ 按鈕 → 離線逐幀匯出 → 自動下載 .webm
#   - 檔案存到 video/ 資料夾

# Step 3: 合成最終影片（影片循環 + 音樂循環 → 指定長度）
npm run video:compose video/你的HQ檔.webm "music/Lo-fi v3.mp3" 600
#                                                                 ↑ 秒數（600=10分鐘）
```

### 技術細節
- **HQ 匯出**：`captureStream(0)` 手動幀模式，離線逐幀渲染
- **Composite Canvas**：map canvas + vignette + 標題文字合成到離屏 canvas
- **FFmpeg `-r 30`**（在 `-i` 之前）：修正 HQ 匯出的 variable timestamp → 強制 30fps
- **攝影輔助框**：16:9 邊框 + 中心準心 + 三分法格線（HTML overlay，不會錄進影片）
- 錄製中自動隱藏：vignette、標題、Trail 按鈕、ESC 按鈕（由 composite canvas 繪製）
- CinemaBar 錄製中保持可見（HTML overlay 不會被錄到）

### 相關檔案
- `src/hooks/useCanvasRecorder.ts` — 即時錄製 + HQ 離線匯出
- `src/components/RecordingGuide.tsx` — 16:9 攝影輔助框
- `src/components/CinemaBar.tsx` — REC / HQ 按鈕
- `scripts/compose-video.sh` — FFmpeg 合成腳本
- `video/` — HQ 匯出的 .webm 素材
- `music/` — Suno 音樂檔案
- `output/` — 合成完的 MP4 成品

## Color Theme System（已完成）

可自訂所有 3D/2D 渲染元素的配色。

### 功能
- **6 組 Preset**：Default、Warm、Ocean、Neon、Mono、Sunset
- **即時微調**：每個顏色都有 color picker，改色即時反映到地圖
- **多色停漸層**：靜態軌跡支援 2~5 個色停（低空 → 中空 → 高空）
- **localStorage 持久化**：選擇的主題會記住

### 可調整元素
| 元素 | 說明 |
|------|------|
| Trails (×5) | 動態光軌 5 色（Additive Blending） |
| Static Gradient | 靜態軌跡高度漸層（多色停） |
| Orb | 光球 glow 色 |
| 2D Map (×2) | Mapbox 2D 軌跡漸層（A→B） |

### 新增檔案
- `src/types/colorTheme.ts` — ColorTheme interface + 6 組 preset 定義

### 技術細節
- `FlightScene.setColorTheme(theme)` — 更新所有 Three.js material
- `setMapTrailColors(hexA, hexB)` — 更新 Mapbox 2D 軌跡色
- Preset 選擇清除 override，微調產生 override 覆蓋 preset
- 暗色主題用自訂 theme，亮色主題維持固定配色

## Recording Overlay（已完成）

### 動態 Overlay
- 左上角的日期時間 + 相機角度**每幀更新**（非靜態快照）
- `OverlayProvider` callback 模式，REC / HQ 模式都生效

### 右下角資訊
- 播放速度（`×60`，1x 時不顯示）
- 即時航班數量（`42 flights`）
- 資料來源（`Data: Flightradar24`）

### 4K 錄製
```bash
npm run video:chrome       # 1080p（原本）
npm run video:chrome:4k    # 4K（DPR=2 全螢幕）
```

## Dynamic Viewshed（已完成）

Track Single 模式下的動態視域分析：

### 功能
- **3D 扇形 mesh**（Three.js）：左右舷各 50° FOV，per-vertex alpha 漸層
- **3D 掃描線**（Three.js LineSegments）：從飛機射向地面弧線
- **動態半徑**：根據高度 20→60→120→150km（大氣衰減上限）
- **主題色**：Dark=白、Light=橘、Satellite=金黃
- **可調參數**：View（不透明度 0~2）、Edge（邊緣銳利度 0~1）

### 技術決策
- **用 Three.js 而非 Mapbox GeoJSON**：`source.setData()` 每幀 2-3ms（瓶頸），改用 Float32Array buffer update = 0.01ms
- **depthTest: false**：避免 Mapbox 3D terrain 遮擋扇形

### 新增檔案
- `src/map/viewshedOverlay.ts` — 純計算工具（幾何、半徑、航向，無 Mapbox 依賴）
