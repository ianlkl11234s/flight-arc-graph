# Round 2 — Fable

## 1. 對 Codex 提案的評論

**錯誤／高估**
- B2「全集常駐＋alpha 隱藏 filter」：world 是 vertex-bound（DPR×3.47 只掉 10%），alpha=0 的頂點照跑 vertex shader＋光柵化，`staticTrail.frag` 末段才 `discard`。篩航司後 GPU 成本不隨子集縮小，等於拿 CPU 峰值換 GPU 常數稅。
- B1「mercatorCache 改 LRU」：唯一消費者是 `update()`→`writeTrail(cache.pts, cache.ecef)`（FlightScene.ts:1114），播放中每幀對每班活躍航班查一次。預算＜活躍集點數→每幀重算；預算≥活躍集，L0 情境（apac 千餘班×680 點）與「以資料集為界」差不多；world seek 最壞重算 7,866×40≈31 萬點（~20–30 ms 尖峰）。真正問題是 JS 小陣列膨脹 3×＋與靜態桶算兩份，不是無界。
- indexed 估算用 40 B/點，實際 44（FlightScene.ts:567–572）→ world ≈64 MB，非 59。
- 「context restore」當差異點：Mapbox 有 `_contextRestored`（unminified.js:88680），兩方案都碰到，1a 的 gl identity 分支即可覆蓋。

**採納**
- **indexed GL_LINES（頭號好點子）**：build 迴圈三種配色分支裡，共用點 i 在相鄰兩段的 color／alpha／aTRel／ECEF 完全相同（:690–748），索引化數值無損；vertex 呼叫 2.33M→~1.25M（−45%，靠 post-transform cache，實測為準）、GPU bytes 102→64 MB（−37%）、CPU build 減半。
- `DatasetGeneration` 原子交換＋超額等待／提示，併入我的 2a。
- 驗收指標「全量 bufferData＝0」，DEV 計數器已在（customLayer.ts:31–45）。
- 重複 listener：精確位置是 `map.on("move", updateCamera)`（App.tsx:1544），每次 handleMapReady 都加；click（:1550）與 :1611 在 `clickBoundRef` 內只掛一次。

## 2. 裁決

**a. 併用。** Codex 的 indexed GL_LINES 當本體，子集＝只重寫索引前綴＋`setDrawRange`（預配滿容量 Uint32，不每次 `setIndex` 新 attribute，免舊 index buffer 等 GC）。順序不是決勝點：light theme 全進桶 0（:399），索引序＝子集序＝從子集重建的序，alpha 隱藏也保序；決勝點是 vertex-bound。alpha 留給 ±12h 時間窗（每秒增量）與起降旗標 3。順帶覆蓋 track-single（App.tsx:836–838 篩到 1 班，退出時今天要全量重建）與日期窗篩選，兩者都是子集。兩個前提：(1) layer 只看到 `getFlights()`＝`finalFlights`（App.tsx:978、:1195），要加「基礎集／可見集」兩層 API；(2) 換 LOD 是新資料集不是子集，2× 峰值要靠 generation 限制 staging 才消失。

**b. 緊湊化／單一 owner，不要 LRU。** indexed 之後靜態桶的 per-point position＋ECEF 就是這份 cache：3D 讓 trails 經 `staticFlightRanges` offset 直接讀桶→cache 歸零（world −110 MB）、無 seek 尖峰。條件：2D 無桶（:479 提早 return）仍需緊湊 SoA；progressive 建構中航班可能先活躍→按需補填該 range；時間絕不存 Float32（T0-5 教訓）→直接讀 `TrackPath.t()`。xy 若隨桶改 Float32，光軌有 ≤1 ulp（~2.4 m）位移，z≥15 場景沒驗證前不算零視覺——保守版 xy 留 Float64（32 B/點，−65%）。

