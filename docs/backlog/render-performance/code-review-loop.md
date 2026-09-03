# Flight Arc 每幀主迴圈與 React 效能審查（唯讀）

分支 `perf/render-audit`。mapbox-gl **3.18.1**（`node_modules/mapbox-gl/dist/mapbox-gl-dev.js`，下文簡寫 `mgl:行號`）、three **0.172.0**（`node_modules/three/src/...`）。所有 ms 估算除非另註，皆為推理估算（Apple Silicon 桌機、2560×1440 canvas），需以 DevTools Performance / React Profiler 實測校準。

---

## 1. 總表

| id | file:line | 現況（一句） | 估算成本 | 修法草案（一句） | 視覺影響 | 工作量 | 風險 |
|---|---|---|---|---|---|---|---|
| **C1a-1** | `src/hooks/useTimeline.ts:132-139` → `src/App.tsx:996` | 播放時 rAF 內 `setCurrentTime` → App（31 useState / 21 useMemo / 22 useEffect）整棵樹每幀重渲染；`src/components/` **零個 `React.memo`**，IconRailSidebar（397 JSX tag / 222 inline style）、TimelineControls、OrientationOrb、MapView 全部跟著跑 | 每幀 ~250–350 個 host element reconcile（含 inline style 物件逐鍵 diff）≈ **1–3 ms/幀 JS（桌機）、3–8 ms（手機）**；DOM 實際只改 1 個 `input.value` + 每模擬分鐘 1 次文字 | 時鐘留在 hook 內的 `timeRef`，rAF 直接寫 ref + `map.triggerRepaint()`；React state 以 ~10 Hz 節流發布（`seek()` 同步寫 ref + 立即發布） | 零視覺差異（slider step 0.001＝86.4 模擬秒；≤600× 時每秒 <7 步，10 Hz 不掉步；1800×/3600× 每次更新跳 2–4 步＝400 px 軌上 <1.6 px） | M | 中：`timeRef` 目前在 render 期寫入（App.tsx:996），改由 hook 擁有；播放 stall 橋接邏輯（customLayer.ts:68 KEEP_ALIVE 註解）語意變更 |
| **C1a-2** | `src/App.tsx:374,1174-1184` | `map.on("move")` 每次都 `setCameraInfo({...新物件})`，四捨五入後值相同仍觸發 App 整樹重渲染 → 拖曳／orbit／cinema／flyTo 期間**即使暫停**也每幀 React 重渲染 | 同 C1a-1 的 1–3 ms/幀，僅相機移動時 | 先比較五個欄位，相同就不 set（或用 functional update 回傳 prev） | 零視覺差異 | S | 低 |
| **C1a-3** | `src/App.tsx:749-750,766`；`IconRailSidebar.tsx:2383-2397` | 假說「displayedFlights / summary 統計隨時間重算」→ **推翻**：deps 是 `windowStart/End/dateWindow*`（useTimeline 內 useMemo，穩定）與 `flights`（穩定） | 0 | 不需修 | — | — | — |
| **C1b-1** | `src/map/customLayer.ts:243-251`；`FlightScene.ts:917-919` | `hasActiveOrbs()`（activeOrbCount>0）為真 → 每幀 `keepAliveFrames=12` → `triggerRepaint()`：**暫停、相機靜止、只要模擬時刻有任一航班在空中，就永續 60 fps 重繪整張 Mapbox**（terrain 貼圖、globe、所有 style layer、3 個 custom layer） | Mapbox 完整一幀（含 terrain：每 proxy tile 一次 129×129 網格 draw ≈ 33k tri/tile × 15–40 tile、symbol、atmosphere、MSAA resolve）估 **4–12 ms GPU + 2–4 ms CPU，×60 fps = 100% duty** → 風扇 | 只剩「光球呼吸／閃爍」理由時不走 keepAlive，改 `setTimeout(() => map.triggerRepaint(), 1000/20 − elapsed)` 單一 pending timer（Mapbox 沒有「N ms 後重繪」API，`triggerRepaint` 只排下一個 rAF：mgl:102742-102757）；或暫停 N 秒後完全 idle | 可見取捨（20–24 fps 呼吸略不滑；閃爍 83 ms 亮期在 20 fps 只剩 1–2 幀）→ 搭配 C1c 改 wall-clock 後為「近零差異」 | S（單獨）/ M（配 C1c） | 中：`InstancedOrbs.ts:101-102` 用固定 `dt=0.016`，降頻會讓動畫慢 3×，**必須先改 wall-clock** |
| **C1b-2** | `src/map/atlasGlowLayer.ts:119-120`；`GlowPointsScene.ts:268-288` | `scene.render()` 永遠 `return true` → atlas glow 可見時永續 60 fps 重繪 | 同上一整幀 | GlowPointsScene 已是 `uTime` shader 動畫；同樣用 wall-clock 節流 timer 到 20–24 fps | 近零差異 | S | 低 |
| **C1b-3** | `src/map/airspaceAurora.ts:331` | 空域開啟且有可見輸出 → 每幀 `triggerRepaint()`（shimmer） | 同上一整幀（僅空域開啟時） | 同上節流 | 近零差異 | S | 低 |
| **C1b-4** | `src/map/terminatorOverlay.ts:129-143`；`App.tsx:1342`；`useCinemaCamera.ts:229-248` | 晨昏線 rAF 已節流 5 fps 且 ≥5 模擬秒才 setData（OK）；track-single 模式 rAF 每幀更新 viewshed buffer（僅該模式）；orbit rAF setBearing → 相機動，重繪屬必要 | 可忽略 / 模式限定 | 不動 | — | — | — |
| **C1c** | `src/three/InstancedOrbs.ts:98-167`；`FlightScene.ts:866-874` | 暫停 early-return 仍每幀 `updateAll(lastOrbEntries)`：每 instance 重算 mercatorToGlobe + 4 次 `updateMatrix/setMatrixAt` + `setColorAt`，然後 5 個 attribute `needsUpdate` → three `bufferSubData(0, 整個陣列)`（`WebGLAttributes.js:83-86`），不看 `mesh.count` | CPU ≈ 0.3–0.6 µs/instance → **1024 instance ≈ 0.3–0.6 ms/幀**（300 orb ≈ 0.1–0.2 ms）；上傳 **64 KB×4 + 12 KB = 274 KB/幀 = 16 MB/s @60fps**，且 buffer 是預設 `StaticDrawUsage`（`BufferAttribute.js:29`） | 呼吸／閃爍搬進 shader：`uTime`（wall-clock 秒）uniform + per-instance `aPhase` InstancedBufferAttribute；instanceMatrix 只在 entries／globe 參數／scale 變時重算（暫停+相機靜止 → 0 上傳）；attribute `setUsage(DynamicDrawUsage)` | 零視覺差異（同一組公式搬到 GPU） | M | 中：3 個 glow layer 共用 `geo`，`aPhase` 掛在 geometry 上剛好同 index 同 phase；`pickFlight` 用 CPU `positions[]` 不受影響 |
| **C1d** | `src/three/FlightScene.ts:921-943`；同樣 pattern `GlowPointsScene.ts:270-286`；`airspaceAurora.ts:324-326` | 每幀 `gl.isEnabled` + **4 次 `gl.getParameter(BLEND_*)`** + 2 次 `resetState()` + 手動還原 blend。**證實多餘**：Mapbox `drawCustom` 在 custom layer render 後立刻 `context.setDirty()`（mgl:91267）把全部 ~31 個追蹤值標 dirty（mgl:86987-87018），下一個 `set()` 一律重發 GL 呼叫，不依賴 custom layer 留下的狀態 | Chromium：`GL_BLEND_SRC_RGB/DST_RGB/SRC_ALPHA/DST_ALPHA` 在 `GLES2Implementation::GetHelper` 的「Non-cached parameters」清單 → `GetIntegerv` 走 `helper_->GetIntegerv(...)` + **`WaitForCmd()` 同步等 GPU process**（見 §C1d 引文）→ **每幀 4 次（atlas glow 開時 8 次）sync round-trip，每次得先 drain 這幀 Mapbox 已排的所有指令**；估 **0.5–3 ms/幀 + 破壞 CPU/GPU pipelining**（一頓一頓的高嫌疑）。`isEnabled` 走 client cache（`state_.GetEnabled`）≈ 免費。`resetState` 各 31 個 GL 呼叫 ×2×3 層 ≈ 186 呼叫/幀 ≈ 40 µs | 刪除 4 個 `getParameter` 與尾段還原（937-942）；保留 render 前的 `resetState()`（three 內部快取需與 Mapbox 改過的 GL 狀態同步）；尾段 `resetState()` 可刪（Mapbox setDirty 已涵蓋）；三個檔案同步 | 零視覺差異 | S | 低（Mapbox 原始碼保證；驗收：切換底圖／symbol／fill-extrusion 畫面無異常） |
| **C1e-1** | `src/map/MapView.tsx:276`；`useCanvasRecorder.ts:209-216, 329-336` | `preserveDrawingBuffer:true` 直接進 WebGL context attribute（mgl:102200-102205）。錄影取像用 `ctx.drawImage(srcCanvas)`；**即時錄製**在自己的 rAF 內取像，與 Mapbox 的 rAF 無順序保證 → 目前確實需要 preserve；**HQ 匯出**用 `map.once("render")`（同一 task、compositing 前）→ 不需要 | 每幀瀏覽器無法 swap 只能 copy 整張 back buffer：2560×1440×4 = **14.7 MB/幀 ≈ 0.9 GB/s**，估 0.3–1 ms GPU/幀；並阻擋部分 compositor 最佳化 | 即時錄製改由 `map.on("render", composite)` 同步取像（Mapbox 在 `painter.render` 後 fire，mgl:102429），然後 `preserveDrawingBuffer:false`。context attribute 不可熱切換，故不做「錄影時重建 map」 | 零視覺差異（錄影檔需回歸測試） | S–M | 中：`waitForRender` 的 200 ms `setTimeout` fallback 是跨 task，preserve=false 時若 render 事件沒來會取到清空的 buffer（僅極端情況） |
| **C1e-2** | `src/map/MapView.tsx:275`；mgl:102203, 25858-25863 | `antialias:true` = 瀏覽器 MSAA（非 Mapbox 自家 FBO）；Mapbox 只在 `globeUseCustomAntiAliasing` 讀它，且 terrain exaggeration>0 時自家 AA 一律停用 → **context MSAA 是目前 globe 邊緣／terrain 唯一 AA** | 4× MSAA：color+depth 4 倍 ≈ 118 MB VRAM；每個 blended fragment 寫 4 sample（加色軌跡 fill-rate ×2–4）+ 每幀 resolve blit | 保留；若要省，先實測 `antialias:false` 的 GPU 幀時間再決定 | **可見取捨**（globe 輪廓、terrain 邊鋸齒） | S | 高（視覺回歸） |
| **C1e-3** | `src/map/MapView.tsx:173-183, 297` | 每次 style.load 固定 `setTerrain({exaggeration:1.5})`；**Globe.requiresDraping=true**（mgl:44317）→ z<6 globe 模式下 `setTerrain(null)` 會被 `setTerrainForDraping()`（mgl:101779-101781, 81294-81297）換成 mock terrain（exaggeration 0, deferred）→ **draping FBO pass 仍在**，關 terrain 只省 DEM tile 下載／解碼、高程查表與 elevated mesh | Terrain 繪製流程：draped layers（fill/line/background/hillshade/raster，mgl:20373,20437）→ `renderBatch` 每 proxy tile 進 FBO（pool 5 + render cache，mgl:84290-84382；相機靜止且無 transition 時走 cache 跳過 84313-84316）→ `drawTerrainRaster` 每 tile 一次 129×129 網格 draw（GRID_DIM=128，mgl:83765,83609-83684）| 用 zoom-dependent exaggeration 交給 Mapbox 自動關：`exaggeration: ["interpolate",["linear"],["zoom"],4.5,0,5.5,1.5]`——mercator 下評估為 0 時 Mapbox 自己 `_disable()`（mgl:83924-83928），無需手動 toggle | 近零差異（z≤5 時 Everest×1.5 位移 <5.4 px、玉山 <2.4 px；z≤4 全球 <3 px） | S | 低–中：實際能省多少取決於 z<6 時是否真的在載 DEM；**需實測**。DEM tile 在 toggle 後是否保留在 SourceCache 未驗證 |
| **C1f** | `src/map/customLayer.ts:98-99,120,165-180,189,221,224,235` | 每幀無條件呼叫 `setStaticOpacity/Width/GlowIntensity/OrbScale/LimbFade/ProgressiveMode`、`updateStaticTrails`（建 key 字串）、14 段 `controlSig` 模板字串、`getFreeCameraOptions()`（配置 FreeCameraOptions + MercatorCoordinate，mgl:76002-76011）、`getActiveFlights` 每幀重建陣列 | 合計 **~10–70 µs/幀**（<0.5% 幀預算），主要是字串／物件配置的 GC 壓力 | `controlSig` 改成逐欄位數值比較（不拼字串）；`getActiveFlights` 在 time 未變時回傳快取陣列；setter 只在值變時呼叫（FlightScene 內已有部分早退） | 零視覺差異 | S | 低 |

