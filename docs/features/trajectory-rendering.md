# 軌跡渲染：現況與演進

> 寫給要改這塊程式碼的人。第一節是現在長什麼樣，第二節是為什麼變成這樣，**第三節是踩過的坑與被推翻的假設——那節最值得先看**。
>
> 每個宣稱都附 commit sha 或檔案路徑，可用 `git show <sha>` 回溯。細節文件：[world-scale-plan](../backlog/world-scale-plan.md)（2026-07 第一輪）、[render-performance-status](../backlog/render-performance-status.md)（2026-09 第二輪，含每項的實測數字）、[atlas-bloom-globe](atlas-bloom-globe.md)（globe 貼球）。

---

## 一、現在的管線

```
public/tracks/airports/{ICAO}/{date}[.l1|.l2].jsonl        NDJSON，每行一個航班
  ↓
src/data/flightLoader.ts          JSON.parse → RawFlight（path 還是 tuple 陣列）
  ↓ TrackPath.fromArray()
src/types/trackPath.ts            SoA typed array：Float64 lat/lng、Float32 alt、Uint32 t
  ↓                               24 B/點（舊的 number[][] 約 60 B/點）
src/hooks/useFlightData.ts        依 scope／日期／zoom band 決定載哪些 shard，abort 舊請求
  ↓
src/App.tsx                       狀態持有者。60 fps 要讀的值一律走 ref，不經 React re-render
  ↓ createFlightLayer()
src/map/customLayer.ts            Mapbox CustomLayerInterface 橋接：onAdd 建 FlightScene，
  ↓                               render() 每幀把 getter 灌進去；repaint 閘控也在這裡
src/three/FlightScene.ts          核心場景（單檔最大，約 1,900 行）
  ├─ 靜態軌跡  StaticBucket 地理分桶（經 30°×緯 45°）+ progressive build + ±12h alpha
  ├─ 動態光軌  → BatchedTrails.ts    單一 mesh、slot 制、1 draw call
  └─ 光球      → InstancedOrbs.ts    InstancedMesh，上限 8,192，呼吸／閃爍在 shader
```

**另外兩個獨立的 custom layer**（不經 FlightScene，但共用 `src/three/shaders/globeProject.ts` 的貼球邏輯）：
`src/map/airspaceAurora.ts`（空域極光）、`src/map/atlasGlowLayer.ts` → `src/three/GlowPointsScene.ts`（機場總覽 bloom 星圖）。

**橫切關注點**（後來才抽出來的，改動時容易忽略）：

| 檔案 | 職責 | 誕生 |
|---|---|---|
| `src/map/repaintScheduler.ts` | 全域重繪節流。**要重繪一律走它**，直接呼叫 `map.triggerRepaint()` 會繞過暫停降頻與 30 秒閒置停止 | `d53b80a` 2026-09-03 |
| `src/three/animClock.ts` | DEV-only 動畫時間凍結，供視覺回歸截圖用。production 恆為 null | `8d869ae` 2026-09-02 |

---

## 二、怎麼變成這樣的

### 2026-02-20：Three.js 從第一天就在

init commit（`4f8293a`）就是 React 19 + Three.js + Mapbox，用 custom layer 共用 Mapbox 的 WebGL context。**不存在「先用 Mapbox GeoJSON 後來才換 Three.js」這段**——動態光軌與光球從第一天起就是 Three.js。

唯一一次靜態軌跡走 Mapbox native line layer 是 `5ed5623`，同一天就被 `84abe53` 換掉：

> Mapbox native line layers are 2D only — trails were stuck on ground.

高度呈現不了，這條路直接死在當天。同日還有 `d877c14`：光球從 `THREE.Sprite` 改 `IcosahedronGeometry` mesh，因為 Sprite 的 billboarding 需要相機 view matrix，而 **Mapbox custom layer 只給合併後的 projection matrix**。這個限制到現在還在，是 2026-09 決定「光球不改 billboard」的同一個理由。

此時每架飛機一個 mesh／line（`LightOrb.ts`、`LightTrail.ts`、`BlinkingLight.ts`）。

### 2026-03-12：批次渲染建檔，但只上線一半

`3e5beed` 新增 `BatchedTrails.ts` 與 `InstancedOrbs.ts`，**但沒接線**。同日 `3f8c481` 把 `InstancedOrbs` 接上、取代 `LightOrb`；`BatchedTrails` 卻**躺了四個月**才在 `793ce2f`（07-11）第一次被 `new` 出來。

同日另有一次失敗嘗試：`94556b9` 做了 per-vertex alpha 的 ±12h 淡出，因為依賴 `timeline.currentTime` 每幀更新、觸發 React 每幀重算而 stuttering，`3f8c481` 整套 revert 連 shader 檔一起刪。**同樣的問題（播放時鐘驅動 React re-render）到 2026-09-03 的 `7d01d7c` 才真正解掉**（時鐘留在 ref、state 節流 10 Hz）。

