# Flight Arc

航班軌跡生成式藝術（Generative Art）視覺化。涵蓋東亞及世界特色機場，將航班起降軌跡轉化為光軌藝術作品。

## Screenshots

![控制面板 — 航線軌跡模式，桃園機場視角](screenshots/settings-panel.png)
![Capture 模式 — 全台航班俯瞰](screenshots/capture-all-taiwan.png)
![Capture 模式 — 空域快照鳥瞰](screenshots/capture-airspace.png)
![Flight Statistics — RCTP 桃園機場統計面板](screenshots/flight-statistics.png)
![機場選擇 — 區域機場快速跳轉](screenshots/airport-locations.png)

## 涵蓋範圍

95+ 座機場，275 個 JSONL 資料檔，10,700+ 筆完整軌跡航班。

| 區域 | 機場數 | 說明 |
|------|--------|------|
| Taiwan (TW) | 16 | 民用 + 軍民合用機場 |
| Japan (JP) | 70+ | 七大主要 + 地方 + 沖繩離島，分層級顯示 |
| Hong Kong (HK) | 1 | VHHH 香港國際機場 |
| World | 2+ | Madeira (LPMA)、Paro (VQPR) 等特色機場 |

Region Pills UI 可切換 TW / JP / HK / World / All，每個區域有對應的場景預設與攝影機視角。

## 視覺概念

- **光軌**：航班軌跡以彗尾狀漸層光軌呈現，additive blending 疊加自然增亮
- **光球**：每架飛機以多層發光球體標示當前位置，搭配呼吸動畫
- **閃爍燈**：紅色雙閃警示燈，模擬真實防撞燈號
- **靜態軌跡**：全部航班路徑同時顯示，3D 模式依高度著色（暖橘→冷藍），2D 模式每航班隨機配色
- **機場邊界**：OSM 機場多邊形，暗色主題白色填充 + 光暈，亮色主題金黃色填充 + 光暈
- **主題適應**：所有 UI 元件與視覺效果自動適應底圖明暗
- **拍攝模式**：一鍵隱藏 UI，暗角 vignette 效果，適合截圖輸出

## 功能

### 資料來源切換

| 模式 | 資料來源 | 說明 |
|------|---------|------|
| 航線軌跡 | FlightRadar24 API | FR24 精細軌跡（95+ 機場起降航線），10,700+ 航班 |
| 空域快照 | OpenSky Network / ADS-B | 台灣附近空域全覆蓋掃描，涵蓋過境、軍機等 |

### 區域選擇（Region Selector）

Region Pills 切換地理區域：TW / JP / HK / World / All。切換時自動載入對應機場資料、更新機場選單與場景預設。日本機場依流量分為 Major / Regional 層級。

### 資料載入

Per-airport lazy loading 架構：每座機場獨立 JSONL 檔案（`tracks/airports/{ICAO}.jsonl`），NDJSON streaming 逐行解析 + progressive rendering，選擇機場或區域時才載入，大幅減少初始載入量。

區域總覽使用 `tracks/regions/{region}.jsonl` 預聚合資料。

### 機型篩選（Aircraft Filter）

空域快照模式下可依機型分類篩選：Military / Business Jet / Helicopter / Turboprop / Narrowbody / Widebody 等類別。

### 檢視模式

設定面板將檢視控制拆為正交的三個維度，可自由組合：

**Scope（地理範圍）**

| 模式 | 說明 |
|------|------|
| This Airport | 選定機場相關航班 |
| Region | 當前區域所有航班 |

**Track Mode（軌跡模式）**

| 模式 | 說明 |
|------|------|
| Stack All | 顯示所有航班軌跡 |
| Track Single | 追蹤單一航班（相機鎖定） |

**±12h Window**

Flight Trails 模式下的子選項，開啟後僅顯示當前播放時間前後 12 小時內的航班。

### 渲染模式

| 模式 | 靜態軌跡 | 特色 |
|------|---------|------|
| 3D Altitude | Three.js LineSegments | 航線有高度，依海拔著色漸變 |
| 2D Flat | Mapbox 原生 line layer | 平面俯瞰，每航班獨立配色 |

