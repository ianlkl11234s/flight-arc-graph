# Flight Arc 2.0

以全球機場為入口，探索、組合與比較飛行軌跡的互動式地圖工具。

Flight Arc 2.0 保留原有的 Three.js 光軌、全球地球、空域、統計與錄影能力，但把操作方式重整為「先找到機場，再組合 Selection，最後調整 View／Analyze／Capture」。桌面版是目前完整功能的主要使用環境。

## 版本狀態

| 項目 | 狀態 |
|------|------|
| 目前版本 | `v2.0.0` |
| 改版前基準 | `v1.0.0` |
| 主要分支 | `master` |
| 主要體驗 | Desktop Web |
| 手機版 | 已有基本 responsive shell，尚未達到桌面版完整功能對等 |
| PWA／iOS App | 尚未實作 |

`v1.0.0` 與 `v2.0.0` 都已保留為 Git tag，可用於比較或回復。

## 視覺輸出範例

以下圖片著重呈現地圖與錄影輸出；目前 v2 導覽與 Selection 介面以實際執行版本為準。

![Taiwan flight arc capture](screenshots/capture-all-taiwan.png)

![Flight arc with airspace](screenshots/capture-airspace.png)

## 快速開始

```bash
npm install
test -f .env || cp .env.example .env
npm run dev
```

開啟 Vite 顯示的本機網址，通常是 `http://127.0.0.1:5173` 或 `http://localhost:5173`。

`.env` 至少需要：

```env
VITE_MAPBOX_TOKEN=your_mapbox_token
```

`FR24_API_TOKEN` 只在執行資料抓取腳本時需要，不應放進前端程式碼。

## v2 操作流程

左側 Icon Rail 將主要操作分成四個工作區，另提供獨立的 Capture 模式；同一時間只開啟一個工作區面板，避免多個浮層互相遮擋。

1. **Explore**：透過全球 Airport Atlas 地圖發現機場。
2. **Selection**：從搜尋與機場目錄建立單一、多機場或預設機場組合。
3. **View**：調整顯示方式、色彩與空域圖層。
4. **Analyze**：查看摘要、篩選條件與航班統計。

**Capture** 不屬於工作區 panel；它會進入專用模式，設定鏡頭、動畫、資訊 overlay 與錄影輸出。

### Selection-first 機場選擇

機場搜尋是 v2 的主要入口。目前執行期目錄包含約 **2,650 座可搜尋機場**，其中 **2,303 座**可由軌跡 manifest 直接載入資料。

搜尋索引支援：

- ICAO、IATA 與 local code
- 機場中文名、英文名、別名與自訂關鍵字
- 城市
- 國家中文名、英文名與國家代碼
- 洲別中文名、英文名與洲別代碼

搜尋結果會考慮匹配程度、是否有可載入軌跡，以及既有軌跡筆數。目錄固定先列出台灣、日本，再列亞洲其他與其餘洲別；國家與機場依 manifest 的既有軌跡筆數排序。這個數字代表資料庫中的軌跡量，不是即時空中飛機數。

Selection 面板上方的標題、已選機場 chips 與搜尋欄採 sticky 配置，捲動長機場清單時仍可持續調整選擇。

目前內建七組常用組合：

- EU + LHR 紐帶
- TW 國際
- Taipei 機場群
- Bangkok 機場群
- 亞太樞紐
- 跨大西洋
- 倫敦機場群

套用預設組合時會保留應用程式 shell，只更新 Selection 與對應資料，不再回到初始載入畫面。

原有場景預設仍保留在 Selection 中，預設折疊，需要時再展開使用。

## 主要功能

### Explore：Airport Atlas

- 以全球地球檢視機場分布與相對流量。
- Atlas 一般圓點可點擊查看機場資訊；有可用軌跡的機場可直接加入目前 Selection，planned 機場則只顯示資訊。
- Bloom 星圖層負責視覺強化；實際 hit testing 由可互動的機場圓點處理。
- 支援手動旋轉地球，右下方方向控制可辨識目前南北方向並重設為北上南下。

### View：軌跡與視覺設定

- Mapbox GL JS 地圖搭配 Three.js Custom Layer 即時繪製大量軌跡。
- 支援低縮放全球視角、相機旋轉與縮放，以及 2D Flat／3D Altitude 軌跡渲染。
- 可切換航線軌跡、空域快照及 All／Departure／Arrival。
- 支援單日顯示與多日期比較。
- 內建多組光軌色彩 preset，可自訂多段漸層與機場分色。
- 可依 Local／Origin／Destination 等方式呈現比較色彩。