---

## 2. 證據

### C1a-1 React 每幀重渲染鏈

**證實**（子元件全跟著重渲染）；**推翻**（displayedFlights／summary 隨時間重算）。

`src/hooks/useTimeline.ts:127-148`：
```ts
const animate = (now: number) => {
  ...
  setCurrentTime((prev) => { ... return next; });
  rafRef.current = requestAnimationFrame(animate);
};
```
回傳物件 `useTimeline.ts:209-234` 每次 render 都是新字面量 → `timeline` identity 每幀變（`App.tsx:607` 的 effect deps 含 `timeline`，每幀執行但立即早退，可忽略）。

- `grep -rn "React.memo\|memo(" src --include='*.tsx'` → **0 筆**。App JSX 掛載的元件（`App.tsx:1375 MapView, 1634 IconRailSidebar, 1914/2184 TimelineControls, 1939 OrientationOrb, 1863/1869 DataSourceToggle/DepArrToggle, 2038 LoadingIndicator`）全部每幀重跑函式主體。
- 渲染面（`grep -o "<[a-zA-Z]"`）：App 144 tag / 59 inline style；IconRailSidebar 397 / 222（`IconRailSidebar.tsx:3183-3273` 同時只掛一個 panel，估 100–150 個 element）；TimelineControls 43 / 22。inline style 每幀新物件 → React 逐鍵 diff。
- 真正需要每幀的 DOM：`TimelineControls.tsx:448` 文字（`formatDateTime` 取到分鐘，每模擬分鐘才變）與 `:458` `<input type=range value={progress}>`。
- `App.tsx:1453` 每 render 一次 `toLocaleString("zh-TW",{...})`（V8 對帶 options 的呼叫會重建 DateTimeFormat，估 50–200 µs）——**僅在 `captureMode` 分支**（`App.tsx:1392`），一般模式不跑。
- `App.tsx:749-750` `displayedFlights` deps：`timeline.windowStart, windowEnd, isMultiDateMode, dateWindowStarts, dateWindowEnds` → 皆為 `useTimeline.ts:67-92` 的 useMemo，播放中不變。`IconRailSidebar.tsx:2383-2397` `airportStats` deps `[flights, selectedAirport, isAirportScope]` → 不隨時間重算。
- render loop 已走 ref：`App.tsx:970,996`（`timeRef.current = timeline.currentTime` 在 render 期寫入）；`customLayer.ts:85` 透過 `opts.getCurrentTime()` 讀。

