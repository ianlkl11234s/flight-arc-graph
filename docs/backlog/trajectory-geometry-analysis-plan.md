# 軌跡幾何分析 — 規劃（進場拓撲 / 跑道方向 / 高度剖面）

**狀態**：規劃中（2026-05-24）
**分支**：尚未開
**驗證機場**：TPE (RCTP)
**目的**：把飛行軌跡 `path` 從「拿來畫線」升級成「拿來做幾何/運動學分析」——反推進場型態、跑道方向偏好、被釘的高度層與巡航層分佈。

---

## 0. 這份規劃和現有分析的差別

| | 現有分析（flightStats.ts / classify.ts） | 本規劃（軌跡幾何） |
|---|---|---|
| 分析對象 | metadata（誰、從哪到哪、機型、時間） | **path 本身的幾何形狀** |
| 核心問題 | 流量、OD、機隊、時段 | **怎麼飛進來的、釘在哪一層、用哪頭跑道** |
| 現況 | 31 個函式已實作 | **完全是新領域（greenfield）** |

對照 [`airport-deep-analysis-plan.md`](airport-deep-analysis-plan.md)：那份談「表格/metadata 維度」，這份談「軌跡/運動學維度」，兩者互補。

---

## 1. 資料基礎：4D 點雲

每個航班一行 JSONL，核心是：

```
path: [[lat, lon, alt_公尺, unix_秒], ...]   # 約每 30 秒一點
```

只有 4 個原始欄位，但所有幾何量都能從**相鄰點**推導：

| 衍生量 | 算法 | 服務於 |
|---|---|---|
| 航向 heading | 相鄰兩點 bearing（球面方位角） | 進場方向、跑道判定、拓撲分類 |
| 地速 ground speed | haversine 距離 ÷ Δt | 減速剖面 |
| 垂直速率 vertical rate | Δalt ÷ Δt | 爬升/下降率、平台偵測 |
| 轉彎率 turn rate | Δheading ÷ Δt（處理 ±180 環繞） | 偵測 90°/180° 轉彎、繞圈 |
| 距機場距離 | 點到機場座標的大圓距離 | 所有「進場窗口」分析的橫軸 |
| 累積航向變化 | Σ\|Δheading\| | holding / orbit 判定 |

---

## 2. 必讀的資料前提與限制

1. **務必吃 raw 機場檔，不要吃 region 檔**
   `tracks/airports/{ICAO}.jsonl` = 全解析度（~30s）。
   `tracks/regions/{REGION}.jsonl` = `split-tracks.ts` 做過 Douglas-Peucker 抽稀（epsilon 0.5km），轉彎細節會被吃掉，**不可用於幾何分析**。

2. **30 秒採樣偏粗**：
   - 進場速度 ~140kt ≈ 72 m/s ≈ 每點間隔 ~2.2 km。
   - 90° 底邊轉彎 ≈ 1 個點；180° U 轉 ≈ 2 個點。
   - → 足夠分「哪一類拓撲」，但**畫不出平滑轉彎弧**，緊密繞圈會欠採樣。

3. **近地高度有單位雜訊**：FR24 落地前 ft/m 切換，`flightLoader.fixAltitudeUnits()` 已在補。分析時建議**直接吃 raw JSONL 並自行套同款修正**，或沿用 flightLoader 邏輯。最後幾百公尺高度當心。

4. **「偏好」其實是「那幾天的天氣」**：資料是離散快照日（2026-02-17 ~ 05-06 的某幾天），不是連續。每個結論都要標註背後「幾天 × 幾班」撐著；樣本不足的機場方向分佈會誤導（小樣本偏誤）。

5. **沒有風場資料**：能算方向分佈，不能歸因到具體 METAR 風向（除非另抓）。

6. **沒有跑道幾何**：需外掛 OurAirports `runways.csv`（免費）才能把落地航向標成 `05L / 23R`。

---

## P0：運動學基礎層 `src/analysis/trajectoryKinematics.ts`

所有後續分析的共用地基。純函式、無 Mapbox/Three.js 依賴（比照 `viewshedOverlay.ts` 的純計算風格）。

