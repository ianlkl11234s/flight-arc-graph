# Round 1 — Fable（mapbox-gl 3.18.1、three r0.172；行號依 node_modules 內 unminified / three.module.js）

## A. 驗證

**發現 1（切底圖洩漏）：成立，CPU 與 GPU 兩側皆成立。**
1. 觸發：`MapView.tsx:349` `map.setStyle(styleUrl)`；`:365` black→dark（關 Pure Black）用 `{diff:false}`（dark→black 只 paint override，不 setStyle）。
2. Mapbox：custom layer 不在新 style JSON，**只要 diff 成功就會走 `Style.removeLayer`（:66542→CustomStyleLayer :39164）→ onRemove**；洩漏嚴格等於「diff 失敗或 diff:false」。`setStyle`（:86886）走 `_diffStyle`→`setState`，`setSprite` 不在支援清單（:64489 被註解）→ throw → `:86890` 印 warning 後 `_updateStyle`；`{diff:false}` 直接 `_updateStyle`，**不印 warning**（摘要的 console 訊號漏掉 black→dark）。`_updateStyle`（:86910）呼叫 `Style._remove()`（:67513–67553）：只 `setEventedParent(null)`，**不呼叫任何 layer 的 onRemove**。目前 7 個底圖 sprite 互異，每一對都落在失敗側。
3. 前端：`style.load`（`MapView.tsx:302–328`）→`handleMapReady`（`App.tsx:1514`）→`addFlightLayer`（:1473）`getLayer("flight-3d")` 在新 Style 必為 undefined → `customLayer.ts:306 onRemove`、`FlightScene.dispose`（`FlightScene.ts:1476`）、`detachScheduler` 全不執行；aurora（`airspaceAurora.ts:385`）、atlas（`atlasGlowLayer.ts:127`）同理。
4. 保留鏈（與舊 Style 可否回收**無關**）：`WebGLRenderer` 建構時在 Mapbox canvas 掛 `webglcontextlost`（three:14917），只有 `renderer.dispose()`（:15311–15315）會拆；canvas 跨 style 存活 → 舊 renderer 成孤兒。其 `WebGLBindingStates.saveCache`（:1761–1801）在 `:1785` `data.attribute = attribute` 強持有 `BufferAttribute`（含 `.array`）；`WebGLAttributes` 的 `buffers` WeakMap（:63）以該 attribute 為 key，value 裡的 WebGLBuffer wrapper 隨之存活，Chromium 不會 deleteBuffer → CPU 陣列與 GPU buffer 都回收不了。FlightScene 本體的 Map（mercatorCache、staticFlightRanges）是否一併留住，取決於舊 closure 可達性（`Painter.style` :69892 下一幀即覆蓋）——只有這一截是「可能」。

反證檢查：`App.tsx:1615–1620` 的 effect 走 `removeLayer`→`onRemove`→`dispose`，證明 dispose 本身是通的；洩漏純粹是「style 重建時沒人呼叫 onRemove」。另兩個遺漏：aurora `onRemove` 只 `renderer = null`（:402）不 `dispose()`，正常路徑也留孤兒 renderer；`attachRepaintScheduler`（`repaintScheduler.ts:101–123`）每切一次多 5 個 `map.on`＋1 個 document listener（閉包只抓 map，小洩漏）。旁證：`scripts/perf/README.md` §7「跑過 6 場景後 heap 到 1.9 GB」。
量級：靜態桶 44 B/頂點（`FlightScene.ts:568–572`）× world 2.33M 頂點 ≈ 102 MB CPU＋102 MB GPU；BatchedTrails 若到 16,384 slot 再 +93 MB×2（`BatchedTrails.ts:35`）。摘要 174 MB/次量級合理。

**發現 2（CPU 陣列保留）：成立。** `StaticBucket`（:67–88）永久持有 5 個 Float32Array；build 完只有 `alphas` 再寫（:764、:927、:959），其餘 40 B/頂點閒置。world ≈ 93 MB；L0 多機場 2M 點→4M 頂點 ≈ 160 MB。