**最小改法（時鐘留 ref、10 Hz 發布）**：
1. `useTimeline` 內部持有 `timeRef`，rAF 迴圈直接 `timeRef.current += dt*speed`，並呼叫 `onTick?.()`（App 傳 `() => mapRef.current?.triggerRepaint()`）；每 100 ms 或 `playing` 切換／到達 windowEnd 時才 `setCurrentTime(timeRef.current)`。
2. `seek/seekByProgress`：同步寫 `timeRef` + 立即 `setCurrentTime`（拖 slider 需即時回饋）。
3. `App.tsx:996` 刪除（ref 改由 hook 提供）；`App.tsx:1020-1027` effect deps 移除 `timeline.currentTime`（播放中的重繪改由 hook 的 onTick 直接踢）。
4. `customLayer.ts:68` 註解「橋接 timeRef 落後一幀」失效——因 rAF 內同步寫 ref 再 triggerRepaint（Mapbox `_frame` 排在**下一個** rAF，mgl:102745-102757），Mapbox render 時 ref 已是最新；KEEP_ALIVE 其他用途（transition／static building）保留。

**受影響依賴者**：
- `useCinemaCamera.ts`：全檔不引用 timeline／currentTime（grep 為空）→ 不受影響。
- `useCanvasRecorder.ts` overlay：`App.tsx:626` 的 `getOverlay` 已讀 `timeRef.current` → 不受影響。
- keyframe：只存相機，與時間無關。
- `timeline.progress` 消費者：僅 `TimelineControls`（`App.tsx:1917, 2187`）。速度選項 `TimelineControls.tsx:430-438` = 1/15/30/60/120/300/600/1800/3600×；slider step 0.001 × 86,400 s = 86.4 模擬秒／步 → 每秒步數 = S/86.4：60× 0.7 步/s、600× 6.9、1800× 20.8、3600× 41.7。10 Hz 發布在 ≤600× 完全不掉步；1800×/3600× 每次更新跳 2–4 步（軌長 400 px 時 0.8–1.6 px），不可辨。
- `App.tsx:1038, 1049` DEV debug 物件只讀 `timeline.playing/speed` → 不受影響。