```ts
// 球面工具
function bearing(a: LatLon, b: LatLon): number;          // 0-360 度
function haversineKm(a: LatLon, b: LatLon): number;
function angleDiff(h1: number, h2: number): number;       // -180~180，處理環繞

// 逐點衍生
interface KinematicPoint {
  lat: number; lon: number; altM: number; ts: number;
  heading: number;       // 度
  gsKt: number;          // 節
  vrateFpm: number;      // ft/min（正=爬升）
  turnRateDps: number;   // 度/秒
  distToAptKm: number;   // 距該航班 dest 機場
  cumTurnDeg: number;    // 從進場窗口起點累積 |Δheading|
}
function computeKinematics(path: TrailPoint[], apt: LatLon): KinematicPoint[];

// 進場窗口：取降落前最後 ~80nm 或最後 N 分鐘
function extractApproachWindow(kp: KinematicPoint[], maxNm = 80): KinematicPoint[];
```

- [ ] 寫 `trajectoryKinematics.ts` + 單元測試（用 TPE 幾班手算驗證 bearing/dist）
- [ ] 高度修正：沿用或移植 `flightLoader.fixAltitudeUnits()`
- [ ] 邊界處理：path < 3 點、time gap 過大（>180s）標記為不可靠段

**產出**：給 P1–P3 共用的衍生欄位。

---

## P1：跑道與進場方向偏好

### 偵測邏輯
- **落地航向** = 進場窗口最後 5~10 km 的平均 heading（取低空段，避免末端單位雜訊）。
- **方向直方圖** = 全機場落地航向分桶（10° 一桶）→ 自然分成跑道對（相差 ~180°）。
- **跑道標註** = 配 OurAirports `runways.csv`：用機場每條跑道的 `le_heading`/`he_heading` 對最近的落地航向 → 標成 `05L / 23R`。

### 資料
- [ ] 下載 OurAirports `runways.csv` → 轉成 `src/data/runwayDatabase.ts`（或 JSON），只留資料裡出現過的機場
- [ ] `src/analysis/runwayDetection.ts`：`detectLandingRunway(flight) → { heading, runwayId, confidence }`

### 產出
- 每座機場「今天用哪頭降落、各佔幾%」表
- 標註樣本數（幾天 × 幾班），低於門檻標「樣本不足」

---

## P2：進場拓撲分類器 `src/analysis/approachTopology.ts`

把你研究的 5 大體系變成可計算的特徵分類器。對每個降落航班的「進場窗口」算特徵 → 分類。

### 特徵向量
```ts
interface ApproachFeatures {
  totalHeadingChange: number;   // 累積 |Δheading|
  netHeadingChange: number;     // 起末 heading 差
  maxTurnRate: number;          // 最大轉彎率
  numSignificantTurns: number;  // |Δheading| > 45° 的轉折數
  has180Reversal: boolean;      // 是否有 ~180° U 轉
  finalStraightNm: number;      // 末端對齊跑道的直線段長度
  cumTurn360: boolean;          // 累積航向 ≥ 360°（繞圈）
  netDisplacementRatio: number; // 直線位移 / 路徑長（小=在原地繞）
  windowLengthNm: number;
}
```

### 分類規則（啟發式，門檻需用 TPE 校準）
| 體系 | 規則（初版，待校準） |
|---|---|
| **直進 Straight-in** | `totalHeadingChange < 30°` 且 `numSignificantTurns == 0` |
| **底邊匯入 Base-to-Final** | 恰 1 個 `~90°` 轉折，末端對齊跑道 |
| **線性傳送帶 Long Final** | `finalStraightNm > 18` 且全程低轉彎 |
| **長號 Trombone** | `has180Reversal` 且 U 轉前有平行下風段 |
| **環繞/Holding** | `cumTurn360` 且 `netDisplacementRatio < 0.3` |
| **日本 LDA / Swingover** | 距跑道 <5nm 處出現 `>30°` 晚轉彎 + 前段偏置 |
| （未分類） | 落在規則外 → `other`，人工檢視再加規則 |

### 步驟
- [ ] `approachTopology.ts`：特徵抽取 + 規則分類
- [ ] 門檻校準：TPE 抽 30~50 班，地圖疊圖人工標 ground truth，調門檻
- [ ] `classifyApproachBatch(flights) → Map<topology, Flight[]>`

### 產出
- 每座機場「各進場型態比例」（例：TPE 尖峰 X% trombone）
- 可疊到現有 3D 地圖：同型態軌跡同色

---

## P3：垂直剖面 / 被釘哪一層 `src/analysis/verticalProfile.ts`