### 即時參數調整

| 控制項 | 說明 |
|--------|------|
| Alt ×1.0~5.0 | 高度誇張倍率 |
| Z +0~200m | 基準高度偏移 |
| Opacity | 靜態軌跡不透明度 |
| Orb | 光球大小 |
| APT | 機場填充不透明度 |
| Glow | 機場光暈強度 |

### 日期導航（Calendar）

行事曆日期選擇器，標記 full / partial 資料完整度：

- 日期範圍（Range Days）：1d / 3d / 7d，可同時顯示多日資料
- 播放速度：30x ~ 600x 加速
- 進度條拖曳 seek
- 前/後日快速切換按鈕

### 場景預設（Scene Presets）

每個區域內建推薦場景，一鍵套用完整設定（資料來源、範圍、日期、時間、視角、透明度、機型篩選）：

| 場景 | 資料來源 | 說明 |
|------|---------|------|
| 台灣空中走廊 | 空域快照 | 凌晨空中走廊全景 |
| 活躍中國境內班機 | 空域快照 | 中國沿海航線 |
| 桃園機場起降 | 航線軌跡 | RCTP 近距起降 |
| 全台航線總覽 | 航線軌跡 | 全台航班鳥瞰 |
| P-8 反潛機巡邏路徑 | 空域快照 | 軍機篩選 + 高透明度 |

### Icon Rail Sidebar（桌面版）

左側圖示列 + 浮動面板系統：

| 面板 | 功能 |
|------|------|
| 設定 | 顯示模式、渲染模式、底圖樣式、視覺參數滑桿 |
| 位置 | 區域選擇 + 場景預設 + 機場快速跳轉 |
| 行事曆 | 日期選擇器（full/partial 標記） |
| 統計 | 開啟 Flight Statistics 面板 |
| 資訊 | 開啟 Info Modal |

### Loading Screen

動畫載入畫面：

- 30 秒毫秒級倒數計時（requestAnimationFrame）
- SVG 飛機沿弧線飛行動畫（含尾跡粒子、防撞燈閃爍）
- 隨機輪播使用技巧（Tips），每 4 秒切換

### Info Modal（使用指南）

多頁式資訊面板，支援中英切換：

| 頁面 | 內容 |
|------|------|
| 操作指南 | 地圖操作、點擊互動、工具列說明 |
| 功能圖例 | 視覺元素、參數控制、機場標記 |
| 資料來源 | 四大資料源詳細說明 |
| 使用技巧 | 所有 Tips 分類展示 |
| 關於專案 | 技術堆疊、架構亮點 |
| 個人介紹 | 社群連結、其他專案 |

### Flight Statistics 側邊面板

右側可拖拉寬度（280~720px）的統計分析面板，JetBrains Mono 字型 + glass-morphism 風格：

| 區塊 | 說明 |
|------|------|
| Date Selector | 多選日期篩選，所有統計即時更新 |
| Departures & Arrivals | SVG 折線圖，實線=起飛、虛線=降落 |
| Hourly Pattern | 垂直長條圖，24 小時分佈 |
| Airlines Share | 堆疊水平長條，前 4 大航空公司市佔比例 |
| Top Routes | 卡片式航線清單，支援三段展開 + drill-down |
| Top Destinations | 按國家分組的目的地統計，可 drill-down |
| Aircraft Types | 機型水平長條，三段展開 |
| Fleet Mix | Narrowbody / Widebody / Regional 分類統計 |
| Flight Duration | 短程 / 區域 / 中程 / 長程分佈 |
| Region Tab | 區域內機場比較、可達目的地（按國家）、區域航線統計 |

### 其他

- 6 種 Mapbox 底圖樣式（Dark / Light / Satellite / Navigation Night 等）
- 95+ 座機場預設視角，選單顯示名稱與 IATA 代碼
- Capture 拍攝模式（暗角 vignette + 機場名稱 + 時間標記）