**驗收**：播放 3600× 一整天，DevTools Performance 中 React commit 次數 ≈ 10/s（原 60/s）；拖 slider 立即跟手；播到 windowEnd 正確停止並回捲；錄影 overlay 時間正確。

### C1a-2 cameraInfo（額外發現）

`src/App.tsx:1174-1184`：
```ts
const updateCamera = () => {
  const c = map.getCenter();
  setCameraInfo({ lng: +c.lng.toFixed(4), lat: ..., zoom: ..., pitch: ..., bearing: ... });
};
map.on("move", updateCamera);
```
每個 `move` 事件都傳新物件 → React 不會 bail-out → orbit／拖曳／flyTo 期間 App 整樹每幀重渲染，與播放無關。消費者：`App.tsx:1473, 1940-1941, 2031, 2063`（文字與 OrientationOrb）。修法：`setCameraInfo(prev => (prev.lng===lng && ...) ? prev : next)`。

### C1b Repaint 政策

**證實**。`src/map/customLayer.ts:239-251`：
```ts
if (timeChanged || transitioning || flightScene.isStaticBuilding() ||
    flightScene.hasActiveOrbs() ||   // 有光球呼吸/閃爍動畫
    controlsChanged) { keepAliveFrames = KEEP_ALIVE_FRAMES; }
if (keepAliveFrames > 0) { keepAliveFrames--; map?.triggerRepaint(); }
```
`FlightScene.ts:857-874`：暫停 early-return 仍設 `activeOrbCount = lastOrbEntries.length` → 只要模擬時刻有航班在空中（多機場幾乎恆真），`hasActiveOrbs()` 恆真 → 每幀 re-arm。

Mapbox 每次 `triggerRepaint` → `_triggerFrame` → `_render`（mgl:102348-102428）：`setDirty`、`_renderTaskQueue`、style update（若 dirty）、`_updateAverageElevation`、`_updatePlacement`、`painter.render` 全 pass（offscreen → shadow → opaque → sky → translucent 含 `terrain.renderBatch`，mgl:94179-94352）。沒有「部分重繪」。

其他永續來源（grep `triggerRepaint|requestAnimationFrame|setInterval`）：
- `atlasGlowLayer.ts:119-120` `const moving = scene.render(matrix); if (moving) triggerRepaint()`，而 `GlowPointsScene.ts:288` 永遠 `return true` → atlas glow 可見時 60 fps。
- `airspaceAurora.ts:331` `if (hasVisibleOutput) mapRef?.triggerRepaint()` → 空域開啟時 60 fps。
- `terminatorOverlay.ts:134-138` rAF 但 200 ms 節流 + ≥5 模擬秒才 setData → 可忽略。
- `App.tsx:1342` track-single rAF：每幀 `updateViewshedLines/Fans`（buffer 上傳）→ 僅該模式。
- `useCinemaCamera.ts:244, 391`：orbit／sequence 每幀改相機 → 重繪必要。
- `useCanvasRecorder.ts:214` 錄影 compositeLoop rAF → 僅錄影時。

