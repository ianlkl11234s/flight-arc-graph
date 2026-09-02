# Flight Arc 效能研究報告

## 1. deck.gl TripsLayer GPU 拖尾
讀原始碼確認：時間戳只存 1 float/頂點（`instanceTimestamps`+`vertexOffset`取下一點），vertex shader 內插 `vTime`；fragment shader 用 `currentTime`/`trailLength`/`fadeTrail` **uniform**（非 attribute）做 `discard`+alpha 淡出，**每幀只更新 3 個 float，不重寫 vertex buffer**。頭部位置無內建處理，官方作法是 CPU 算目前座標另疊 IconLayer。無 10 萬級 trips 專屬 benchmark，僅通用「~1M 60fps／10M 10-20fps」。
來源：[trips-layer.ts](https://github.com/visgl/deck.gl/blob/master/modules/geo-layers/src/trips-layer/trips-layer.ts)、[TripsLayer 文件](https://deck.gl/docs/api-reference/geo-layers/trips-layer)
**適用性：需改造**——手法可搬到 Three.js，取代彗尾 CPU 逐幀重寫。

## 2. Mapbox GL JS 效能
| 項目 | 結論 |
|---|---|
| antialias / preserveDrawingBuffer | 官方預設皆 `false`，文件明註「as a performance optimization」|
| triggerRepaint | 官方：custom layer 呼叫會整張地圖重繪；實案 [#8159](https://github.com/mapbox/mapbox-gl-js/issues/8159) 60fps/4%CPU→15fps/40%CPU |
| terrain exaggeration zoom expression | 官方範例支援，但 [#11044](https://github.com/mapbox/mapbox-gl-js/issues/11044) 閃爍 bug 仍 open（2022 後無修復紀錄）|
| globe | 投影切換要換 GLSL variant 重編譯，可能卡幀，官方仍在優化 |
| 閒置持續重繪 | **無官方停止機制**；[#12625](https://github.com/mapbox/mapbox-gl-js/issues/12625) 社群唯一解法是把 `map.triggerRepaint` monkey-patch 成 no-op |

**適用性：triggerRepaint/idle 停繪需改造；antialias/preserveDrawingBuffer 是否可關需人工確認（可能是錄影用）；terrain expression 直接可用但需先驗證版本是否還閃。**

## 3. 閒置動畫降頻
rAF 節流常見作法：累積 timestamp 差值未達門檻就 `return`，但仍持續排下一 rAF。[MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) 官方提供 `document.hidden`/`visibilitychange` 偵測分頁背景。Mapbox 無官方降頻 API，唯一已知手法是第 2 節的 `triggerRepaint` no-op（本質是全停非降頻）。
**適用性：直接可用**——背景分頁全停 + 地圖真靜止時 triggerRepaint no-op。

## 4. 大量線段渲染
Cesium 官方 blog：GL_LINES 在 ANGLE 下 lineWidth 上限固定 1.0、共用頂點不 join、無 geometry shader。業界標準替代是 **instanced quad**（two-triangle/segment，vertex shader 依 start/end+width extrude）：three.js Line2、Cesium PolylineCollection、regl-gpu-lines、deck.gl PathLayer 皆此路線。[wwwtyro.net 案例](https://wwwtyro.net/2019/11/18/instanced-lines.html)：5 線×10 萬點（50 萬點）互動幀率；未找到「數百萬線段 60fps」具體 benchmark，查無不編。判斷 vertex-bound 用 `GL_RASTERIZER_DISCARD`/簡化 fragment 看是否變快（來源：[Finding the Bottleneck](https://paroj.github.io/gltut/apas04.html)）。
**適用性：靜態 1px 軌跡不適用**（換 instanced quad 頂點量更大、無視覺增益）；**彗尾需改造**（instanced quad + shader-side fade 同時解決粗細與 CPU 重寫）。

## 5. 軌跡資料表示
deck.gl 官方：binary attributes 可跳過 CPU-bound 屬性生成直接供 GPU。[Apache Arrow](https://arrow.apache.org/docs/format/Columnar.html) 官方：連續 columnar buffer 利於 cache locality/SIMD，可跨 thread 零複製。[MDN Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) 官方確認 `ArrayBuffer` 用 `postMessage(data,[buffer])` 零複製轉移（非 structured clone），轉移後原 view `byteLength`歸零。
**適用性：直接可用**——Worker 解 NDJSON 成 SoA Float32Array，transferable 丟回主緒，省 parse block 與 GC。

## 6. 一句話
- **Cesium 大量移動實體**：官方 blog 建議避開 Billboard/Label Entity API 逐幀全量更新，改用效率高的 primitive 或按距離 LOD。來源：[Entity API Performance](https://cesium.com/blog/2018/06/21/entity-api-performance/)
- **Three.js WebGPURenderer 無法與 Mapbox 共用 context（已證實）**：官方文件顯示其 constructor **無** `context` 參數（WebGLRenderer 才有）；Mapbox CustomLayerInterface 型別固定 `WebGLRenderingContext`，WebGPU 請求 [#9646](https://github.com/mapbox/mapbox-gl-js/issues/9646) 仍 open 未實作。

## 建議引入順序（零視覺差異高效益 → 結構改造）
1. Worker + SoA Float32Array + Transferable 解碼（§5）——純資料管線，零視覺差異
2. Page Visibility 背景停繪 + 地圖真靜止時 triggerRepaint no-op（§2、3）——直接對應「暫停仍永續重繪」
3. render() 內依互動/動畫狀態節流至 ~20fps（§3）
4. 確認 antialias/preserveDrawingBuffer 是否只錄影時需要（§2）——需與現有 Recording Overlay 對照，非零風險
5. 彗尾改「timestamp attribute + shader currentTime/discard」（§1、4）——效益最大但需重寫渲染管線
6. 靜態 GL_LINES 先測 vertex-bound 再決定要不要換 instanced quad（§4）
7. terrain zoom expression（§2）——先重現 #11044 是否仍閃爍再上
