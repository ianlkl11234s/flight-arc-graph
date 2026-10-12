# 渲染效能規劃（Render Performance Plan）

> 建立：2026-09-02（分支 `perf/render-audit`）
> 起因：用戶回報「開多個機場就聽到風扇、畫面一頓一頓」；長期目標「全世界軌跡同步顯示，畫面基本不變」。
> 前作：[`world-scale-plan.md`](./world-scale-plan.md)（2026-07-11 已做 LOD 分層、分桶剔除、批次光軌）。本檔承接，不重複。
> 方法：先實機量測歸因（headed Chrome + CDP trace），再對照程式碼審查；每項標「視覺影響」。原始報告在 [`render-performance/`](./render-performance/)（`measure-report.md` 量測、`code-review-loop.md` 主迴圈／React 審查、`code-review-geometry.md` 幾何／資料審查、`research-report.md` 外部研究），關鍵數字已抄錄於此。

---

## 一、量測結論（歸因）

量測環境：Google Chrome（headed，真 GPU）、canvas 1600×913、**DPR 1**（用戶實機若為 Retina，fill-rate 再 ×4）、Mapbox dark + terrain 開、相機靜止、滑鼠移開地圖。每段 8 秒 CDP trace（`devtools.timeline` + `gpu`）＋系統 GPU 硬體使用率取樣。

### 1. 暫停時地圖仍永續重繪（已證實）

| 場景（暫停、相機靜止） | rAF／秒 | Mapbox render／秒 | `triggerRepaint` 來源 | 主執行緒 rAF callback ms／秒 |
|---|---:|---:|---|---:|
| S2 亞太樞紐 set（6 座） | 33.7 | 33.9 | `src/map/customLayer.ts` 100% | 976 |
| 同上，runtime 把 `hasActiveOrbs()` 改回 false | **0** | **0** | — | **0** |

根因：`src/map/customLayer.ts:239-251` 的 repaint 閘控把 `hasActiveOrbs()`（有任何航班在空中）列為續繪條件 → 只要模擬時刻有飛機，暫停也以最高幀率重繪**整張 Mapbox**（terrain、globe、所有 style layer、3 個 custom layer）。唯一需要動的只有光球呼吸／閃爍。

### 2. 場景總表

| 場景 | flights | path 點數 | Three lines／幀 | fps（暫停／播放） | 主執行緒 busy% | 其中 `WaitForGetOffset`（等 GPU）ms／秒 | GPU 硬體 util% | long task | heap MB |
|---|---:|---:|---:|---|---|---:|---:|---|---:|
| S1 單機場 RCTP 2/18（全解析度） | 649 | 442,806 | 886k | 59.8 ／ 59.6 | 28% ／ 59% | 157 ／ 146 | **91 ／ 90** | 0 | 155 |
| S2 亞太樞紐 set（RCTP RJTT RJAA VHHH ROAH RJBB） | 3,769 | 2,533,949 | **5.07M** | **35 ／ 35** | **98% ／ 99%** | **876 ／ 591** | **98 ／ 99** | 3（max 59 ms） | 624 |
| S4 手動組 RCTP+VHHH+RJTT+WSSS | 3,629 | 2,563,128 | 5.14M | 43.8 ／ 40.9 | 99% ／ 99% | 877 ／ 244 | 97 ／ 99 | 0 | 1,285 |
| S3 world（`regions/all.jsonl` 2/18） | 66,478 | 1,048,287 | 2.64M | 32.7 ／ 30.4 | 99% ／ 99% | 899 ／ 538 | 98 ／ 98 | 0 | 750 |

S3 補充：同時空中光球 5,256（`MAX_INSTANCES=1024` 截斷後仍畫 1,024 × 1,860 頂點 ≈ 1.9M）；線段只有 S2 一半但 fps 同量級——world 視角 globe 投影全開（`uTransition<1`，vertex shader 走完整貼球路徑）、光球幾何、光軌 slot 溢位三者疊加。

解讀：
- **風扇 = GPU 飽和**。單一機場暫停就已 91%；多機場 98–99%。GPU 端瓶頸是 vertex 量（每幀 5M 線段 = 10M 頂點，且 glow 讓它再 ×2），不是 fragment。
- **一頓一頓 = 主執行緒被 GPU 卡住**。S2 的主執行緒 98% busy，但 scripting 只佔 10%，其餘 88% 是 `CommandBufferProxyImpl::WaitForGetOffset`——CPU 排指令排到 GPU command buffer 滿了只能等。加上 55–59 ms 的 long task（靜態軌跡漸進建構每幀整桶重傳，見 G2）。
- **多機場為何這麼重（關鍵發現 G1）**：saved set／`toggleAirportInSet` 走的是 `loadAirportSelectionFlights`（`src/data/flightLoader.ts:523-565`）→ 逐機場讀**全解析度** daily shard（平均 670–760 點／航班），不是 region 的 ≤40 點 LOD。EU+LHR 一組 = 7,088 班 × 761 點 = **10.8M 頂點、431 MB GPU、約 1.2 GB 總記憶體**；同一組若走 LOD 只需 262k 頂點（**41 倍**）。