**暫停降頻方案**：
- 實作點：`customLayer.ts:239-251` 拆成兩層——「必要重繪」（timeChanged／transitioning／isStaticBuilding／controlsChanged）維持 keepAlive；「純裝飾動畫」（hasActiveOrbs）改 `scheduleDecorRepaint()`：若無 pending timer，`setTimeout(() => { timer=null; map?.triggerRepaint(); }, max(0, 1000/ORB_FPS − (now − lastRenderAt)))`。Mapbox 本身只有 `triggerRepaint()`（排下一個 rAF）沒有延遲重繪 API，所以要靠 timer。`onRemove` 清 timer。
- 同法套 `atlasGlowLayer.ts:120`、`airspaceAurora.ts:331`。
- 視覺：呼吸 `sin(t*2)` 週期 3.1 s，20 fps 每幀相位差 0.1 rad → 平滑；閃爍亮期 0.083 s 在 20 fps ≈ 1.7 幀、24 fps ≈ 2 幀（60 fps 為 5 幀）→ 仍可見但短促。**前提**：`InstancedOrbs.ts:101-102` `dt = 0.016` 固定累加，降頻不改會讓動畫慢 3×——先改為 `performance.now()` 差值或直接做 C1c。
- 進階：暫停且相機靜止超過 N 秒（例如 30 s）→ 完全 idle，任何互動（`move`／play／控制項）再喚醒；風扇問題最直接的解。

### C1c InstancedOrbs 每幀重算

**證實**。`src/three/InstancedOrbs.ts:98-167` 逐 instance：`mercatorToGlobe`（~40 flops + sqrt）→ 3 層 `_dummy.position/scale.set + updateMatrix + setMatrixAt`（各 ~40 flops + 16 float copy）→ blink 層同上 + `setColorAt`；結尾 5 個 `needsUpdate = true`。

three `WebGLAttributes.js:76-86`：
```js
if ( updateRanges.length === 0 ) {
  // Not using update ranges
  gl.bufferSubData( bufferType, 0, array );
```
→ 上傳**整個** `MAX_INSTANCES(1024)×16×4 B = 65,536 B` 陣列，與 `mesh.count` 無關；4 個 mesh + `instanceColor`（`InstancedMesh.js:210`，1024×3×4 = 12,288 B）= **274 KB/幀**。`BufferAttribute.js:29` 預設 `StaticDrawUsage`。

**Shader 化設計**（GlowPointsScene 已有 `uTime` 前例，`GlowPointsScene.ts:278`）：
- 屬性佈局：
  - 既有 `instanceMatrix`（mat4，位置 + 基礎 scale = `orbScale × layer.scaleRatio × mul × cull`，不含 pulse）
  - 新增 `aPhase`：`InstancedBufferAttribute(Float32Array(1024), 1)`，建構時一次填入 `phaseOffsets`，掛在 `geo` 與 `blinkGeo`（3 個 glow 層共用 `geo`，同 index 同 phase 正確）
  - uniform `uTime`（秒，wall-clock）——4 個材質共用同一 `{value}` 物件
- Vertex：glow 層 `transformed *= 1.0 + 0.15 * sin(uTime * 2.0 + aPhase);`（object space 等比縮放，在 instanceMatrix 之前套用等價於 CPU 版）；blink 層不縮放。
- Fragment（blink 層）：`float c = fract((uTime + aPhase) * 1.2); float b = max(step(c, 0.1), 0.7 * step(0.15, c) * step(c, 0.25)); diffuseColor.rgb *= vec3(b, b*0.1, b*0.1);` → 移除 `instanceColor` 整個上傳。
- 實作路徑：`MeshBasicMaterial` + `onBeforeCompile` 注入（最小改動），或仿 `src/three/shaders/trail.vert/frag` 新增 `orb.vert/frag` 用 ShaderMaterial（更可控）。
- `updateAll` 拆成 `setEntries(entries, globeSig)`（只在 entries ref／globe 矩陣元素／transition／cam／orbScale／scaleMap 變時重算並 `needsUpdate`）與 `setTime(sec)`；`FlightScene.ts:866-874` early-return 改呼叫 `setTime` 而非 `updateAll`。
- 改動檔案：`src/three/InstancedOrbs.ts`、`src/three/FlightScene.ts`（857-909, 794-822 `setGlobe` 傳簽章）、`src/map/customLayer.ts:243`（配 C1b）、（可選）`src/three/shaders/orb.*`。
- 驗收：暫停 + 相機靜止時 DevTools 無 `bufferSubData`；呼吸／閃爍節奏與現況一致（同公式）；`pickFlight` 命中不變（`positions[]` 仍由 CPU 維護）。

### C1d FlightScene.render() 的 GL 狀態存取

**證實多餘**。`src/three/FlightScene.ts:921-943`：
```ts
const blendEnabled = gl.isEnabled(gl.BLEND);
const blendSrc = gl.getParameter(gl.BLEND_SRC_RGB);      // ×4
...
this.renderer.resetState(); this.renderer.render(...); this.renderer.resetState();
if (blendEnabled) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
gl.blendFuncSeparate(blendSrc, blendDst, blendSrcA, blendDstA);
```

