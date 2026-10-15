# Round 3 — Fable（定案）

## 1. 剩餘分歧定案

**a. CPU 陣列與 context restore——採納 Codex，修正我 R2。**
證據：Mapbox `_contextRestored`（unminified.js:88681–88692）只重建 Painter（`getContext('webgl2')` 回同一 gl 物件）、`clearLayers()` 只呼叫空的 `StyleLayer._clear`（:13373），**不經 custom layer onRemove/onAdd**；three `onContextRestore`（three.module.js:15349）→`initGLContext()` 清空 WebGLAttributes WeakMap，下次 render 走 `createBuffer` 讀 `attribute.array.byteLength`（WebGLAttributes.js:5–12）→ `.array=null` 必 TypeError。
設計：
- 不變式「`.array` 已丟的 attribute 必須在下一次 render() 前 dispose」。`customLayer.onAdd` 掛 `map.on('webglcontextrestored')`（Mapbox 在 :88692 fire；onRemove 拆）；handler 只做 `removeStaticMeshes()`＋清 `lastStaticKey/lastStaticFlights/staticBuildState`＋`trailEpoch++`。下一幀 `updateStaticTrails` 從 **TrackPath＋配色**重建（真正來源）；BatchedTrails／InstancedOrbs 保有 CPU 陣列，three 自行重傳。handler 不 render，與 canvas 兩個 listener 註冊順序無關。
- 重建來源不是 bucket 陣列 → Phase 1 **position/color/ecef/aTRel 四個全丟、只留 alpha**（R2 說留 position/ecef，撤回）；Phase 2 再把 position/ecef 的 `.array` 重新保留並升格為 store（共用同一塊，不是另一份），color/aTRel 繼續丟，restore 不變式照舊成立。丟的時機：`staticBuildState` 歸 null 那幀才用 `attr.onUpload` 掛一次性 callback（progressive 期間每幀 updateBuffer 都觸發 callback，不能早掛）。
- 揭露行為差異：今天 altExag 變更 cache 立即失效、static debounce 80–300 ms；單一來源後光軌與 static 同步延遲。只在拖 slider 期間，穩態一致。

**b. per-point store——可行，條件如下。**
- 前提 indexed：非 indexed 桶每點重複兩次，offset 映射 `start+2i−1` 不乾淨；indexed 後點 i 在 `pointStart+i`。
- offset 在既有計數 pass（FlightScene.ts:521–533）預先分配為 **store 全域** `{pointStart,pointCount}`（不再是 :671 的 bucket-local）→ progressive 中先活躍的航班 `ensurePoints(f)` 按需補填 xyz/ecef（bitset 標記，builder 跳過）；light 單桶在全域 offset 下不是特例；2D 無桶時同一 store 懶填（24 B/點取代 cache ~92 B/點）。
- 精度：`writeTrail` 本體頂點 `writeVert(v,p[0..2])` 直存 Float32，與桶的 `Float32(toMercator())` 同值 → **本體 bit-identical**；只有 head/tail 插值兩頂點（含光球位置）改從 Float32 端點插值，差 ≤1 ulp≈2.4 m。現有 6 場景最高 z10.4（1 px≈58 m）測不出，**須新增 z15 場景**；FAIL 則 fallback Float64 xyz（+12 B/點）。t 讀 `TrackPath.t()`（Uint32，與今 `pts[i][3]` 同值）。
- store＝靜態 attribute 的 CPU 側：xyz 12＋ecef 12＋alpha 4＝28 B/點（W 35 MB、A 56 MB）；color/aTRel 上傳後丟。

**c. 細桶 vs tile——共同閘門。**
- 便宜版：維持 30°×45° 桶 geometry；dark 的 index 自 Phase 2-1 起就依 `(5° 子格, 航班序)` 排序；mercator 模式（transition≥1）每幀用子格 mercator AABB（＋高度 pad＝maxAlt×exag，<1 格）對 `getBounds()` 保守相交，可見子格連續段寫成 `geometry.groups`。three 只在 `material` 為陣列時依 groups 拆 draw（`projectObject`，three.module.js:16072–16074）→ `mesh.material=[staticMat]`。draw call＝可見 run 數，不是 2,592。light 保持航班序、不剔除（NormalBlending 順序相依，Codex :390–401 正確）。高 pitch 時 bounds 近全域，收益歸零但不錯。globe 維持桶 cap 剔除。
- tile 獨有收益只剩**常駐記憶體與載入時間**（GPU 已由剔除覆蓋）。閘門（Phase 2 完成後量）：G1 apac L0 或多日 world 穩態 renderer phys_footprint >1.0 GB、或 GPU process footprint 增量 >600 MB；G2 worker 化後最大集合 time-to-first-frame >8 s；G3 需求擴到 ≥7 日 world（≈8.7M 點，static GPU≈450 MB）。任一命中才做 3-2/3-3。