### View：限制空域

限制空域 polygon 是固定 GeoJSON 圖層，載入後由前端 cache，並使用 Three.js shader 呈現。它與 Data Source 中按日載入的「空域航班快照」是兩套不同資料。現有限制空域分類包括：

- ADIZ
- Restricted
- Prohibited／Danger
- Training／ULZ
- TMA／Control
- FIR

另可顯示海峽中線 overlay。點擊可互動區域時會顯示名稱、分類、高度、開放時間、備註與重疊空域等資訊；禁航區功能在 v2 中持續保留。

### Analyze：篩選與統計

- 顯示目前 Selection 的機場數、航班數、日期與資料摘要。
- 依機型、航空公司、用途、飛行時長與航線等維度上色或篩選。
- 支援出發／抵達、航空公司、機型等多條件篩選。
- Analyze 提供摘要，亦可由獨立的統計 tab 開啟完整統計與 drill-down。
- 航班點位大小可依機型縮放；Atlas 的機場點大小則用來呈現相對流量。

### Capture：Cinema 與錄影

- Static、Orbit、Sequence 三種鏡頭模式。
- Sequence 支援 keyframe、循環與 ping-pong 播放。
- 鏡頭序列可儲存在瀏覽器，亦可匯入／匯出 JSON。
- 支援即時 REC 與非即時高畫質逐幀匯出。
- 錄影 overlay 可包含標題、機場、時間、鏡頭與航班數。

瀏覽器錄影目前使用 `MediaRecorder`、Canvas capture 與 WebM。桌面 Chromium 是主要驗收環境；手機雖可看見 Capture 入口，Safari／iOS 的 codec、下載、操作流程及逐幀錄影尚未完成相容性驗收。

## 手機相容性

目前在窄於 768px 的畫面已有 Compact Header、Timeline、三段式 Bottom Sheet 與 safe-area 處理，可作為手機瀏覽的基礎，但尚未完成 v2 全功能的手機操作重整：

- 桌面版仍是 Selection、Analyze、Capture 與空域資訊的主要完整介面。
- 部分觸控目標與面板捲動已調整，但尚未建立完整 drag gesture 系統。
- 尚未加入 PWA manifest、service worker 或離線資料策略。
- 尚未建立 Capacitor／原生 iOS 專案。

因此目前定位是 **Desktop-first responsive Web**，而不是已完成的手機 App。

## 軌跡資料量（Track Coverage）

以下數字以 `public/tracks/manifest.json` 為準，最後重建時間為 **2026-08-30 03:29 UTC**：

| 指標 | 數量 |
|------|-----:|
| 可載入軌跡的機場 | 2,303 |
| 去重後軌跡 | 82,390 |
| Per-airport daily shards | 4,738 |
| 涵蓋日期 | 52 日 |
| 日期範圍 | 2026-02-17 ～ 2026-07-12 |

### Region 檔案

| Region | 軌跡數 | 檔案大小 |
|--------|-------:|---------:|
| Other | 38,000 | 12.19 MiB |
| US | 26,091 | 7.52 MiB |
| TW | 12,230 | 3.78 MiB |
| CN | 12,211 | 2.68 MiB |
| JP | 5,624 | 1.67 MiB |
| UK | 4,223 | 1.29 MiB |
| KR | 2,826 | 0.83 MiB |
| TH | 2,694 | 0.87 MiB |
| HK | 1,878 | 0.62 MiB |
| All | 82,390 | 約 23.87 MiB |

Region 之間可能重疊，不可將各列相加當作全球唯一軌跡總數；唯一總數以 `All` 與 manifest 為準。

### 軌跡量 Top 15 機場

| 排名 | ICAO | 軌跡數 |
|----:|------|-------:|
| 1 | RCTP | 7,693 |
| 2 | OMDB | 2,976 |
| 3 | WSSS | 2,050 |
| 4 | KORD | 2,009 |
| 5 | KATL | 1,887 |
| 6 | VHHH | 1,878 |
| 7 | KLAX | 1,845 |
| 8 | RCKH | 1,806 |
| 9 | ZSPD | 1,735 |
| 10 | ZGGG | 1,559 |
| 11 | RCSS | 1,527 |
| 12 | KDFW | 1,521 |
| 13 | KSFO | 1,518 |
| 14 | KDEN | 1,505 |
| 15 | RKSI | 1,505 |