### 偵測邏輯
- **平台高度（被釘的層）**：找 `|vrate| < 門檻`（約 <300 fpm）且持續 > N km 的高度段 → 記錄該高度。對機場做直方圖 → 看出 ATC 標準引導高度層（shelf altitudes）。
- **巡航層分佈**：取最高的持平段 → FL 分桶（FL280/340/380…，RVSM 高度層）。回答「不同空域巡航高度」。
- **下降型態**：高度 vs 距機場曲線 → 區分連續下降 CDA（平滑單調）vs 階梯下降 step-down（多段平台）。

```ts
interface LevelSegment { altFt: number; startKm: number; endKm: number; durationS: number; }
function detectLevelSegments(kp: KinematicPoint[]): LevelSegment[];
function classifyDescent(kp): "CDA" | "step-down" | "mixed";
function cruiseLevel(kp): number;  // 最高持平段 → FL
```

- [ ] `verticalProfile.ts`：平台偵測 + 巡航層 + 下降分類
- [ ] 平台高度直方圖（每機場）
- [ ] 巡航 FL 分佈（全體 / 按 region / 按航線長度）

### 產出
- 「進場被釘在哪些高度層」直方圖
- 「各空域巡航高度」分佈
- CDA 比例（環保/效率指標）

---

## P4：視覺化整合

P1–P3 的純資料層做完後，接到呈現層（三選一或都做）：
- **離線報告**：仿 `docs/analysis/` 的 Chart.js HTML（先做這個最快驗證）
- **Sidebar 面板**：接到「🔬 深度分析」icon（與 airport-deep-analysis-plan 共用入口）
- **3D 地圖疊圖**：同拓撲/同跑道軌跡同色，直接在地圖上看型態分群

---

## 路線圖總覽

| 階段 | 內容 | 依賴 | 產出 |
|---|---|---|---|
| **P0** | 運動學基礎層 | — | 共用衍生欄位 |
| **P1** | 跑道 + 進場方向 | P0 | 機場方向偏好 |
| **P2** | 進場拓撲分類（5 體系） | P0, P1 | 各機場型態比例 |
| **P3** | 垂直剖面 / 平台高度 | P0 | 被釘哪層 + 巡航層 |
| **P4** | 視覺化 | P1–P3 | 報告 / Sidebar / 地圖 |

P0 是地基，做完後 P1–P3 可平行。

**建議起手式**：P0 + P1 + 一份 TPE 驗證報告（離線 HTML），跑通分類準確度再規模化到全機場。

---

## TPE (RCTP) 驗證計畫

1. 讀 `tracks/airports/RCTP.jsonl`（raw，非 region）
2. P0 衍生欄位 → 抽 30~50 班，地圖疊圖人工標型態 ground truth
3. P1 方向直方圖：確認分成 05/23 兩群（TPE 跑道 05L/05R/23L/23R）
4. P2 門檻校準：對齊人工標註
5. P3 平台高度：看 TPE 進場標準引導高度層長怎樣
6. 準確度 OK → 推到 HKG（驗證底邊匯入）、HND（驗證長 final）、DXB（驗證 trombone）

---

## 未決議題

### Q1: 用 TS 在前端算，還是離線 Python 預算好？
- **前端 TS**：即時、跟現有 flightStats 一致，但每次載入重算。
- **離線預算**：寫 `scripts/analyze-trajectories.ts`，產出 `analysis/*.json` 給前端讀，省前端算力。
- 建議：分析腳本離線跑（規模大），輕量結果（每機場型態比例、方向直方圖）存 JSON；前端只做單班即時展示。

### Q2: 跑道資料庫範圍？
- OurAirports `runways.csv` 全球 ~4 萬條。只留 manifest 裡出現的 ~1,100 機場。
- 熱更新 JSON vs 編譯進 TS：比照現有 aircraftDatabase.ts 的決定。

### Q3: 拓撲分類器要不要上機器學習？
- 初版用啟發式規則（可解釋、好 debug）。
- 若規則覆蓋不了 → 特徵向量 + 非監督聚類（k-means / DBSCAN）找自然分群，再人工命名。

### Q4: 30s 採樣不夠時要不要重抓高解析度？
- FR24 track API 已是最細的回傳，**重抓拿不到更密的點**。
- → 接受採樣限制，分析定位在「分型態」而非「重建精確幾何」。

---

## Credits 消耗

- P0–P4：**0 credits**（純本地軌跡運算，不打 FR24 API）
- OurAirports `runways.csv`：免費公開資料，非 FR24