### 2026-07-11：world-scale 大改造（PR #3，單日三合一）

這天是整個時間軸最大的一次架構改動，三件事同時發生：

**`c8b6b42` globe 貼球** — 新增 `GlowPointsScene`、`shaders/globeProject.ts`。commit message 原文：

> 血腥修正：Mapbox globe 底圖會寫 depth → 3D 航跡材質改 depthTest:false（否則被實心球遮掉整片消失）。背面剔除改在 ECEF 真球面空間做。

**`793ce2f` 分桶剔除 + 批次光軌 + repaint 閘控**（12 檔、+865/−635 行）：

> ECEF 預存 attribute：貼球投影從 shader 每幀每頂點 exp/atan/sin/cos 改為 CPU 建構時算好⋯⋯單機場視角 ~16M 次/幀三角函數歸零
> 靜態軌跡分桶（經 30°×緯 45° 網格）：每桶 ECEF 方向 cap，globe 背面整桶跳過⋯⋯light theme 退單桶保混色順序
> 批次光軌 BatchedTrails：600 個 THREE.Line → 單一 mesh 6000 slots 1 draw call

`LightTrail.ts` 在同一個 commit 被刪除。注意 **light theme 走單桶**——因為 Normal blending 是 order-dependent，分桶會改變混色順序；dark theme 的 additive 才能分桶。這個區別在 2026-09 的 T0-1 又出現一次。

**`7b736d7` region LOD**：DP 2 km + 每航班 40 點上限，「平均 628.8 → 18.1 點/航班；世界視角載入 ~1 GB → 15.75 MB gzip」。

### 2026-07-25：Far View 光球事件

見下方「踩過的坑」A。

### 2026-07-27：高度單位治本

`4a6be29`。根因是 2 月埋下的 `alt > 1000 ? 轉公尺 : 保留`，見下方 B。

### 2026-09-02～03：render-audit（第二輪效能工程）

完整記錄在 [render-performance-status.md](../backlog/render-performance-status.md)。關鍵成果：

| 項目 | 結果 |
|---|---|
| 播放主執行緒 script | 7.14 → 3.20 ms/frame（時鐘進 ref、React 10 Hz） |
| 多機場（6 座）每幀線段 | 2.53M → 269k（−89%），heap −49%（依 zoom 換 LOD 層） |
| world 播放 | fps 11.9 → 25.5，script 75.79 → 10.47 ms/frame |
| world 光球 | 1,024（被靜默截斷）→ 7,866 |
| 暫停時主執行緒 | 11–13% → 5–8%，30 秒無互動後完全停止重繪 |

其中 world 的大勝來自一個誰都沒猜到的地方，見下方 E。

---

## 三、踩過的坑與被推翻的假設

### A. 「症狀部分消失」不能當作排除某個假說的證據

2026-07-11（`c8b6b42`）修 globe 下軌跡整片消失時，觀察到「線消失但光球還在」，這被當成**鑑別線索**用來判斷問題出在線材質。

2026-07-25（`e2f29e2`）Far View 事件推翻了它：

> 光球 4 個 InstancedMesh 材質 depthTest 預設 true，跨過 z6 進 globe 的瞬間整批被 depth test 殺掉；輪廓外天空無 depth，只有戳出球緣的錯位光球倖存，看起來像「光點跑到地球背面」。7/11 軌跡貼球踩過同坑，光球當時漏掉。

光球當時只是因為前緣凸出而**幾何上剛好逃過**，不是機制上沒問題。

**教訓**：症狀只消失一部分，往往是幾何或時序的巧合，不代表那條假說被排除。

**現在的鐵則**：globe 模式下所有 Three 材質一律 `depthTest: false`。

### B. 兩種完全不同的根因會產生一模一樣的症狀

`atlas-bloom-globe.md` 記錄的時序陷阱：

> 一定先 `fromArray(matrix)` 再 `invert()`；若忘了設相機 uniform → `uCameraEcef=(0,0,0)`=球心 → `dot≡−1` → cull 全 0、整片消失（跟 depth 遮擋長得一樣，容易誤判）

「被地球擋住」與「cull 把全部剔除」在畫面上都是**整片消失**。看到這個症狀不要急著下判斷，先分辨是 GL 狀態問題還是數學問題。

### C. heuristic 疊 heuristic 會疊出更難查的 bug

2026-02-21（`ea1fc8e`）為了處理 FR24 在低空改用英呎回報，加了 `alt > 1000 ? 轉公尺 : 保留`。這在資料源頭埋了條件式 bug（≤1000 ft 的點以生英呎落地）。前端又加了 `fixAltitudeUnits()` heuristic 想修正它，結果在 LOD 稀疏路徑上正反雙掃全誤觸發 → **雙重 ×0.3048**，region scope 84–95% 航班被壓扁約 10.8 倍。

**五個月後才根除**（`4a6be29`）。最終修法不是再加一層判斷，而是**拿掉兩層 heuristic**，改用確定性事實：FR24 的 alt 恆為 25 ft 的倍數，可以反解。