## 2. 路線圖
情境 W＝world 2/18（P 1.245M 點、V 2.33M 頂點、S 1.163M 段）；A＝apac set L0 z>9.5（P≈2.0M、V≈4.0M）。零視覺＝visual-check pctOver8<0.15% 不成塊＋summary-snapshot 同。

| # | 做什麼／改哪 | 零視覺 | 效益（算式） | 驗收 | 量 |
|---|---|---|---|---|---|
| 0 | 量測前提（§3） | — | 定 Phase 1/2 優先序 | — | 小 |
| 1-1 | setStyle 前 removeLayer 三層（MapView.tsx:349/365）＋aurora `renderer.dispose()`（airspaceAurora.ts:402）＋App.tsx:1544 `move` 對稱 off＋detachScheduler | 是 | 每切一次 W −(102 CPU＋102 GPU＋cache≤115)≈−300 MB；A≈−530 MB | T-A | 小 |
| 1-2 | 四不可變陣列上傳後丟＋restore handler（§1a） | 是 | W −V×40 B＝−93 MB；A −160 MB | T-B＋visual 6 | 中 |
| 1-3 | 刪 useFlightData.ts:278–284 白算；viewshed（App.tsx:1724）／terminator（terminatorOverlay.ts:130）rAF 暫停不跑 | 是 | 10 Hz O(N) 掃歸零 | ab-run `perFrame.script` 不升 | 小 |
| 2-1 | indexed GL_LINES＋共用 store＋每桶 index＋子集只重寫 index 前綴＋`setDrawRange`（篩航司/機型/track-single/日期窗）；App 加「基礎集／可見集」API（App.tsx:978/1195/1615） | 是（值無損；light 單 index 保序） | GPU W 102→P×44＋S×8＝64 MB（−37%）、A 176→104 MB；vertex 呼叫 −45%；篩選今日 W 全量重建 233 幀（V/VERTS_PER_FRAME 10,000）≈4 s@60fps＋2× 峰值 → index 重寫 9.3 MB／≈10 ms、bufferData＝0 | visual 6＋T-C＋T-D＋summary | 大 |
| 2-2 | store 取代 mercatorCache（§1b）；刪 FlightScene.ts:981–1001 | 本體同值；head/tail ≤1 ulp | W cache −115＋store +30＝−85 MB；A −136 MB；seek 尖峰（最壞 7,866×40 點重算）歸零 | T-E＋z15 場景 | 中 |
| 2-3 | DatasetGeneration 原子交換＋預算（超額等待、不抽航班）＋Worker 解析＋日期前置過濾（flightLoader.ts:362–375、useFlightData.ts:119–127） | 是 | W 94 MB JSON 離主執行緒；峰值≤1 集合＋1 LOD 層 | T-G＋summary fr24 hash | 中大 |
| 2-4 | 1a：FlightScene 單例＋closure 狀態上提（customLayer.ts:157–163）；審 App.tsx:1615 effect | 是 | 同集合 re-add 零重建（省 W 233 幀／A 400 幀建構） | re-add 時 bufferData＝0、`isStaticBuilding()` 不翻 | 中 |
| 3-1 | 子格 AABB 剔除＋groups（§1c） | 是（保守） | A z>9.5 可見 ≤9 格／5°，估畫 10–25% 點 → 頂點工作 −75–90%；W globe≈0 | T-F＋ab-run s2 GPU busy | 中 |
| 3-2/3-3 | metadata／幾何分離 → 10° tile（含 L0/L1/L2，PMTiles） | 否（捲入視野短暫 L2→L0） | 常駐降至視野內 | 閘門 G1–G3 | 大 |