### 3. 差分開關（S2 亞太樞紐，暫停；播放趨勢相同）

| 開關 | fps | 主執行緒 busy% | lines／幀 | Δfps |
|---|---:|---:|---:|---:|
| 基準 | 34.1 | 98.7% | 5.07M | — |
| 地形關（`setTerrain(null)`） | 35.1 | 98.4% | 5.07M | **+1（無效）** |
| Glow 第二層停繪（Glow=0） | 53.2 | 98.9% | 2.54M（−50%） | **+19** |
| 靜態軌跡隱藏（status 模式） | 118.9 | 97.0% | 14k（−99.7%） | **+85** |
| 三者全關 | 119.2 | 58.9% | 16k | +85 |
| DPR 2（canvas 2938×1724，像素 ×3.47） | 30.7 | 98.9% | 5.07M | −3（−10%） |

（GPU 硬體 util 在永續重繪下恆為 97–99%，不具鑑別力；以 fps／busy%／lines 判讀。）

歸因定案：
1. **靜態軌跡頂點量是唯一大宗**：隱藏後 fps ×3.5；glow 第二層佔其中一半。
2. **地形不是瓶頸**（關掉 fps 不變）→ T1-2 降級為「不值得做」。
3. **不是 fill-rate**（DPR 2 像素 ×3.47 只掉 10%）→ 這是 vertex-bound；降 DPR、關 MSAA 換不到什麼 → T1-3／T1-4 降級。
4. 三者全關後主執行緒 busy 仍 59%（永續重繪的固定成本：Mapbox 底圖 + 光球 updateAll + 光軌），這部分靠 T05-1／T05-2 解。

---

## 二、頂點預算（由實際檔案算出）

| 場景 | flights | 點數 | 靜態頂點 | ×2 glow | 每幀 vertex-shader | GPU 靜態 buffer | 建構幀數（10k verts／幀） |
|---|---:|---:|---:|---:|---:|---:|---:|
| S1 RCTP 2/18 | 649 | 442,806 | 884k | 1.77M | 2.05M | 35 MB | 88（1.5 s） |
| set 亞太樞紐 | 3,769 | 2.53M | 5.06M | 10.1M | 11.5M | 202 MB | 506（8.4 s） |
| set EU+LHR | 7,088 | 5.39M | 10.8M | 21.5M | **23.6M** | 431 MB | 1,077（18 s） |
| world all.jsonl 2/18 | 66,478 | 1.05M | 1.96M | 3.93M | 6.6M | 79 MB | 196 |
| 對照：EU+LHR 走 all.jsonl LOD | 7,088 | 138k | 262k | 525k | — | 10.5 MB | 26 |

world 規模另兩個硬上限（今天已是可見缺陷）：
- 2/18 同時空中航班 10:00 = **7,868**、峰值 23:00 = 8,625；`BatchedTrails` `MAX_SLOTS=6000`（`src/three/BatchedTrails.ts:25`）→ 每幀 1,868 班沒 slot、互踢閃爍、髒區橫跨整個 buffer（34 MB × 5 attribute／幀重傳）。
- `InstancedOrbs` `MAX_INSTANCES=1024`（`src/three/InstancedOrbs.ts:4`）→ 超過的光球**靜默丟棄**，`pickFlight` 也看不到。

---

## 三、分層方案

視覺影響分級：**零視覺差異**＝逐像素相同或理論上不可辨；**近零**＝原理相同但幀率／順序略變；**可見取捨**＝畫面會變，需用戶拍板；**結構性**＝改架構。

### Tier 0：零視覺差異的快贏（S 級，可直接在本分支做，附 before/after）