抓取進度、下一輪目標與額度估算請見 [資料抓取狀態](docs/backlog/data-fetching-status.md)。每次重新抓取並執行 `split-tracks.ts` 後，這一節也必須依新 manifest 同步更新。

## 資料載入與效能

### 軌跡檔案結構

```text
tracks/
├── manifest.json
├── airports/
│   ├── {ICAO}.jsonl                 # 完整 per-airport fallback
│   └── {ICAO}/{YYYY-MM-DD}.jsonl    # Selection 單日載入優先使用
└── regions/
    └── {region}.jsonl               # 區域／全球航班總覽 LOD
```

一般 airport／airspace asset 的 fallback 順序為：

1. `/data/`：部署環境掛載的 volume。
2. `/tracks/` 或 `/airspace/`：本機 `public/` 靜態檔。
3. S3：遠端 fallback。

Region LOD 目前只直接嘗試 `/data/tracks/regions/` 與本機 `/tracks/regions/`；若 LOD 不存在，會改走 per-airport fallback，而 per-airport 檔案才可繼續嘗試 S3。

### v2 載入策略

- 單一或多機場 Selection 優先依「機場 + 日期」載入 daily shard，不再因選到桃園機場就一次載入所有日期。
- 沒有 daily shard 時才回退到完整 `{ICAO}.jsonl`，並在前端依日期過濾。
- 區域與全球航班總覽優先使用 region LOD，避免直接展開所有 per-airport 原始檔；Airport Atlas 本身使用 `airport-points.geojson`。
- Selection 快速切換使用 `AbortSignal` 取消已過期請求，避免舊資料晚到後覆蓋新選擇。
- 機場、region 與空域資料都有 LRU cache 與 path-point budget，限制長時間操作的記憶體成長。

目前 cache 上限：

| Cache | 項目上限 | Path points 上限 |
|-------|---------:|-----------------:|
| Airport | 24 | 1,000,000 |
| Region | 4 | 500,000 |
| Airspace day | 14 | 600,000 |

首次冷啟動仍會顯示全畫面 Loading Screen；之後切換預設組合或 Selection 時保留主介面，只顯示較輕量的載入狀態。

所有軌跡 `path[i][2]` 高度單位統一為 **公尺**。歷史資料已完成遷移，前端 loader 不再做英呎／公尺猜測或轉換。

## 技術架構

| 類別 | 技術 |
|------|------|
| Frontend | React 19、TypeScript、Vite 6 |
| Map | Mapbox GL JS 3 |
| Realtime rendering | Three.js、Custom WebGL Layer、GLSL shaders |
| Data | JSONL／NDJSON、manifest、per-airport daily shards |
| Remote storage | AWS S3-compatible object storage |
| Deployment | Docker multi-stage build、nginx、Zeabur-compatible volume |

即時軌跡由 Three.js 管理，不使用 Mapbox GeoJSON `setData()` 逐幀更新，以降低大量動畫點位的 CPU 與資料複製成本。

### 主要程式位置

```text
src/
├── App.tsx                         # App shell、workspace 與整體狀態
├── components/
│   ├── IconRailSidebar.tsx         # 桌面工作區、Selection 與 Capture 入口
│   ├── AirportSelector.tsx         # 手機 Compact Header 的單機場選擇
│   ├── DeepAnalysisPanel.tsx       # 分析與篩選
│   ├── CinemaBar.tsx               # Cinema／錄影控制
│   └── MobileBottomSheet.tsx       # 手機版基礎 shell
├── data/
│   ├── airportSearch.ts            # 機場搜尋索引與排序
│   ├── flightLoader.ts             # 軌跡 lazy loading、fallback、cache
│   ├── airspaceLoader.ts           # 限制空域 GeoJSON 載入與 cache
│   └── flightStats.ts              # 統計資料
├── hooks/
│   ├── useFlightData.ts
│   ├── useCinemaCamera.ts
│   └── useCanvasRecorder.ts
├── map/
│   ├── MapView.tsx
│   ├── cameraPresets.ts
│   ├── savedSets.ts
│   ├── atlasGlowLayer.ts
│   └── customLayer.ts
└── three/
    ├── FlightScene.ts
    └── shaders/
```