Mapbox custom layer 繪製路徑 `drawCustom`（mgl:91207-91271），translucent pass：
```js
painter.setCustomLayerDefaults();                      // 91256（unbindVAO、cullFace/frontFace/activeTexture/pixelStore 設 default）
context.setColorMode(painter.colorModeForRenderPass()); // 91257（blend/blendFunc/blendColor/blendEquation set）
context.setStencilMode(StencilMode.disabled);           // 91258
const depthMode = implementation.renderingMode === "3d" ? new DepthMode(gl.LEQUAL, DepthMode.ReadWrite, painter.depthRangeFor3D) : ...; // 91259
context.setDepthMode(depthMode);                        // 91260
implementation.render(context.gl, ...);                 // 91263/91265
context.setDirty();                                     // 91267
painter.setBaseState();                                 // 91268（cullFace/viewport/blendEquation）
context.bindFramebuffer.set(null);                      // 91269
```
`Context.setDirty()`（mgl:86987-87018）把 `blend, blendFunc, blendColor, blendEquation, depthTest, depthFunc, depthMask, stencil*, cullFace, program, activeTexture, viewport, bindFramebuffer, bind*` 等 ~31 個追蹤值全標 `dirty=true`；各 value 的 `set()` 形如 mgl:82862 `if (v === this.current && !this.dirty) return;` → dirty 時**無條件重發 GL 呼叫**。因此 custom layer 結束時留下什麼 blend 狀態，Mapbox 完全不在乎；手動 save/restore 是純開銷。每幀 `_render` 開頭也再 `setDirty()`（mgl:102360）。

Chromium（`gpu/command_buffer/client/gles2_implementation.cc`，main）：`GLES2Implementation::GetHelper` 的 non-cached 清單包含
```c
case GL_BLEND_SRC_ALPHA: case GL_BLEND_SRC_RGB: case GL_BLEND_DST_ALPHA: case GL_BLEND_DST_RGB: ... return false;
```
`gles2_implementation_impl_autogen.h` `GLES2Implementation::GetIntegerv`：
```cpp
if (GetIntegervHelper(pname, params)) { return; }
...
helper_->GetIntegerv(pname, GetResultShmId(), result.offset());
if (!WaitForCmd()) { return; }
```
→ 每次 `getParameter(BLEND_*)` 都是 renderer→GPU process 的**同步 round-trip**，且 `WaitForCmd` 需等 GPU process 消化掉這幀之前排入的所有指令（opaque pass、terrain draping…）才回來 → 每幀 4 個 sync point（atlas glow 開時 `GlowPointsScene.ts:271-275` 再 4 個）。`IsEnabled` 由 `state_.GetEnabled` client cache 直接回答，無 round-trip。單次 round-trip 在 GPU process 空閒時 ~0.1–0.5 ms，佇列深時可達數 ms；保守估 **0.5–3 ms/幀**，並讓 CPU 無法領先 GPU 排指令——這是「一頓一頓」而非「整體慢」的典型成因。

three `WebGLState.js:1185-1233` `reset()`：31 個 GL 呼叫（7 disable、4 blend、colorMask、clearColor、depthMask/Func、clearDepth、4 stencil、cullFace/frontFace、polygonOffset、activeTexture、3 bindFramebuffer、useProgram、lineWidth、scissor、viewport）+ `bindingStates.reset()`。三個 custom layer ×2 = 186 呼叫/幀，屬非同步指令流（~0.2 µs/呼叫），≈40 µs——次要。

修法：刪 `FlightScene.ts:924-928, 937-942`；尾段 `resetState()`（935）可刪；`GlowPointsScene.ts:270-275, 284-286` 同步刪；`airspaceAurora.ts:326` 尾段可刪。保留 render **前**的 `resetState()`（three 的狀態快取須與 Mapbox 改過的實際 GL 狀態同步，這一步不能省）。

### C1e Mapbox 初始化選項

`src/map/MapView.tsx:262-277`：`antialias: true, preserveDrawingBuffer: true`；`:173-183` `setupTerrain` 每次 style.load 都 `setTerrain({source:"mapbox-dem", exaggeration:1.5})`；未設 `projection` → v3 預設 standard/globe（`customLayer.ts:183` 以 `projection.name === "globe"` 分支，證實在跑 globe）。

**preserveDrawingBuffer（部分）**：
- mgl:102200-102205 直接當 WebGL context attribute：`this._canvas.getContext("webgl2", {..., preserveDrawingBuffer: this._preserveDrawingBuffer, antialias: this._antialias || false})`。
- 取像方式全是 `ctx.drawImage(srcCanvas)`（`useCanvasRecorder.ts:210, 332`），`captureStream` 是對 2D composite canvas 呼叫（`:219, :272`），不需要 WebGL canvas preserve。`grep toDataURL|toBlob|readPixels src` → 0 筆。
- 即時錄製 `:209-216`：`compositeLoop` 是獨立 rAF；同一幀內 rAF 回呼順序依註冊順序，Mapbox 的 `_frame` 與 compositeLoop 各自每幀重新註冊 → 無保證誰先；若 compositeLoop 先跑，preserve=false 時讀到的是上一幀 composite 後被清掉的 buffer → **此路徑目前需要 preserve**。
- HQ 匯出 `:329-336`：`map.once("render", done)` 在 `_render` 內同步 fire（mgl:102429）→ promise continuation 為 microtask，在 Mapbox rAF 回呼結束、compositing 之前執行 → **不需要 preserve**。`setTimeout(done, 200)` fallback 是跨 task（僅 render 事件沒來時觸發）。
- 修法：即時錄製改 `map.on("render", () => { ctx.drawImage(srcCanvas,0,0); drawOverlay(...) })`（同 task、buffer 最新），移除 compositeLoop rAF；然後 `preserveDrawingBuffer:false`。attribute 不能熱切換（需 `new Map`），「錄影時才重建 map」代價是整套 style／layer／資料重建，不值得。
- 成本依據：WebGL 規範 preserve=false 允許瀏覽器把 drawing buffer **交換**給 compositor；preserve=true 必須**複製**（Chrome 每幀 blit 一份 2560×1440×4 = 14.7 MB，60 fps ≈ 0.9 GB/s）。與 MSAA 疊加時 resolve+copy 各一次。