### D. 已經量過的東西不要再憑感覺討論

2026-09 的實測（[plan §一](../backlog/render-performance-plan.md)）推翻了幾個很直覺的假設：

- **地形不是瓶頸** — `setTerrain(null)` 後 fps 34 → 35，無效
- **不是 fill-rate** — DPR 2 讓像素量 ×3.47，fps 只掉 10% → 這是 vertex-bound
- 因此**降 DPR、關 MSAA 都不要再提**，換不到幀率還會有鋸齒

### E. world 場景慢的真正原因，猜了三次都錯

這是這個專案最好的「量測 vs 直覺」案例：

1. plan 原本認為是**靜態軌跡頂點量 + progressive 全頂點掃描**。把 progressive 掃描完全搬進 shader 後（`845d1d0`），world 只從 72.01 → 71.29 ms/frame（噪聲內）。補測「完全不走 progressive」的 full 模式是 69.5 ms/frame，同量級 → **假設一錯**
2. 接著推測是**光球**（Far View 下 activeOrbCount 從 ~500 暴增到 7,868）。優化 `InstancedOrbs.updateAll` 後它自身 −42%，但只佔 frame 的 1.4% → **假設二錯**
3. 用 `performance.now()` 分段計時才看到真相：

```
BatchedTrails.writeTrail        62–67 ms/update   ~93%
迴圈其餘（getMercatorPath 等）    ~3.8 ms          ~5.7%
InstancedOrbs.updateAll          0.91 ms          ~1.4%
```

再往裡一層，93% 中的絕大多數是 **`acquireSlot` 的逐出候選線性掃描**：`MAX_SLOTS = 6000` 但同時空中 7,868 架，每幀約 1,857 架搶不到 slot，各自對 6,000 筆 Map 做 `for..of` 找 endTime 最小的踢掉 → **每幀 1,114 萬次迭代**。而 `for..of` 解構每次配置一個 `[k,v]` 陣列，GC 也因此吃掉 5–6 ms/frame。

改成 min-heap（`e4531b6`）：script 72.62 → 14.03 ms/frame，fps 翻倍，**GPU 硬體使用率從 66%（被 CPU 餓死）升到 97–98%**，world 就此從 CPU-bound 變成 GPU-bound。

**教訓**：`busyPct` 高不等於在做事，可能是在等 GPU；而「哪裡慢」在沒有分段計時之前，連內行的猜測也連錯三次。

### F. 順序依賴會偽裝成「渲染管線的隨機性」

視覺回歸長期有一組查不出來的噪聲（切底圖後 maxDiff 90、S2/world 有 0.07% 差異）。一度以為是渲染或量測環境的隨機性。

實際根因是 `colorForFlight` 用 `colorIndex++` **依「首次出現順序」輪派顏色**，而多檔並行載入的完成順序每次不同、切 style 重建 FlightScene 後 `colorIndex` 又歸零重派 → 同一架飛機每次拿到不同顏色（`f91641d` 定位、`b32fb6b` 改成 `hash(fr24_id) % colors.length` 修復）。

**教訓**：宣稱「這是隨機噪聲」之前，先找有沒有順序依賴。

### G. 「零視覺差異」的分級也可能是錯的

`preserveDrawingBuffer: false`（`d3a49de`）原本被歸類為零視覺差異的優化，隔離量測後發現它讓地圖主體有約 0.4% 像素的次像素差異（推測是瀏覽器改走不同合成路徑）。不是畫錯，但也不是零。

---

## 四、已知限制與待清理

**待清理**
- `src/three/LightOrb.ts`（93 行）、`src/three/BlinkingLight.ts`（51 行）是 init commit 的產物，被 `InstancedOrbs` 取代後**從未刪除**，現在零引用的孤兒檔
- Region 定義有多套 hardcode 散在 `App.tsx` / `IconRailSidebar.tsx` / `flightLoader.ts` / `useFlightData.ts`，權威其實是 `split-tracks.ts` 的 `getRegion()`（見 world-scale-plan.md 的技術債段）

**未解**
- world 播放現在是 GPU-bound（97–98%），要再快得減少畫的量或省上傳頻寬。Phase 3-2 步驟二～五（partner attribute、頭部夾回、活躍段 index、拆 `BatchedTrails`）尚未做，收益不保證
- `useCanvasRecorder.ts:196` 的 `waitForRender` 200 ms timeout 在 `preserveDrawingBuffer:false` 下可能抓到已清空的 buffer，大場景慢路徑未壓測
- progressive + ±12h 同時開啟時的語意在 `845d1d0` 改成嚴格 AND（舊行為是 progressive 覆蓋掉時間窗）

**改這塊程式碼之前**：先看 [CLAUDE.md 的「渲染改動的驗收」](../../CLAUDE.md)，跑 `visual-check` / `summary-snapshot` / `ab-run`。判讀 A/B 看 `perFrame.script` 不要看 `busyPct`（噪聲 ±6 個百分點）。