| # | 項目 | 位置 | 現況 → 修法 | 預期收益 |
|---|---|---|---|---|
| T0-1 | **靜態 glow 併成單 pass** | `src/three/FlightScene.ts:368-385, 409-414, 603-666`；`src/three/shaders/staticTrail.frag` | 本體與 glow 是同 geometry 畫兩次（alpha 各 O·w 與 0.3·O·w²）。additive 下兩次 1px 線覆蓋同一組 fragment，等價單次 alpha = O·w·(1+0.3w)。frag 改 `a1 + a2`（light theme normal blending 用 `a1+a2−a1·a2`，誤差 ≤3/255） | 每幀 vertex-shader 與 draw call **減半**（S2 10.1M → 5.06M） |
| T0-2 | **刪每幀 GL 狀態同步查詢** | `src/three/FlightScene.ts:921-943`；同樣 pattern 在 `src/three/GlowPointsScene.ts:270-286`、`src/map/airspaceAurora.ts:324-326` | 每幀 4 次 `gl.getParameter(BLEND_*)` 在 Chromium 屬「non-cached」→ 每次同步等 GPU process 並先 drain 已排指令。Mapbox `drawCustom` 在 custom layer 後立刻 `context.setDirty()`，手動還原 blend 多餘。保留 render 前 `resetState()` 即可 | 消除每幀 4–8 次 CPU↔GPU 同步 round-trip；直接對應「一頓一頓」 |
| T0-3 | **漸進建構改 range 上傳** | `src/three/FlightScene.ts:583-589` | 每幀只寫 10k 頂點，卻對每個髒桶 `needsUpdate=true` → three 整條 `bufferSubData`（S1 最大桶 19.6 MB／幀；EU+LHR 126 MB／幀 × 1,077 幀）。照 `BatchedTrails.applyRange`（324-345）改 `addUpdateRange` 只傳本幀寫入段 | 換機場／調高度／換主題時的 55–59 ms long task 消失；上傳 19.6 MB → 0.4 MB／幀 |
| T0-4 | **cameraInfo setState 去重** | `src/App.tsx:374, 1174-1184` | `map.on("move")` 每次都 `setCameraInfo({...})` 新物件 → 相機一動（拖曳／orbit／cinema／flyTo）整個 App 每幀重渲染，暫停也一樣 | 相機移動期間省 1–3 ms／幀 React reconciliation |
| T0-5 | **timestamp 改相對時間** | `src/three/FlightScene.ts:391, 552, 740-760` | Float32 存絕對 unix 秒，1.77e9 的 ulp = 128 s → progressive 模式以 128 s 為單位跳格（60× 播放每 2 秒一跳）。改存 `t − windowStart` | 修可見階梯 bug；也是 Tier 2 shader 時間的前置 |
| T0-6 | customLayer 每幀雜項 | `src/map/customLayer.ts:98-99, 165-180, 189, 221, 224, 235` | 無條件 setter、14 段 `controlSig` 字串、`getFreeCameraOptions()` 配置、`getActiveFlights` 每幀新陣列 | <0.5% 幀預算，順手清 |

### Tier 0.5：近零差異（M 級，做完 Tier 0 再做）

| # | 項目 | 位置 | 做法 | 收益／取捨 |
|---|---|---|---|---|
| T05-1 | **光球呼吸／閃爍搬進 shader** | `src/three/InstancedOrbs.ts:98-167`；`src/three/FlightScene.ts:866-874` | 暫停時 early-return 仍每幀 `updateAll`：全部 instance 重算 matrix、setColorAt、5 個 attribute 整條重傳（274 KB／幀）。改 `uTime`（wall-clock）uniform + per-instance `aPhase` attribute；instanceMatrix 只在 entries／globe 參數／scale 變時重算 | 暫停＋相機靜止 → instance buffer 零上傳，才能做 T05-2 |
| T05-2 | **暫停時 repaint 降頻／閒置** | `src/map/customLayer.ts:239-251`；同 pattern `src/map/atlasGlowLayer.ts:119-120`、`src/map/airspaceAurora.ts:331` | 只剩裝飾動畫時不走 keepAlive，改單一 `setTimeout` 排下一次 `triggerRepaint`（20–24 fps）；`document.hidden` 時停。前提 T05-1（`InstancedOrbs.ts:101-102` 固定 `dt=0.016`，降頻會讓動畫慢 3×，須先改 wall-clock） | **暫停時整張地圖重繪次數降到 1/3（60→20 fps）；或選「暫停 N 秒後完全 idle」→ 0（已實測 gate 關掉後 rAF／render／CPU 全歸零）**。呼吸 24 fps vs 60 fps 肉眼難辨；閃爍 83 ms 亮期在 20 fps 只剩 1–2 幀（改 wall-clock 後無感） |
| T05-3 | **播放時鐘留在 ref，React 10 Hz 發布** | `src/hooks/useTimeline.ts:382-406`；`src/App.tsx:996`；`src/components/` 零個 `React.memo` | rAF 內 `setCurrentTime` → App（31 useState／21 useMemo／22 useEffect）+ IconRailSidebar（397 JSX tag）每幀 reconcile，DOM 實際只改 1 個 slider value。時鐘由 hook 持 ref、rAF 直接 `triggerRepaint`，state 以 ~10 Hz 節流；`seek()` 同步寫 ref + 立即發布 | 播放時省 1–3 ms／幀（桌機）、3–8 ms（手機）；slider step 0.001 = 86 模擬秒，≤600× 時 10 Hz 不掉步。順便消掉 `KEEP_ALIVE_FRAMES=12` 的「落後一幀」補丁 |
| T05-4 | `preserveDrawingBuffer:false` | `src/map/MapView.tsx:276`；`src/hooks/useCanvasRecorder.ts:209-216, 329-336` | 即時錄製改在 `map.on("render")` 同步取像（HQ 匯出已是 `map.once("render")`）；context attribute 不可熱切換，故一律關 | 省每幀一次整張 back buffer copy（DPR 2 全螢幕 ≈ 0.9 GB/s）；錄影需回歸 |