新增測試：
- **T-A 切 style 階梯**：CDP 交替 light/dark ×10，每次等 `isStyleLoaded && !isStaticBuilding && areTilesLoaded` → `HeapProfiler.collectGarbage` → 記 renderer phys_footprint、`DOMDebugger.getEventListeners(canvas)` 的 `webglcontextlost` 數、`map._listeners.move.length`、GPU process footprint。通過：footprint 斜率 ≤10 MB/次、listener 數常數。
- **T-B context loss**：場景穩定後 eval `gl.getExtension('WEBGL_lose_context').loseContext()`，500 ms 後 `restoreContext()`，等 waitStable（含 areTilesLoaded）→ 與同場景 baseline 比。通過：pctOver8<0.15%、console 無 TypeError、restore 後 bufferData 次數≈初次建構。
- **T-C 子集等價**：改動前對「篩航司 X」拍 baseline（舊全量重建路徑）；改動後同篩選 compare。通過：pctOver8＝0（期望）、summary 同、篩選期間 DEV `bufferData`＝0。
- **T-D 上傳位元組**：customLayer.ts:31–45 計數器加累計 bytes。通過：W indexed 後 ≤70 MB。
- **T-E 光軌等價**：固定 20 個 seek 時刻 dump `lastOrbEntries` 前後比。通過：max|Δ|≤6e-8（1 ulp）；新 `s3-rctp-z15-dark` pctOver8<0.15%。
- **T-F 剔除開關**：同相機 cull on/off 各截一張。通過：逐像素 0 差。
- **T-G 換集合峰值**：切 20 次機場組合，100 ms 取樣 footprint。通過：峰值 ≤ 穩態＋1 個集合。

## 3. Phase 0 量測清單
先堵漏洞：靜態桶／cache／TrackPath 全是 TypedArray，backing store 是 V8 external memory，`performance.memory.usedJSHeapSize`（scenario.mjs:6）與 CDP `JSHeapUsedSize` **可能不含**。第一步分配 200 MB Float32Array 看數字動不動；不動就改量 renderer pid 的 phys_footprint（`footprint`／`vmmap --summary`；`ps rss` 不含 Metal/IOSurface 會低估）或 heap snapshot 的 `JSArrayBufferData`。`sys-sample.mjs` 目前只有 cpuTime，GPU process footprint 要新增。

| 量什麼 | 程序 | 若量到… → 推翻 |
|---|---|---|
| 空 tab／載 W 穩態／播完一天：renderer footprint、GPU process footprint、`renderer.info.memory`、heap snapshot 分類（桶／cache／TrackPath／loader LRU） | renderer＋GPU | W 穩態 <300 MB 且峰值 <500 MB → 記憶體不是重開機主因（swap 超賣），2-2/2-3 降級；GPU busy（風扇）主導 → 2-1、3-1 前移 |
| T-A 階梯斜率 | 同上 | 斜率≈0（Chromium 自行回收）→ 1-1 降為衛生項 |
| A（S2-L0）：`perFrame.script` vs GPU busy（cdp-trace＋ioreg） | renderer | script 主導 → 先修 `update()` 每幀配置與 writeTrail，3-1 降級；GPU 主導 → 3-1 前移 |
| GPU process footprint 對 ~175 MB 估算 | GPU | ≫（>600 MB）→ Mapbox 側（terrain/tile/MSAA）主導，2-1 收益縮水，先量 terrain off／DPR1 |
| W 載入主執行緒 long tasks＋GC 尖峰 | renderer trace | >1 s → 2-3 升入 Phase 1 |
| 2D world GeoJSON（staticTrails.ts:186）大小與 worker heap | renderer＋worker | >300 MB → 2D 路徑另立項 |

## 4. 未共識
1. **store 精度**：我方 Float32（本體 bit-identical、僅兩個插值頂點 ≤2.4 m，z15 場景驗）；Codex Float64。差 12 B/點（W 15 MB）。
2. **過渡期緊湊 cache（Codex）**：我方不做——2-2 整個換掉，是丟棄工；除非 2-1 延誤 >2 週。
3. 其餘（1b 先、ECEF 留、tile 閘門、indexed 子集）已一致。