**c. 先 1b、再 1a。** `MapView.tsx:359–364` 註解本身證明 diff 成功會走 `onRemove`；洩漏只在 diff 失敗／`diff:false` 兩個呼叫點（:349、:365）。1b＝setStyle 前 removeLayer 三層＋aurora `renderer.dispose()`＋:1544 對稱解除，半天可驗。1a 我 R1 漏了：單例 FlightScene 不夠，`createFlightLayer` 閉包的 `lastFlightsRef`／`timeIndex`／`lastScanBucket` 每 layer 一份，re-add 必走 `flights !== lastFlightsRef`→`invalidateMercatorCache()`（customLayer.ts:157–163），閉包狀態要一起上提，DEV patch 也要防重包。做對後 App.tsx:1615 的 re-add 在 flights 參考未變時變 no-op；但 track-single／換機場本身就改了集合（:836），那段重建不是 1a 能省的，歸 a 的子集索引（track-single）或新資料集（換機場）。GL 衝突：render 每幀 `resetState()`，globe/mercator 由每幀 `setGlobe` 餵矩陣，無跨 style 狀態；但 dark↔light 仍 `setTheme`→`forceRebuildStatic`（:257–304），1a 省的是 renderer 重建與同集合 re-add 的 cache／trail epoch 重置，不省換色重建。

**d. tile 化進 Phase 3，低優先、閘門式。** world 播放 GPU 約一半是光球（7,866×240≈1.9M 頂點，render-performance-status.md），靜態軌跡任何手段上限 −50%；全球視角已有背半球剔除，tile 對 world ≈0。受益者是多機場 L0 z>9.5：桶 30°×45°（:96–97）、`frustumCulled=false`（:590）、剔除只在 globe＋dark，拉近 RCTP 時同桶（RJTT／RKSI 等）數百萬頂點照畫（apac L0 共 5M）。便宜替代＝細桶（5°）＋mercator 模式視錐測試，純 render 端零格式變更，拿到 tile 的 GPU 收益；tile 獨有的只剩常駐記憶體，且 pan 進視野的補載延遲違反「畫面就緒後不變」。閘門：indexed＋細桶後量 S2-L0 仍超預算才做。

**e. 留。** 我 R1 說錯：trajectory-rendering.md:72 寫明預存是把 shader 每幀 exp/atan/sin/cos 搬到 CPU 一次，是 GPU 端節省，GPU-bound 更該留。12 B 只是 fetch 頻寬（world 28 MB/幀≈1.7 GB/s）；mercator 模式 early return 不用但會 fetch，皆可忽略。indexed 後 ECEF 總量自然 28→15 MB，CPU 副本依 b 當 trails 單一來源。問題消解。

## 3. 修正後 Top 6

1. **止血 1b**：setStyle 前 removeLayer 三層＋aurora dispose＋:1544 解除。零視覺。驗收：交替切 10 次、GC 後 heap 與 canvas `webglcontextlost` listener 斜率 0。
2. **丟 color／aTRel CPU 副本＋刪死 CPU**：`onUpload` 只丟這兩個 `.array`（16 B/頂點，world −37 MB；position／ecef 留給第 4 項當來源，alpha 留）；刪 useFlightData.ts:278–284 白算、viewshed rAF 暫停不跑。零視覺。驗收：world heap −37 MB、ab-run script 不升。
3. **indexed GL_LINES＋子集索引**：篩航司／機型／track-single／日期窗只重寫索引前綴。零視覺（值無損）。驗收：visual-check 6 場景＋light 場景、summary hash 同、全量 bufferData=0、world GPU busy 降。
4. **cache 單一 owner**：第 3 項後 position＋ecef CPU 副本已是 per-point（1.245M×24 B≈30 MB），3D trails 直接讀它、2D 用同格式緊湊 SoA、t 讀 TrackPath → 刪 mercatorCache。衍生資料 world 淨值 ~203→30 MB。xy Float64 零視覺；Float32 需 z≥15 場景。驗收：world 播完一天 heap 淨 −170 MB（含第 2 項）、seek P95 不升。
5. **1a 單例＋閉包上提＋審 App.tsx:1615 effect**。零視覺。驗收：切 style、以及 flights 參考未變的 layer re-add 時 bufferData=0、`isStaticBuilding()` 不翻 true。
6. **DatasetGeneration 預算器＋worker 解析＋日期前置過濾**：超額等待不抽航班、換 LOD staging 受限。零視覺。驗收：切 20 次機場／LOD 的 peak heap 有上限、summary 同。

Phase 3（閘門後）：細桶視錐剔除 → 3a metadata／幾何分離 → tile。
