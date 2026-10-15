## Round 2 裁決

總結：先明確 teardown 止漏；子集採「共用 indexed 幾何＋保序子集 index」；cache 先緊湊化、不做純 LRU；tile 化列第二階段；ECEF 暫不搬回 shader。

### 互評

採納 Fable 的三點：

- `mercatorCache.pts` 改連續 `Float64Array`，比我提的純 LRU 更適合 seek。
- 子集以 index buffer 控制實際 draw 量。
- 日期前置過濾＋Worker/columnar loader，能消除主執行緒 JSON/GC 峰值。

但有三個高估／風險：

- **1a 過度宣稱解掉全量重建。** 單例只避免 renderer、光軌池重建；篩選／換資料後 `FlightScene.ts:510-535` 仍會刪除並重建整份 static geometry。`App.tsx:1614-1620` 的確多做 layer 重建，但不是唯一成本。
- **`onUpload` 後直接丟 `.array` 不是低風險。** Three 在重新建 GPU buffer 時仍讀 `attribute.array`，且更新會取 `.byteLength`（`node_modules/three/src/renderers/webgl/WebGLAttributes.js:5-16,202-210`）；context restore 必須有明確重建來源，不能只設 null。
- **3c 收益高估。** ±12h 掃描目前已是一秒一次，不是每幀（`customLayer.ts:169-193`）；若起迄時間做普通 attribute，反而增加約 8 B/頂點。先修真正的每幀配置較划算。

我方也修正：indexed `GL_LINES` 以現有 44 B attribute 計算應約 **64 MB**，不是 Round 1 寫的 59 MB。

### 分歧裁決

a. **兩者並用，Fable 在子集策略上勝。** 建立共用、不重建的 indexed `GL_LINES` 頂點庫；篩航司／機型只重建 index。alpha 留給 ±12h 等高頻增量切換。world 已 GPU-bound，純 alpha 隱藏仍跑 vertex shader。Light theme 的 index 必須嚴格保留原始 segment 順序；不能按 tile 分 draw，否則 NormalBlending 會變（`FlightScene.ts:390-401`）。

b. **先用緊湊全量 cache。** Cache 只由 active 動態光軌讀取（`FlightScene.ts:1069-1125`）；光球只間接取 trail head，static build另算（`:687-704`）。seek 到未造訪時段會同步 miss。純 LRU 會把轉 Mercator＋ECEF 尖峰放在拖曳當下；採 `Float64Array`＋ECEF、以資料集／LOD硬上限治理。LRU 僅在實測超預算後，加 active±預取窗 pinning。

c. **先 1b，後評估 1a。** `setStyle` 前 registry 明確 remove/dispose 最小、可驗證；Aurora 補 `renderer.dispose()`（`airspaceAurora.ts:385-403`）。單例可降低 `App.tsx:1614-1620` 的 renderer churn，但不消除 static rebuild。Globe/Mercator 每幀由 `setGlobe` 更新且 render 前有 `resetState()`（`customLayer.ts:229-244`; `FlightScene.ts:1158-1167`），style 本身不是主要衝突；真正風險是 context loss、GL 更換與最終 destroy ownership。

d. **tile 化保留，優先級 P2。** world 目前僅 1.245M 點、static 約102 MB；全球視角至多逐出背面／視錐外約 40–60%，而 dark 已有桶剔除，GPU 收益有限。多機場 L0 若達2M點／約176 MB static，近景只駐留約10–25%才可能省百 MB 級。應在 leak、緊湊化、indexed 完成後做 metadata/geometry 分離；Light theme 須用單一保序 index，不能任意 tile draw。

e. **ECEF 保留預存。** 搬回 shader 每頂點增加 `exp/atan/sin/cos`（`globeProject.ts:29-51,118-137`），正好打擊 GPU-bound／vertex-bound 場景。12 B 節省須先 A/B 證明；較合理是另做 Mercator-only shader variant。

### 修正後 Top 6

1. style 前 registry teardown＋Aurora dispose＋listener 對稱解除；零視覺；切10次看 heap/live buffer/listener 斜率。
2. 刪 `useFlightData.ts:278-284` 未使用全掃，暫停時停 viewshed/terminator 空喚醒；零視覺；`ab-run perFrame.script`＋rAF計數。
3. cache 改緊湊 typed arrays；零視覺；retained heap、seek P95、cache miss。
4. immutable static CPU backing 上傳後釋放並補 context-restore 重建；零視覺；heap＋強制 context loss。
5. indexed `GL_LINES`＋保序子集 index；零視覺目標；light/dark逐像素、GPU frame、upload bytes。
6. 日期前置過濾＋Worker/columnar；零視覺；flight-id/hash、Summary、載入主執行緒長任務。

本輪僅靜態唯讀佐證，未做 runtime 驗證。