### 手機版適配（Responsive）

768px 以下自動切換為手機版 layout，最大化地圖可視區域：

- **Compact Header**（44px）：機場選擇 + Info / Capture / 3D 切換
- **Timeline Bar**：固定在 header 下方，Play 按鈕 44×44 觸控友善
- **Bottom Sheet**：三段展開（收合 → 半開含 FlightPicker → 全開含 Sliders + StyleSelector）
- **Safe Area**：適配 iPhone Home Indicator（`env(safe-area-inset-bottom)`）

## 技術棧

| 層級 | 技術 | 用途 |
|------|------|------|
| 框架 | React 19 + TypeScript + Vite 6 | 應用骨架 |
| 地圖 | Mapbox GL JS v3 | 3D terrain、底圖、相機控制 |
| 3D 渲染 | Three.js r172 | 光軌、光球、閃爍燈、靜態軌跡、批量渲染 |
| Shader | GLSL | 光軌漸層材質、批量軌跡材質 |
| 資料串流 | NDJSON Streaming | Per-airport lazy loading + progressive rendering |
| 資料 | FlightRadar24 API + OpenSky Network | 航線軌跡 + 空域掃描 |
| 地理 | OpenStreetMap / Overpass API | 機場邊界多邊形 |
| 雲端 | AWS S3 | 航班資料儲存與增量更新 |
| 部署 | Docker + Nginx + Zeabur | 容器化部署 |

## 架構

### Three.js + Mapbox 整合

透過 Mapbox `CustomLayer` 在同一個 WebGL context 中嵌入 Three.js 場景。Mapbox 負責地圖 + 相機，Three.js 負責光軌渲染，座標透過 `MercatorCoordinate` 同步。

```
Mapbox GL JS（底圖 + 3D terrain + 相機控制）
  └── CustomLayer（renderingMode: '3d'）
        └── Three.js Scene
              ├── Static Trails（LineSegments, per-vertex altitude color）
              ├── BatchedTrails（批量渲染，GLSL instancing）
              ├── LightTrail（GLSL gradient shader trail）
              ├── InstancedOrbs（Instanced IcosahedronGeometry）
              ├── LightOrb（多層球體 + AdditiveBlending）
              └── BlinkingLight（red flash mesh）
```

### 資料架構

```
public/tracks/
├── airports/                    # Per-airport JSONL（275 檔）
│   ├── RCTP.jsonl              # 每座機場獨立檔案
│   ├── RJTT.jsonl
│   └── ...
├── regions/                     # 區域總覽
│   ├── TW.jsonl
│   ├── JP.jsonl
│   ├── HK.jsonl
│   └── other.jsonl
├── manifest.json                # 日期/機場/航班數 metadata
└── aviation_data.json           # 完整合併資料（gitignored）

public/airspace/
├── days/                        # 每日空域快照
│   └── YYYY-MM-DD.jsonl
└── aviation_data.json

public/airports.geojson          # OSM 機場邊界多邊形
```

### 資料流

```
1. npm run fetch:flights         → 抓航班清單（FR24 API）
2. npm run fetch:tracks          → 抓飛行軌跡（支援 --airports 篩選）
3. scripts/split-tracks.ts       → 拆分為 per-airport JSONL
4. npm run fuse:data             → 合併多源資料（空域快照）
5. npm run s3:upload             → 上傳到 S3 flight-arc/
```

### 專案結構