**發現 3（mercatorCache）：部分成立。** key 為 fr24_id，只在 flights reference 或高度參數變時清（`customLayer.ts:150、:163`→`FlightScene.ts:998`）；`getMercatorPath`（:981–996）每點配一個 4 元素 JS array（~80 B）＋ecef 12 B。所以是「有界、無逐出」：上限＝當前資料集總點數（world 1.24M 點 ≈ 110–125 MB），不是無界；只有在發現 1 把舊 FlightScene 留住時才跨資料集累積。且它與靜態桶是**同一份衍生值算兩次**（`continueStaticBuild` :690–704 vs `getMercatorPath`），見 B-1c。

## B. 架構方向

### 1. 止血（零視覺差異）
| 做法 | 效益（算法） | 風險 | 驗收 |
|---|---|---|---|
| **1a FlightScene 生命週期與 layer 解耦**：App 層持有單例，`onAdd` 只在 `gl` 變時 `init`，`onRemove` 只 detach；aurora/atlas 同款 | 切 style 洩漏→0（≈174 MB/次）；同時解掉 `App.tsx:1615` 進 track-single／換機場就整個 renderer＋靜態 mesh 重建（progressive 重跑）的成本 | 新 style 的 GL 狀態不同——已有 `resetState()`；要留 `gl` 真的換掉的分支 | 新測「切 10 次階梯」：交替 `setMapStyle('light'/'dark')`，每次 waitStyleReady＋waitStable＋`HeapProfiler.collectGarbage` 後記 `JSHeapUsedSize`；更硬的指標：CDP `DOMDebugger.getEventListeners(canvas)` 數 `webglcontextlost`（Mapbox 自己也掛一個 :88600，以首次量到為基準）斜率應為 0（現況每切 +3）、`map._listeners.movestart.length` 不增 |
| 1b 最小修法（不做 1a 時）：`MapView.tsx:346` effect 內 `setStyle` 前先 `removeLayer` 三層；aurora `onRemove` 補 `renderer.dispose()` | 同 1a 洩漏量，保留重建成本 | 無 | 同上 |
| **1c 衍生資料單一 owner**：桶建完用 three 官方 `BufferAttribute.onUpload(cb)`（three:76、:207 上傳後呼叫）丟掉 positions/colors/ecefs/timestamps 的 `.array`（`count` 為建構時欄位，不受影響）；`alphas` 保留；mercatorCache 的 `pts` 從 n 個小陣列改一個 Float64Array(n×4) | CPU：world −93 MB（2.33M×40 B）、cache −60 MB（80→32 B/點）；GC 壓力降 | progressive 是分幀 range 上傳（:780–788），callback 須等 `staticBuildState` 歸 null 那幀才掛；2D 模式無桶，光軌仍靠 cache | visual-check 6 場景（pctOver8<0.15%）＋summary-snapshot 不變＋ab-run `perFrame.script` |
| 1d 小修：刪 `useFlightData.ts:278–284` 未被 App 解構的 `filterByAirport/getTimeRange`；viewshed rAF（`App.tsx:1724`）暫停時不跑 | 10 Hz 的 O(N) 全掃歸零 | 無 | ab-run |

