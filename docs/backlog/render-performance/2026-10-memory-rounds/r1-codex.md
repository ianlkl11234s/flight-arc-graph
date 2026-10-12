## Round 1

### A. 驗證

1. **切底圖洩漏：成立。**  
完整路徑是 [MapView.tsx:345](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/map/MapView.tsx:345) `setStyle()` → Mapbox diff 產生 `setSprite`，但該操作不在支援清單（`node_modules/mapbox-gl/dist/mapbox-gl-unminified.js:64463-64490`），於 `65761-65777` 先拋錯，再走 `_updateStyle()`；其呼叫的 `Style._remove()`（`67513-67547`）**沒有逐層呼叫 `onRemove`**。Pure Black 關閉更直接以 `{diff:false}` 進此路徑（[MapView.tsx:360](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/map/MapView.tsx:360)）。新 style 的 `style.load` 再呼叫 `handleMapReady`，此時 `map.getLayer("flight-3d")` 查不到舊 style 的 layer，直接建立新 scene（[App.tsx:1472](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/App.tsx:1472)、[MapView.tsx:301](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/map/MapView.tsx:301)）。

反證邊界：一般資料／模式切換會先 `removeLayer`（[App.tsx:1614](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/App.tsx:1614)），這時確實會進 [customLayer.ts:306](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/map/customLayer.ts:306) 並完整 `FlightScene.dispose()`；但 style fallback 不會。Three renderer 的 canvas listener 只有 `renderer.dispose()` 才移除（`three.module.js:14917,15311-15325`）。Aurora 即使正常 `onRemove` 也只把 renderer 設 null、沒 `renderer.dispose()`（[airspaceAurora.ts:385](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/map/airspaceAurora.ts:385)）。另外每次 `handleMapReady` 都新增未解除的 `move` listener（[App.tsx:1523](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/App.tsx:1523)）。

2. **靜態 bucket CPU 陣列保留：成立。**  
每頂點配置 position 12 + color 12 + alpha 4 + timestamp 4 + ECEF 12＝44 B（[FlightScene.ts:567](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/three/FlightScene.ts:567)），且 bucket、BufferAttribute 都持有陣列（`594-606`）。建構後只有 alpha 在時間窗／模式切換時改寫（`892-960`）；其他 40 B 閒置。world 約 2.326M 頂點，因此可釋放 `2.326M×40≈93 MB` CPU；完整 CPU/GPU 鏡射各約 102 MB。

3. **`mercatorCache`：成立，但生命週期是「單一 FlightScene／資料 reference」而非永久全站。**  
每班首次活躍建立 JS `[x,y,z,t][]` 與 12 B/點 ECEF，之後不逐出（[FlightScene.ts:981](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/three/FlightScene.ts:981)）。只有 flights reference、高度參數變動或正常 dispose 才清空（[customLayer.ts:147](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/map/customLayer.ts:147)、[FlightScene.ts:1181](/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/src/three/FlightScene.ts:1181)）。全日 1.245M 點按 70–100 B/點約 87–125 MB；style 洩漏會讓舊 cache 一併留下。

### B. 架構方向

以下 `G`＝既有 visual-check、summary-snapshot、ab-run。

**1. 止血**

- Style 切換前由單一 overlay registry 明確 `removeLayer/dispose`，Aurora 補 `renderer.dispose()`，camera listener 對稱解除。效益：每次切換避免至少約 100 MB CPU＋100 MB GPU 靜態資料，再加 cache／動態 buffer；零畫面差異。風險是重複 dispose。驗收：G＋「切換 10 次、每次等待 build 完成並 GC」；heap 與 GL `create/deleteBuffer` live count不得呈階梯。
- 靜態 immutable attributes 上傳完成後釋放 CPU backing，只保留 alpha；`mercatorCache` 改點數預算 LRU，保留活躍航班與短期預取。效益約 93 MB＋把 cache 從 87–125 MB 壓至設定上限；重算結果相同，零視覺差異。風險是 context restore、快速 seek 重算尖峰。驗收：G＋cache hit/miss、點數、seek P95、context-loss 重建測試。

**2. 結構**

- 建立統一 `DatasetGeneration` ownership 與 CPU/GPU point budget；載入、scene、loader cache、staging 都由 generation 原子交換，舊 generation 先釋放或嚴格限制 staging。效益：換資料峰值由約 2× 限為固定預算。超額時等待／提示，絕不抽航班；只改載入延遲。驗收：切 20 個機場／LOD／filter 的 peak heap、live buffer、Summary。
- JSONL 改版本化 columnar binary，worker 內解碼、unwrap、Mercator/ECEF，Transferable 移交。可消除主執行緒約 `1.245M×~60 B≈75 MB` 的 tuple 暫態及 JSON GC；數值格式保持 Float64/Float32/Uint32，畫面不變。風險是版本、abort、fallback。驗收：全 flight-id、typed-array byte/hash round-trip＋G。
- static geometry 以全集常駐，filter／配色走 flight-range alpha或查表，不再因 `finalFlights` reference 全量重建。效益：移除約 100 MB 新舊 buffer 重疊與 O(points) 重建。風險是 blending/order。驗收：filter 矩陣逐像素、Summary、全量 buffer upload 次數應為零。

**3. 規模化**

- 日期×LOD×空間 chunk，metadata/統計與 geometry 分離；viewport＋margin 預取，GPU chunk LRU 受預算控制，跨 tile segment 指定唯一 owner 防重繪。畫面就緒後不變；若預取未完成，只能延後原子切換或明示 loading，不能顯示缺線。驗收：全球快速 pan/zoom/seek 的 seam、缺線、resident bytes、Summary。
- 靜態軌跡改 indexed `GL_LINES`：點屬性只存一次，segment 只存兩個 index。world 約可由 `2.326M×44≈102 MB` 降至 `1.245M×40 + 1.163M×8≈59 MB`，約省 42%，且保持相同頂點值與繪製順序，理論零差異。風險是 Three/WebGL binding、順序與 context restore。驗收：六場景逐像素、buffer byte 計數、GPU frame time。

### C. 最該先實測的三題

1. 各 style pair／Pure Black 連切 10 次後，post-GC heap、live GL buffer、listener 數的實際斜率是多少？
2. world 播完整天後，retained heap 中 static attributes、`mercatorCache`、TrackPath、loader LRU 各占多少？
3. 修 leak 後，world 的首要限制究竟是 static vertex bandwidth、dynamic trails，還是 decode／GC；indexed prototype 與 bounded cache 的 frame P95、seek hitch 是否值得全面改造？

本輪僅做靜態唯讀驗證，未執行 runtime／browser 測試。