**antialias（可見取捨）**：
- mgl 全檔 `_antialias` 只用於 `globeUseCustomAntiAliasing`（mgl:25858-25863）：`return transitionT === 0 && !useContextAA && !disabled`，其中 `disabled = painter.terrain && painter.terrain.exaggeration() > 0`。本專案 terrain 恆開 → Mapbox 自家 globe AA 永遠停用 → **context MSAA 是唯一 AA**。關掉會在 globe 輪廓、terrain skirt、fill-extrusion 邊緣出現鋸齒。
- 成本：瀏覽器建立多重取樣 default framebuffer（Chrome 通常 4×）：2560×1440×(4 B color + 4 B depth/stencil)×4 ≈ 118 MB；每個通過的 fragment 寫 4 sample（加色軌跡大量重疊 → blend 頻寬 ×2–4）；每幀 resolve。Apple TBDR 上 MSAA 相對便宜。建議只在實測後決定。
- 附帶：`FlightScene.ts:199-203` 對 three 傳 `antialias:true` 無效（已提供 `context`），可拿掉避免誤導。

**terrain（部分）**：
- 繪製流程（terrain 開）：`Painter.render` translucent pass 遇到 draped layer 即 `this.currentLayer = this.terrain.renderBatch(this.currentLayer)`（mgl:94305）。`renderBatch`（mgl:84290-84382）：對每個 proxy tile 綁 FBO（pool `FBO_POOL_SIZE=5`，mgl:83766，或 render cache），把該批 draped layers（fill/line/background/hillshade/raster；`drapedLayers` mgl:20373，`isDraped` mgl:20437）畫進 tile 貼圖，`useRenderCache && !fbo.dirty` 時跳過（84313-84316）；然後 `renderToBackBuffer` → `drawTerrainRaster`（mgl:83609-83684）每 proxy tile 一次 `program.draw`，網格 `createGrid(GRID_DIM+1)`、`GRID_DIM=128`（mgl:83765, 83864）≈ 16.6k 頂點／33k 三角形 + skirt。pitch 60、z7 約 15–40 proxy tile → 0.5–1.3 M 三角形/幀，vertex shader 逐頂點取樣 DEM 貼圖。相機靜止且無 transition 時（`_shouldDisableRenderCache` mgl:84515-84539 為 false）FBO 走 cache，剩下 terrain mesh draw；一旦有 symbol fade／light transition，cache 停用，draped layers 每幀重畫進 FBO。
- **globe 的關鍵限制**：`class Globe … this.requiresDraping = true`（mgl:44314-44317）；`Map.setTerrain(null)` → `if (!terrain && this.transform.projection.requiresDraping) this.style.setTerrainForDraping()`（mgl:101779-101781）→ `setTerrain({source:"", exaggeration:0}, DrapeRenderMode.deferred)`（mgl:81294-81297）→ mock terrain（`_mockSourceCache`，mgl:83917）→ **draping FBO pass 在 z<6 globe 模式下不會消失**。關 terrain 只省：raster-dem tile 下載／解碼（512 px、maxzoom 14）、`transform.elevation` 查表、elevated mesh 高程取樣、`_updateAverageElevation`。z≥6（mercator 過渡完成，`globeToMercatorTransition = smoothstep(5,6,zoom)` mgl:25844-25846, 22870-22871）時關 terrain 才會整個拿掉 draping——但那正是地形可辨的 zoom。
- 「zoom<某值視覺不可辨」判斷：等距地面解析度 = 40,075,016 m / (512·2^z)：z4 4,892 m/px、z5 2,446、z6 1,223、z7 611。位移像素 = 高度×1.5 / (m/px)：玉山 3,952 m → z5 2.4 px、z6 4.8 px、z7 9.7 px；Everest 8,849 m → z4 2.7 px、z5 5.4 px。pitch 0 時位移完全不可見（只有 hillshade 是獨立 layer）。結論：**z≤4 全球 <3 px、z≤5 台灣 <3 px**。
- 切換代價：`Style.setTerrain`（mgl:81307-81326）→ `delete this.terrain`／`_force3DLayerUpdate`（僅 fill-extrusion `_updateLayer`）／`_markersNeedUpdate`；`Map.setTerrain` → `_update(true)`（mgl:101785 → 102306-102307 `_styleDirty/_sourcesDirty`）→ 下一幀 `style.update(parameters)` + `updateSources`。**不重建 style、不移除 source**；DEM tile 是否留在 SourceCache（`usedForTerrain` 翻轉後）未驗證。
- 更省事的做法：zoom-dependent exaggeration 表達式。`Terrain.update`（mgl:83924-83928）：
  ```js
  this._exaggeration = zoomDependentExaggeration ? this.calculateExaggeration(transform) : terrainProps.get("exaggeration");
  if (!transform.projection.requiresDraping && zoomDependentExaggeration && this._exaggeration === 0) { this._disable(); return; }
  ```
  → `setTerrain({source:"mapbox-dem", exaggeration:["interpolate",["linear"],["zoom"],4.5,0,5.5,1.5]})`，mercator 下 Mapbox 自動關、globe 下自動退化為 draping-only，且線性過渡無 pop。