### 2. 結構
- **2a 預算器**：單一 `ResourceBudget`（CPU 點數／GPU bytes），FlightScene、BatchedTrails、cache 登記。超額**不抽航班**，而是降駐留等級：先丟衍生品（1c 已可丟），再 L0→L1/L2（沿用 zoom-band LOD，只換解析度不換集合）。驗收：summary-snapshot 的 fr24_id hash 恆等。
- **2b 靜態 attribute 壓縮**：color 3×Float32→3×Uint8 normalized（−9 B）、alpha→Uint8（−3 B，`INTERNAL_STATIC_ALPHA=3` 改 flag 編碼），44→32 B/頂點；world GPU 102→74 MB。視覺：量化 ≤1/255，低於 visual-check 8/255 門檻；須加 light theme 場景（NormalBlending 對色差較敏感）。
- **2c 載入 worker 化＋日期前置過濾**：`flightLoader.ts:362–375` 主執行緒逐行 `JSON.parse`→`preprocessFlight`，日期過濾在 `:375` 才做——其他 51 天先建 TrackPath 再丟。改 Worker 解析、Transferable 回傳 SoA；region 檔比照 airport 檔 per-date 分 shard（split-tracks 層）。效益：world 94 MB 解析不卡主執行緒、垃圾 TrackPath 歸零。驗收 summary-snapshot（集合 hash 同）。
- **2d 子集篩選不重建**：`finalFlights` 一變就全量重建（`FlightScene.ts:510–516`）。篩航司／機型是子集 → 只有真正新資料才重建 attribute（44 B/頂點），子集選擇改重建 **index buffer**（`setIndex`，Uint32 4 B/頂點）：GPU 畫的頂點數仍隨子集縮小、零視覺、2× 峰值窗消失。不建議用 alpha=0 隱藏（:764 路徑）：頂點數不降，world 已 GPU-bound，等於拿 CPU 峰值換 GPU 常數成本。
- **2e 二進位 shard**：JSONL→SoA `.bin`（header＋Float64 lat/lng＋Float32 alt＋Uint32 t＋offsets），ArrayBuffer 零拷貝建 TrackPath；parse 成本趨近 memcpy，值相同故零視覺。

### 3. 規模化（全球）
- **3a 集合與幾何解耦**：Summary 只需 per-flight metadata（81.6K 班 × ~200 B ≈ 16 MB），path 依視錐＋zoom band 串流。集合由 metadata 決定 → 數字恆定、不靜默抽航班。**畫面改變**：剛捲入視錐的區塊會短暫以 L2 粗線頂替再換 L0（同現有換層行為）。
- **3b 空間 tile**：把 30°×45° 桶細化到 10°×10°（或 quadkey z3–5）二進位 shard，各含 L0/L1/L2；視錐選 tile、GPU 預算 LRU 逐出；容器可直接用 PMTiles range request（與 gis-platform 一致）。**坦白說**：world 現況已是 ≤40 點/班的 LOD 檔（`loadRegionFullFlights` :658），tile 化對 world GPU 收益有限；主要受益者是多機場 L0 組合與拉近時只載視錐內 L0。
- **3c ±12h 可見度進 shader**：`customLayer.ts:174–193` 每秒 O(N) 掃＋`Set` 配置；桶已有 `aTRel`，再加 per-flight 起迄（2 float）即可在 vertex shader 判定，CPU 側歸零，零視覺。
- **3d 光軌 slot 預算化**：`SLOT_CAP=16384`（93 MB）夠單日全球（峰值 7.8K），多日全球納入 2a。

## C. 最該先實測
1. **切 style 10 次階梯**：GC 後 JS heap、canvas `webglcontextlost` listener 數、Chrome GPU process RSS（`sys-sample.mjs`）。靜態桶的 CPU 102＋GPU 102 MB 經 bindingStates 鏈已確定；待測的是舊 closure 是否再多留 mercatorCache 等 ~110 MB，以及 10 次後是否真的線性。
2. **ECEF 預存 vs shader 現算**：2026-07 的 CPU 預存決策是 CPU-bound 時代做的，現在 world GPU-bound 97–98%，去掉 12 B/頂點可能反而掉 fps；用 ab-run world 場景 `perFrame.script`＋GPU busy 定方向，沒測前不當建議。
3. **1c＋2b 後多機場 L0 組合（apac set z>9.5）的真實 heap/GPU 數字與 light theme visual-check**：驗證「單一 owner＋Uint8 color」在 NormalBlending 下仍 pctOver8<0.15% 且不成塊，決定 2b 是否真的零視覺。