### Tier 1：可見取捨（需用戶拍板）

| # | 項目 | 選項 | 建議 |
|---|---|---|---|
| T1-1 | **set／多機場改讀 LOD**（G1，41 倍） | (a) 立即：`airportSet.length > 1` 時改讀 `all.jsonl` 篩 dep/dest ∈ set（S 級，但 2 km LOD 在 z7 約 3.6 px，拉近到單一機場會明顯變粗糙）；(b) 正解：build-time 產每機場每日 **L1（50 m）／L2（250 m）** 檔（見下表），set 讀 L2、airport scope 預設 L1、只有單機追蹤／z≥11 才讀 L0 全解析度；(c) 進一步：zoom ≥ 9 時對視窗內機場動態換回 L1／L0 | **(b)**。z10.4 的 RCTP preset 1 device px = 26 m，L1 50 m ≤ 2 device px（低於 ADS-B 20–50 m 噪聲）；set 的 fitBounds `maxZoom: 7`（`App.tsx:836`）下 L2 250 m = 0.45 CSS px。需改 `scripts/split-tracks.ts`、`pull-from-s3.sh`、上傳 S3；DP 要改 3D（含高度誇張，否則爬升折點被抹平） |
| T1-2 | terrain 依 zoom 自動關 | zoom expression 讓 exaggeration 歸 0 | **量測後不建議**：關地形 fps 34→35，無收益；且 zoom expression 有仍 open 的閃爍 bug [mapbox-gl-js#11044](https://github.com/mapbox/mapbox-gl-js/issues/11044) |
| T1-3 | `antialias:false` | 關 MSAA | **量測後不建議**：瓶頸是 vertex 不是 fill-rate（DPR ×3.47 只掉 10%），關 AA 會有鋸齒卻換不到幀率 |
| T1-4 | DPR 上限 | Retina 降 1.5 | **量測後不建議**：同上理由；1px 線還會變粗 |

LOD 層級建議（每機場每日一檔，`split-tracks.ts` 一次產出）：

| 層 | eps | 用途 | RCTP 日檔 | S1 頂點 | EU+LHR 頂點 |
|---|---|---|---:|---:|---:|
| L0 | 全解析度 | 單機追蹤／z≥11 | 16.3 MB | 884k | 10.8M |
| L1 | 50 m | airport scope 預設（z9–10.4） | 2.9 MB | 157k | 1.9M |
| L2 | 250 m | set／多機場（z7–8） | ~1.4 MB | ~76k | ~0.9M |
| L3（現有） | 2 km／40 pt | world／region（z≤6） | 0.54 MB | 29k | 262k |

### Tier 2：結構性（全世界同步顯示的前提）

| # | 項目 | 設計要點 | 效益 |
|---|---|---|---|
| T2-1 | **GPU 時間驅動光軌（deck.gl TripsLayer 式）** | 靜態桶已有 per-vertex timestamp（`FlightScene.ts:552`，但只在 CPU）。上傳 `tRel` + partner 端點（pos／t，+16–28 B／vert）+ `uTime` uniform；vertex shader 同時算「靜態暗線 alpha」與「600 s 視窗彗尾 alpha」，頭部超前的端點在 shader 夾回插值位置；光軌 pass 用只列活躍段的 index buffer。光球位置改 CPU 二分搜尋（8k 班 × 4 步 ≈ 0.3 ms）。`BatchedTrails` 整個移除 | 每幀 CPU 從「重寫 ≤130 verts × 活躍數 + bufferSubData（world 34 MB／幀）」降到 1 個 uniform；slot 6000 上限與互踢消失；progressive／±12h 也可搬進 shader。工作量 L，拆 6 步（先做 tRel+uTime 的 progressive，就是 T0-5 的延伸） |
| T2-2 | 光球上限與幾何 | `IcosahedronGeometry(1,2)` = 540 verts × 3 層 + 240 = 1,860 verts／顆；改 billboard quad（24 verts）並把上限提到 8,192；slot 逐出改 min-heap | world 峰值 8,625 班全部有光球（今天 >1,024 靜默消失） |
| T2-3 | `Flight.path` 改 typed array（SoA） | `number[][]` 每點 ≈ 60 B（1 JSArray + FixedDoubleArray）→ Float32×3 + Uint32 = 16 B；`preprocessFlight` 逐行再配一份。`.path` 使用處 53 處／9 檔，用 `TrackPath` 包裝類機械替換 | EU+LHR heap 324 MB → 86 MB；GC 物件數降 400×（major GC 標記成本 = 一頓一頓的另一來源）；worker 解碼可 Transferable |
| T2-4 | 依 zoom 換層 + 視窗內升級 | T1-1(c)：載入以 L2／L3 為主，zoom 進入某機場時只對視窗內航班換 L1／L0；換層走現有 progressive build（T0-3 之後代價很小） | world 常駐 3.9M 頂點（含 glow）→ T0-1 後 2M，vertex-shader 預算內 |

---

## 三之二、外部參考（已逐一 fetch 驗證）

| 主題 | 結論 | 對本專案 |
|---|---|---|
| deck.gl TripsLayer（[原始碼](https://github.com/visgl/deck.gl/blob/master/modules/geo-layers/src/trips-layer/trips-layer.ts)、[文件](https://deck.gl/docs/api-reference/geo-layers/trips-layer)） | 每頂點只存 1 個 float timestamp；`currentTime`／`trailLength`／`fadeTrail` 是 uniform，fragment 端 discard + 淡出；**每幀只更新 3 個 float，不重寫 vertex buffer**。頭部位置無內建，官方做法是 CPU 算當前座標另疊 IconLayer | T2-1 的設計與此一致（光球 = IconLayer 的角色） |
| Mapbox custom layer 與 `triggerRepaint`（[#8159](https://github.com/mapbox/mapbox-gl-js/issues/8159)、[#12625](https://github.com/mapbox/mapbox-gl-js/issues/12625)） | 官方確認 custom layer 觸發的是**整張地圖重繪**；沒有「只重繪 custom layer」或「閒置停繪」API，社群做法是自己節流／把 `triggerRepaint` 換成 no-op | T05-2 只能在自家閘控做；Mapbox 端無解 |
| Mapbox `antialias`／`preserveDrawingBuffer` | 官方預設皆 `false`，文件明註為效能考量 | T05-4、T1-3 |
| 大量線段（[Cesium blog](https://cesium.com/blog/)、[instanced lines](https://wwwtyro.net/2019/11/18/instanced-lines.html)） | GL_LINES 在 ANGLE 下 lineWidth 固定 1；instanced quad 是業界標準但頂點量更大。「數百萬線段 60fps」查無公開 benchmark | 靜態 1px 軌跡**維持 GL_LINES**（換 quad 沒有視覺增益、頂點更多）；判斷 vertex-bound 可用 `RASTERIZER_DISCARD` 對照 |
| 資料表示（[Arrow columnar](https://arrow.apache.org/docs/format/Columnar.html)、[MDN Transferable](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)） | SoA typed array 可在 worker 解碼後零複製 transfer | T2-3 |
| WebGPU | Three.js `WebGPURenderer` 無 `context` 參數、Mapbox custom layer 型別固定 `WebGLRenderingContext`，[#9646](https://github.com/mapbox/mapbox-gl-js/issues/9646) 仍 open | 不可行，不列入 |

## 三之三、Tier 0 執行結果（2026-09-02，commit `b9cf92d`）

T0-1～T0-5 已在本分支完成（T0-6 未做，收益 <0.5%）。同一 session 背靠背 A/B。⚠️ 這組 A/B 跑在 120 Hz ProMotion 內顯（fps 上限 120）且有平行 session 負載，所以 S1 的絕對 fps／busy 與 §一的 60 Hz 表不可比；**以 S2 為準**（兩個環境下 S2 都是 ~98% busy 飽和，相對差異穩健）：

| 場景 | 狀態 | lines／幀 | draw calls | fps | 主執行緒 busy% | `WaitForGetOffset` ms／s | long task |
|---|---|---:|---:|---:|---:|---:|---:|
| S1 RCTP | 暫停 | 887k → **444k** | 26 → 17 | 94 → 117 | 97.7% → **20.4%** | 783 → **0** | 0 |
| S1 RCTP | 播放 | 887k → 444k | 26 → 17 | 88 → 116 | 99.4% → 94.8% | 217 → **0** | 0 |
| S2 亞太樞紐 | 暫停 | 5.08M → **2.55M** | 48 → 28 | 38 → **57** | 98.7% → **24.0%** | 882 → **0** | 2 → **0** |
| S2 亞太樞紐 | 播放 | 5.08M → 2.55M | 48 → 28 | 32 → **56** | 98.7% → 66.3% | 588 → **0** | 0 |

- 截圖逐像素 diff（dark theme，同時刻同相機）：S1 max 7/255、S2 max 36/255（後者 48 px 落在光球脈動點，wall-clock 動畫），>2/255 的像素 0.26–0.48%，全部沿軌跡邊緣 = 兩次 8-bit 累加 vs 一次累加的捨入差。
- `WaitForGetOffset` 歸零證實 T0-2 是「一頓一頓」的直接根因（每幀 4 次同步 `getParameter` 把 CPU/GPU pipeline 串行化）。
- 播放時 busy 仍 66–95%：剩餘是 React 每幀 reconcile（T05-3）與光軌重寫（T2-1）。
- 量測 harness 已收進 `scripts/perf/`（README 有重跑指令）；本次 A/B 的 log 與 diff 圖在 `render-performance/ab-tier0/`。

**merge 前檢查清單（Tier 0 未涵蓋的路徑）**：
1. Light theme（`light`／`streets` 底圖）目視：T0-1 的 normal-blending 近似公式（理論誤差 ≤3/255）與「本體／glow 交錯繪製」順序只在 dark 驗過。
2. 切換一次底圖 + Far View + 空域極光開啟：T0-2 在三個 renderer 都刪了 GL 狀態還原，確認無殘影／混色異常。
3. Progressive 軌跡模式播放 60×：T0-5 相對時間後應平滑無 128 s 跳格。
4. 即時錄影一段：確認 custom layer 改動不影響取像。

## 四、建議執行順序

1. **Tier 0 全部**（本分支，每項附 harness before/after 與截圖 diff）→ 預期 S2 每幀 vertex 減半、long task 消失、同步 stall 消失。
2. **T05-1 + T05-2**（暫停降頻）→ 風扇在暫停時安靜。這是用戶最直接感受到的。
3. **T1-1(b) LOD 檔**（要重生資料 + 上傳 S3）→ 多機場從 5–10M 頂點降到 <1M；這一步之後「開多個機場」與「單機場」同量級。
4. T05-3 / T05-4 → 播放與錄影路徑收尾。
5. Tier 2 依序 T2-3 → T2-1 → T2-2 → T2-4，這是 world 同步顯示的正式工程（多週期）。

## 五、驗收方式

- 量測 harness（本次 session 建立，`perf/` 內 `cdp-trace.mjs`、`probe.mjs`、`run-scenario.sh`）：同場景改前／改後各跑一次，看 fps、主執行緒 busy%、`WaitForGetOffset`、GPU util%、`three.lines`。建議收進 `scripts/perf/`。
- 視覺：同視角截圖逐像素 diff（dark theme T0-1 應為 0 差異）。
- 錄影：即時錄製與 HQ 匯出各跑一次（T05-4）。
- `npm run typecheck` 綠。

---

## 六、2026-10 記憶體方向（2026-10-04，三輪討論定案，尚未動程式）

參與：Claude Opus 5.5（主持＋整合）、Fable 5.1、Codex（gpt-5.6-sol，reasoning high）。全程唯讀，未改 repo。
原始紀錄：[`render-performance/2026-10-memory-rounds/`](render-performance/2026-10-memory-rounds/)（brief＝證據摘要、r1–r3＝兩方各輪全文）。

### 0. 先講結論
1. **重開機的直接機制很可能是整台機器 swap 耗盡**：量測當下（未開 Flight Arc）memory pressure=warn、swap 23.7/24 GB。Flight Arc 是最後一根稻草，不一定是唯一原因。
2. **但 Flight Arc 確實有一個會累積的大洩漏**（兩個模型都各自讀碼驗證成立）：切底圖（dark/light/satellite…，以及關閉 Pure Black）時，Mapbox 因 `setSprite` 無法 diff 改走整個 style 重建，**不呼叫 custom layer 的 onRemove** → 舊 FlightScene／空域極光／atlas glow 的 three renderer 被 canvas 的 `webglcontextlost` listener 留住，CPU 陣列＋GPU buffer 都回收不了。world 單日每切一次估 ~300 MB、多機場 L0 估 ~530 MB，切幾次就是 GB 級。
   - 錨點已親自核對：`MapView.tsx:349`（setStyle）、`:365`（`{diff:false}`）、`App.tsx:1473`（`getLayer("flight-3d")`）、`App.tsx:1544`（未解除的 `map.on("move")`）。
   - 唯一既有的 runtime 旁證：`scripts/perf/README.md:92`「實測跑過 6 場景後 heap 到 1.9 GB」。visual-check 的 bootstrap 每次都走 light→dark，**9 月的 heap 數字是在洩漏存在下量的**，修完要重建基準。
   - 「很多圖層」中空域圖層開啟本身的成本（p95 17.0 vs 9.3 ms）已另有規劃：`docs/backlog/global-airspace-plan.md`（先簡化幾何）。
3. 方向不是換技術棧，而是 **「單一資料所有權＋共用幾何＋預算制」**：修洩漏 → 去掉重複持有 → indexed 幾何讓篩選不再全量重建 → 才視量測決定要不要做空間 tile。全部以零視覺差異為目標，有既有 visual-check / summary-snapshot 守門。

### 1. 路線圖

| Phase | 項目 | 改哪 | 零視覺 | 預估效益 | 量 |
|---|---|---|---|---|---|
| 0 | 量測前提（§2） | scripts/perf 擴充 | — | 決定 1/2/3 的優先序 | 小 |
| 1-1 | setStyle 前明確 removeLayer 三層＋aurora 補 `renderer.dispose()`＋`map.on("move")` 對稱解除＋detachScheduler | MapView.tsx:349/365、airspaceAurora.ts:385-402、App.tsx:1544、repaintScheduler | 是 | 每切一次 W −~300 MB、A −~530 MB（且不再累積） | 小 |
| 1-2 | 靜態桶上傳 GPU 後丟掉不可變 CPU 陣列（只留 alpha）＋context-restore handler 從 TrackPath 重建 | FlightScene.ts StaticBucket、customLayer | 是 | W −93 MB、A −160 MB | 中 |
| 1-3 | 刪 10 Hz 白算（useFlightData.ts:278-284）；viewshed／terminator rAF 暫停不跑 | useFlightData、App.tsx:1724、terminatorOverlay.ts:130 | 是 | 閒置 CPU 歸零 | 小 |
| 2-1 | 靜態軌跡改 **indexed GL_LINES**；篩航司/機型/track-single/日期窗只重寫 index（setDrawRange），不再全量重建；App 拆「基礎集／可見集」 | FlightScene、customLayer、App.tsx:978/1195/1615 | 是（值無損；light 單一保序 index） | GPU W 102→64 MB、A 176→104 MB；vertex −45%；篩選從 ~4 s 重建＋2× 峰值 → ~10 ms | 大 |
| 2-2 | per-point store 取代 mercatorCache（光軌直接讀共用座標；1-2 丟掉的 position/ECEF 在此改為保留並升格為 store，不另存一份） | FlightScene.ts:981-1001、BatchedTrails | 本體同值 | W −85 MB、A −136 MB；seek 尖峰歸零 | 中 |
| 2-3 | DatasetGeneration 原子交換＋記憶體預算（超額等待/提示，**絕不抽航班**）＋Worker 解析＋日期前置過濾（之後可升級 columnar binary） | flightLoader.ts:362-375、useFlightData.ts:119-127 | 是 | world 94 MB 解析離開主執行緒；換資料峰值 ≤ 1 集合＋1 LOD 層 | 中大 |
| 2-4 | FlightScene 單例＋closure 狀態上提（同集合 re-add 零重建） | customLayer.ts:157-163、App.tsx:1615 | 是 | renderer churn 歸零 | 中 |
| 3-1 | 5° 子格 AABB 視錐剔除（mercator 模式，dark only；light 不剔除保順序） | FlightScene | 是（保守剔除） | 多機場 L0 拉近時頂點工作 −75~90%；world globe ≈0 | 中 |
| 3-2 | metadata／幾何分離 → 10° 空間 tile（PMTiles，含 L0/L1/L2） | split-tracks、flightLoader、useFlightData | 否（捲入視野時短暫 L2→L0） | 常駐記憶體只剩視野內 | 大 |

**3-2 閘門**（Phase 2 後量，任一命中才做）：apac L0 或多日 world 穩態 renderer footprint >1 GB 或 GPU process 增量 >600 MB；最大集合首幀 >8 s；需求擴到 ≥7 日 world。

已一致**不做**：ECEF 搬回 shader（GPU-bound 下會更慢）、mercatorCache 純 LRU（seek 尖峰）、篩選用 alpha=0 隱藏（vertex-bound 下頂點照跑）、再提地形/DPR/MSAA。

### 2. Phase 0 量測（環境乾淨後才做）
前提：重開機或關閒置程式，pressure level 回 normal、swap < 12 GB。
- **先驗量測工具本身**：TypedArray 的 backing store 是 V8 external memory，`usedJSHeapSize`／`JSHeapUsedSize` 可能不含 → 分配 200 MB Float32Array 看數字動不動；改量 renderer 與 GPU process 的 `phys_footprint`（`footprint` / `vmmap --summary`；`ps rss` 會低估 Metal/IOSurface）。
- 量：空 tab／world 穩態／播完一天／apac L0；style 切 10 次階梯；切 20 次機場組合峰值；world 載入 long task。
- 判讀：階梯斜率≈0 → 1-1 降為衛生項；world 穩態 <300 MB 且峰值 <500 MB → 記憶體不是 Flight Arc 主因，2-2/2-3 降級；GPU busy 主導風扇 → 2-1、3-1 前移；載入 long task >1 s → 2-3 升入 Phase 1。

### 3. 新增驗收（既有 visual-check / summary-snapshot / ab-run 之外）
- T-A 切 style 階梯：light/dark ×10，每次 stable＋GC 後記 footprint、canvas `webglcontextlost` listener 數、`map._listeners.move.length`。通過：斜率 ≤10 MB/次、listener 數不變。
- T-B context loss：`WEBGL_lose_context` lose→restore 後 visual 比對 pctOver8<0.15%、console 無 TypeError。
- T-C 子集等價：篩航司 X 改前改後逐像素同、summary 同、篩選期間 bufferData=0。
- T-D 上傳位元組：world indexed 後 ≤70 MB。
- T-E 光軌等價：20 個 seek 時刻 orb 位置差 ≤1 ulp；新增 z15 場景。
- T-F 剔除開關：cull on/off 逐像素 0 差。
- T-G 換集合峰值：切 20 次組合，峰值 ≤ 穩態＋1 個集合。

### 4. 未共識（小）
- per-point store 的 xy 精度：Fable 主張 Float32（本體 bit-identical，只有 head/tail 插值 ≤2.4 m，z15 場景驗）；Codex 主張 Float64（world 多 ~15 MB，換精度與 restore 單一路徑）。建議：先 Float64（保守、符合「呈現不能錯」），z15 驗過再考慮收。
- 2-1 前要不要做過渡的緊湊 cache：Fable 認為是丟棄工；只在 2-1 延誤時才做。

### 5. Phase 0 實測結果（2026-10-12，warn 狀態下量測，絕對值僅供參考）

環境：DPR 2、canvas 2938×1706、地形開、Chrome 154；量測期間 memory pressure 多為 2（warn），swap ~2.9/4 GB。每項皆重開乾淨 Chrome。腳本與原始數據：[`render-performance/2026-10-phase0/`](render-performance/2026-10-phase0/)（`run.mjs` 可重跑，Phase 1 完成後用同一套對照）。

- **量測工具修正**：CDP `JSHeapUsedSize` **看不到 TypedArray**（配 200 MB Float32Array → −1.9 MB）；`Runtime.getHeapUsage().backingStorageSize` +190.7 MB、renderer `phys_footprint` +186 MB。→ 之後一律看 `backingStorageSize` + footprint。
- **各場景穩態（GC 後，renderer／GPU process／backingStorage）**：空白 64／299／0；S1 RCTP 304–334／1,005–1,066／72；S2 apac fit（L2）451–471／1,118／81；S2 拉近 z10.2（L0，255 萬點）**819**／1,214／329；world z3（L2，81,599 班）**999（峰值 1,678）**／1,105／233 MB。
- **world 載入**：10.3 s 穩定、7 個 long task、**最長 1,529 ms**。
- **GPU process ~1 GB 主要是底圖＋地形＋DPR2 framebuffer**，軌跡增量約 50–200 MB（與估算相符）。
- **T-A 切底圖（S2 apac L2，×11）**：renderer **+30.0 MB/次**、GPU **+27.9 MB/次**；每切一次多留 1 個 FlightScene、3 個 WebGLRenderer、3 個 `webglcontextlost` listener、1 個 move listener，完全線性（11 次後 FlightScene=12、WebGLRenderer=36）。**洩漏實測成立**；L0／world 的斜率未量，預期更大。
- **T-G 換集合 ×12**：FlightScene／WebGLRenderer 實例恆為 1／3，**換集合本身無實例洩漏**；renderer 在 304–780 MB 間漂移、無線性階梯（推測 Mapbox tile cache／allocator，未驗證）。峰值 renderer 1,041 MB（RJTT）、GPU 1,354 MB。
- **閒置**：S2 暫停 32 s 後 renderer／GPU 皆 0%（歸零）；world 暫停後 GPU 0% 但 **renderer 仍 4–6%**。

**對路線圖的影響**：1-1 維持第一（實證）；world 穩態 999／峰值 1,678 MB 超過「<300／<500」門檻 → 2-2、2-3 不降級；world long task 1.5 s >1 s → **2-3（Worker 解析）升入 Phase 1**；1-3 要做（world 閒置 renderer 殘留）；GPU process 大頭不在軌跡 → 2-1 對 GPU 記憶體的效益在此機器相對有限，以 vertex 工作量與篩選重建時間為主要收益。

未量：L0／world 的 T-A 斜率、「播完一天」的 mercatorCache 成長、多次取中位數。