### C1f customLayer.render 其他每幀開銷

**部分**（真實但量級小）。`src/map/customLayer.ts`：
- `:98-99` `setAltExaggeration/Offset` 每幀寫模組變數（可忽略）。
- `:120` `updateStaticTrails` → `FlightScene.ts:316-319` 每幀建 key 模板字串再比較。
- `:177-180` `setStaticOpacity`（`FlightScene.ts:603-615`：2 uniform 寫入 + `recomputeGlowVisibility` 幾個乘法 + `setGlowHidden` 早退）、`setStaticWidth`（同）、`setGlowIntensity`（已早退）、`setLimbFade`（1 寫入）。
- `:165` `setProgressiveMode`（早退）；`:167` `updateProgressiveVisibility`（`FlightScene.ts:742` |Δt|<1 早退；progressive 模式且時間動時 O(總頂點) 掃描——那是必要成本）。
- `:189` `map.getFreeCameraOptions()` → mgl:76002-76011 `_updateCameraState()`（`setPitchBearing` + `_computeCameraPosition`）+ `new FreeCameraOptions` + `new MercatorCoordinate` → ~1–2 µs + 2 個垃圾物件/幀。
- `:204-220` Far View：`MercatorCoordinate.fromLngLat(map.getCenter())` + 矩陣 fromArray + 2 次投影 ≈ 2 µs（僅 farView）。
- `:224` `timeIndex.getActiveFlights(time)`（`flightIndex.ts:39-55`）每幀 new 陣列並掃 60 s bucket 的全部索引（多機場時 bucket 內可達數百筆）≈ 5–50 µs；暫停時 time 不變卻每幀重掃。
- `:235` `controlSig` 14 段模板字串（含浮點轉字串）≈ 0.5–1 µs + GC；`:108-110` `flightsKey` 同。
- 合計 ~10–70 µs/幀，<0.5% 幀預算；改法：`controlSig` 改逐欄位比較上次值；`getActiveFlights` 對相同 `time` 回傳快取；setter 呼叫前比對上次值（或在 FlightScene 內加早退）。零視覺差異，但**不是**主因，排最後。

---

## 3. 優先順序與理由

排序依「受影響幀數 × 每幀 ms ÷ 工作量」：

1. **C1d 刪 getParameter／還原（S，零視覺）**——每幀 4–8 次 renderer↔GPU process 同步 round-trip，每次都得先 drain 這幀已排的指令，最符合「一頓一頓」症狀；Mapbox `setDirty()` 原始碼保證安全。三個檔案一起改，半小時內完成。
2. **C1b-1 + C1c 成對（M，近零視覺）**——風扇的直接來源：暫停時也 60 fps 重繪整張含 terrain 的地圖。C1c 把呼吸／閃爍搬到 `uTime` shader 後，instance buffer 在暫停+靜止時零上傳，C1b 才能把裝飾動畫降到 20–24 fps（或 N 秒後全 idle）而看不出差別。C1b-2／C1b-3 順手套同一個 timer。
3. **C1a-2 cameraInfo bail-out（S）+ C1a-1 時鐘 10 Hz 發布（M）**——播放／相機移動時每幀 1–3 ms 的 React 整樹 reconciliation；前者 5 行改完，後者需要 hook 擁有 `timeRef` 並直接踢 `triggerRepaint`，順便消掉 KEEP_ALIVE 的「落後一幀」補丁。做完後再評估是否需要 `React.memo`（前提是 App 的 callback 要穩定，目前 `recorder`／inline 箭頭函式每 render 都新的）。
4. **C1e-1 preserveDrawingBuffer=false + render-event 取像（S–M，零視覺）**——省每幀一次全螢幕 copy；要跑一次即時錄製與 HQ 匯出回歸。
5. **C1e-3 terrain zoom-dependent exaggeration（S）**——一行 expression，Mapbox 自動處理；但 globe 下只省 DEM／高程，不省 draping，收益需實測後才知道值不值得列入。
6. **C1f 清理（S）**——<0.5% 幀預算，當作順手的整潔度工作。
7. **C1e-2 antialias（可見取捨）**——唯一會改變畫面的項目；先量 `antialias:false` 的 GPU 幀時間，有 >20% 收益再和使用者討論。

**量測建議**：改動前後各錄一段 DevTools Performance（播放 600× 30 s；暫停靜置 30 s；orbit 30 s 三種情境），對照 Main thread 的 `_render` 時長、React commit 次數、GPU track 佔用；C1d 前後看 `getParameter` 是否從 flame chart 消失。