```
Flight Arc/
├── public/
│   ├── tracks/                        # 航線軌跡資料（gitignored）
│   │   ├── airports/{ICAO}.jsonl      # Per-airport JSONL（275 檔）
│   │   ├── regions/{region}.jsonl     # 區域總覽
│   │   └── manifest.json
│   ├── airspace/                      # 空域快照資料（gitignored）
│   │   └── days/YYYY-MM-DD.jsonl
│   ├── airports.geojson               # OSM 機場邊界多邊形
│   └── screenshots/
├── scripts/
│   ├── fetch-flights.ts               # 航班清單擷取（FR24 API）
│   ├── fetch-tracks.ts                # 飛行軌跡擷取（--airports filter）
│   ├── split-tracks.ts                # 拆分為 per-airport JSONL
│   ├── fetch-airport-boundaries.ts    # OSM 機場邊界下載
│   ├── backup-to-s3.ts               # S3 備份上傳
│   ├── upload-to-s3.ts               # S3 上傳（按日期 + manifest）
│   └── fuse-collector-data.ts         # 合併多源資料
├── src/
│   ├── App.tsx                        # 主應用 + 狀態管理
│   ├── types/index.ts                 # 型別定義（Region, Scope 等）
│   ├── data/
│   │   ├── flightLoader.ts            # JSONL 串流載入、篩選、前處理
│   │   ├── flightStats.ts             # 統計計算引擎
│   │   ├── s3Loader.ts               # S3 增量更新
│   │   ├── aircraftCategories.ts      # 機型分類篩選
│   │   └── tips.ts                    # 使用技巧
│   ├── map/
│   │   ├── MapView.tsx                # Mapbox 容器 + 機場圖層
│   │   ├── customLayer.ts             # CustomLayer ↔ Three.js 橋接
│   │   ├── staticTrails.ts            # 2D Mapbox 原生軌跡圖層
│   │   └── cameraPresets.ts           # 95+ 機場視角預設 + 區域分組
│   ├── three/
│   │   ├── FlightScene.ts             # 場景管理器
│   │   ├── LightOrb.ts               # 多層球體光球
│   │   ├── LightTrail.ts             # GLSL 光軌渲染
│   │   ├── BlinkingLight.ts           # 紅色閃爍燈
│   │   ├── BatchedTrails.ts           # 批量軌跡渲染
│   │   ├── InstancedOrbs.ts           # 實例化球體渲染
│   │   └── shaders/                   # GLSL vertex/fragment shaders
│   ├── hooks/
│   │   ├── useFlightData.ts           # 資料載入 hook（JSONL streaming）
│   │   ├── useTimeline.ts             # 日期導航 + 時間軸播放
│   │   └── useIsMobile.ts             # 響應式斷點偵測
│   ├── components/
│   │   ├── IconRailSidebar.tsx        # 左側圖示列 + 區域選擇 + 場景預設
│   │   ├── LoadingScreen.tsx          # 動畫載入畫面
│   │   ├── InfoModal.tsx              # 多頁式使用指南
│   │   ├── FlightStatsPanel.tsx       # 右側統計面板
│   │   ├── DataSourceToggle.tsx       # 航線軌跡 / 空域快照 切換
│   │   ├── AircraftTypeFilter.tsx     # 機型分類篩選
│   │   ├── TimelineControls.tsx       # 時間軸控制
│   │   ├── FlightPicker.tsx           # Scope + TrackMode 選擇
│   │   ├── AirportSelector.tsx        # 機場下拉選單（按區域分組）
│   │   ├── StyleSelector.tsx          # 底圖樣式選擇
│   │   └── MobileBottomSheet.tsx      # 手機版三段式底部面板
│   ├── utils/
│   │   ├── coordinates.ts             # MercatorCoordinate 轉換
│   │   ├── interpolation.ts           # 軌跡時間插值
│   │   ├── dateUtils.ts               # 時區日期/時間轉換
│   │   └── flightIndex.ts             # 航班索引
│   └── workers/
│       └── coordTransform.worker.ts   # 座標轉換 Web Worker
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .env.example
├── package.json
├── vite.config.ts
└── LICENSE
```

## 部署

### Docker

Multi-stage build：Node 22-alpine 編譯 → Nginx Alpine 服務。

```bash
docker compose up -d --build

# 或手動建置
docker build --build-arg VITE_MAPBOX_TOKEN=your_token -t flight-arc .
docker run -p 3721:8080 flight-arc
```

`VITE_MAPBOX_TOKEN` 必須在 build time 注入（Vite 會嵌入靜態檔）。

### Zeabur 部署

平台自動偵測 Dockerfile 並 build。額外設定：