功能設計文件：

- [Cinema Mode](docs/features/cinema-mode.md)
- [Color Theme System](docs/features/color-theme-system.md)
- [Recording Overlay](docs/features/recording-overlay.md)
- [Dynamic Viewshed](docs/features/dynamic-viewshed.md)
- [Atlas Bloom · Globe](docs/features/atlas-bloom-globe.md)
- [v2 UI／UX 初始規劃](docs/features/新的規劃.md)

## 開發與驗證

```bash
npm run dev
npm run typecheck
npm run build
npm run preview
```

每次 commit 前必須執行：

```bash
npm run typecheck
```

這個指令使用 `tsc -b`，與 CI/CD 的 TypeScript 檢查一致。

## 資料抓取與重建

資料抓取前先閱讀 [資料抓取狀態](docs/backlog/data-fetching-status.md)，確認目前接力點、目標機場群與 credits 預算。

以下是單一機場的小範圍 smoke 與重建範例。完整機場群的 `--group`、`--range`、`--batch-size` 與 credits 上限，應直接依資料抓取狀態文件當輪記錄執行，不能把 smoke 的結果當成完整 group：

```bash
# 1. 單一機場、單一日期 smoke（會消耗 API credits）
npm run fetch:flights -- --airports RCTP --from 2026-02-18 --to 2026-02-18 --batch-size 1

# 2. 對同一範圍先 dry-run，檢查待處理數量與額度
npm run fetch:tracks -- --airports RCTP --date 2026-02-18 --dry-run

# 3. 確認後，對同一範圍帶明確 credits 上限實跑
npm run fetch:tracks -- --airports RCTP --date 2026-02-18 --max-credits 4000

# 4. 去重並重建 daily shards、regions 與 manifest
npx tsx scripts/split-tracks.ts

# 5. 確認有正式部署意圖後，才上傳分拆資料
npm run s3:upload
```

`fetch-tracks.ts` 有安全網：若未提供 `--max-credits`、`--limit` 或 `--dry-run` 任一參數，會自動切換為 dry-run，不會直接消耗 API credits。

`fetch-flights.ts` 沒有相同的自動 dry-run 安全網。正式執行前應明確指定日期範圍，並先用小型 `--batch-size` 驗證；確認後再依額度規劃擴大批次。

`npm run s3:upload` 會直接寫入遠端 object storage，且會重傳 manifest／region 檔案。執行前必須確認 S3 credentials、bucket、prefix、本機 manifest 與部署意圖；它不是一般開發驗證步驟。

航班清單與抓取進度檔多數位於 gitignore；Git tag 或 branch 不會自動備份這些檔案。需要保留抓取工作現場時，應另外備份 gitignored 資料或確認其仍存在於 volume／S3。

## 部署

Docker image 會在 build 階段建置 Vite 靜態檔，再由 nginx 提供 SPA 與資料檔案。`VITE_MAPBOX_TOKEN` 是 build-time 變數，會被編入前端 bundle；請使用可公開、且限制允許來源的 Mapbox token。

部署後若軌跡資料位於 Zeabur volume，可在 Alpine 容器中執行：

```sh
sh /app/scripts/pull-from-s3.sh
```

新增 region 時，必須同時更新 `scripts/split-tracks.ts` 的產出清單與 `scripts/pull-from-s3.sh` 的下載清單。

## 版本規則

本專案從 v2 開始以 [Semantic Versioning](https://semver.org/) 管理對外版本：

- Major：介面、資料合約或使用方式有不相容的大改版。
- Minor：向下相容的新功能。
- Patch：向下相容的修正。

目前保留：

- `v1.0.0`：改版前穩定基準。
- `v2.0.0`：Selection-first UI／UX 改版起點。

## 專案沿革

| 時期 | 里程碑 |
|------|--------|
| 2026/02 | Taiwan Flight Arc：台灣機場、FR24 軌跡與 Three.js 光軌 |
| 2026/02–04 | 空域快照、統計、S3 增量資料、國際機場、多日期比較與 Cinema |
| 2026/04–08 | 全球機場與 per-airport lazy loading、Atlas Bloom、分析與錄影工具擴充 |
| 2026/08 | Flight Arc `v2.0.0`：Selection-first 導覽、全球搜尋、daily shard 載入與記憶體管理 |

## License

MIT License. 詳見 [LICENSE](LICENSE)。