- **環境變數**：`VITE_MAPBOX_TOKEN`（Build Variables）
- **/data Volume**：掛載持久化儲存，Nginx 會服務 `/data/` 路徑
- **S3 同步**：容器啟動後執行 `scripts/sync-s3-to-data.sh` 下載最新資料到 `/data`

## 航班資料（Flight API）

本專案使用 [FlightRadar24 API](https://fr24api.flightradar24.com/) 作為航班軌跡資料來源。

### 取得 API Token

1. 至 [FlightRadar24](https://fr24api.flightradar24.com/) 註冊帳號並訂閱方案（Essential 以上）
2. 進入 [Key Management](https://fr24api.flightradar24.com/key-management) 建立 API Token
3. 將 Token 寫入 `.env`：

```bash
cp .env.example .env
# 編輯 .env，填入 FR24_API_TOKEN
```

### 資料擷取腳本

```bash
# Step 1: 取得航班清單（可指定機場）
npm run fetch:flights

# Step 2: 逐一撈取飛行軌跡
npm run fetch:tracks -- --date 2026-02-18 --airports RCTP,RJTT

# Step 3: 拆分為 per-airport JSONL
npx tsx scripts/split-tracks.ts

# Step 4: 下載機場邊界多邊形
npx tsx scripts/fetch-airport-boundaries.ts

# Step 5: 備份到 S3
npx tsx scripts/backup-to-s3.ts
```

腳本支援**中斷續接**：如果因 rate limit 或網路中斷，重新執行即可自動接續。

### 資料格式

每座機場一個 JSONL 檔案（`tracks/airports/{ICAO}.jsonl`），每行一筆航班：

```json
{"fr24_id":"3e617f8a","callsign":"CPA408","registration":"B-HLM","aircraft_type":"A333","origin_icao":"VHHH","dest_icao":"RCTP","dep_time":1771371753,"arr_time":1771399200,"path":[[25.245,55.371,0,1771371753],[25.300,56.100,10058,1771373000]]}
```

`path` 每個點：`[緯度, 經度, 高度(m), Unix timestamp]`

### 資料前處理

載入時 `flightLoader.ts` 會自動執行：

| 處理 | 說明 |
|------|------|
| ICAO→IATA 對照 | 補齊 FR24 未提供的 IATA 代碼 |
| 時間戳修復 | `dep_time` / `arr_time` 為 0 時，從 path 首尾點推算 |
| 英呎/公尺修正 | FR24 低高度單位切換自動偵測並轉換 |
| 換日線經度展開 | 跨越 ±180° 換日線的航班經度連續化 |

## 開發

### 1. 安裝相依套件

```bash
npm install
```

### 2. 設定環境變數

```bash
cp .env.example .env
```

| 變數 | 用途 |
|------|------|
| `VITE_MAPBOX_TOKEN` | Mapbox GL JS Access Token（[取得](https://account.mapbox.com/access-tokens/)） |
| `FR24_API_TOKEN` | FlightRadar24 API Token（[取得](https://fr24api.flightradar24.com/key-management)） |

### 3. npm Scripts

| 指令 | 說明 |
|------|------|
| `npm run dev` | Vite 開發伺服器 |
| `npm run build` | TypeScript 編譯 + Vite 建置 |
| `npm run preview` | 預覽 build 結果 |
| `npm run fetch:flights` | 抓航班清單（FR24 API） |
| `npm run fetch:tracks` | 抓飛行軌跡（`--date` / `--airports`） |
| `npm run fuse:data` | 合併多源資料（空域快照） |
| `npm run s3:upload` | 上傳資料到 S3 |

### 4. 啟動

```bash
npm run dev     # 開發模式
npm run build   # 正式建置
```

## 調色盤預覽

專案包含獨立的色彩方案預覽頁面 `color-preview.html`，提供 8 種光軌配色方案，使用 Additive Blending 模擬實際光軌疊加效果。

```bash
open color-preview.html
```

## License

MIT License. 詳見 [LICENSE](LICENSE)。
