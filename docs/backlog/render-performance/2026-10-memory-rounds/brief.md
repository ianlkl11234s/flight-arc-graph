# Flight Arc 效能討論：證據摘要（Round 0）

Repo: /Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art（branch develop，Vite + React 19 + Three.js custom layer on Mapbox GL）
必讀背景：docs/features/trajectory-rendering.md（尤其第三節「被推翻的假設」）、docs/backlog/render-performance-status.md。

## 用戶問題
開很多機場（多機場 set、全球）或很多圖層時風扇狂轉、CPU 飆高；曾疑似記憶體不足導致整台 Mac 重開機。
目標：在**完全不犧牲（或幾乎不犧牲）畫面呈現**的前提下，找出可讓「探索多機場／全球」不大量耗資源的架構方向。
硬性原則：「東西與呈現不能錯」——LOD 只換幾何解析度不換航班集合；Summary 數字不得改變；不得靜默抽掉航班。

## 已被實測推翻（不要再提）
- 地形是瓶頸（setTerrain(null) fps 34→35）
- DPR / MSAA / fill-rate 是瓶頸（DPR2 像素×3.47 fps 只掉 10%，vertex-bound）
- 2026-09 已做：時鐘進 ref + React 10Hz、repaintScheduler（暫停 20fps、30s 閒置停止重繪）、zoom-band LOD（L0/L1/L2）、TrackPath SoA typed array、BatchedTrails min-heap、光球 shader 動畫。world 播放現為 GPU-bound（97–98%）。

## 環境實測（2026-10-04 01:49）
- 機器 Apple M3、24 GB 統一記憶體。**未開 Flight Arc 前**：memory pressure level=2(warn)、swap 23.7/24 GB、free pages ~50–95 MB、compressor 11.5 GB。
- 背景：claude CLI 24 個程序 ~4 GB、Arc ~3.5 GB、agent-browser headless Chrome ~1.4 GB、node ~1.5 GB…
- 推論：重開機的直接機制很可能是 swap 耗盡（系統早已超賣），Flight Arc 是「最後一根稻草」而不一定是唯一原因。**因環境壓力，本輪未能實測 Flight Arc 本身的 heap / GPU RSS。所有 Flight Arc 量級都是靜態估算。**

## 靜態稽核發現（唯讀稽核 agent，附 file:line，請自行驗證）
規模：world 2/18 單日 81,599 班、1,244,810 點；靜態頂點 ≈2.33M；每頂點 attribute 44 B（position12+color12+alpha4+aTRel4+aEcef12）。單機場 L0 ~680 點/班（RCTP 2/18 444K 點）。

1. **[確定，最嚴重] 切底圖 style 時舊 FlightScene / aurora / atlas glow 從不 dispose → CPU + GPU buffer 永久洩漏**
   - dark/light/satellite sprite 不同 → Mapbox diff 遇 `setSprite`（unsupported，mapbox-gl-unminified.js:64488）→ `_updateStyle` 整個重建；`Style._remove()`（:67513）不呼叫 custom layer `onRemove`。
   - `handleMapReady` 用 `map.getLayer("flight-3d")`（App.tsx:1473）在新 style 找不到舊 layer → `flightScene.dispose()`（customLayer.ts:309）永遠不跑。
   - 舊 WebGLRenderer 被 canvas 的 `webglcontextlost` listener 留住（three.module.js:14917），bindingStates 抓著所有 attribute（:1785）。
   - aurora `onRemove`（airspaceAurora.ts:385）本身也沒呼叫 `renderer.dispose()`。
   - 也沒 `detachScheduler` → 每切一次多 5 個 map.on + 1 個 visibilitychange listener。
   - 量級：world 單日每切一次約 CPU 174 MB + GPU 174 MB（統一記憶體都算 RAM），會累積。驗證訊號：console 出現 `Unable to perform style diff: Unimplemented: setSprite`。
   - 注意：visual-check 的 bootstrap 每次都走 light→dark 切換，所以這條路徑每次量測都會觸發。
2. **[確定] 靜態 bucket 上傳 GPU 後仍保留 CPU 陣列**：只有 alphas 會再寫，其餘 40 B/頂點閒置。world ~92 MB；L0 機場組合 ~2M 點 ~160 MB。同一份資料：TrackPath 24 B/點 + 靜態 CPU 88 B/點 + 靜態 GPU 88 B/點 + mercatorCache。
3. **[確定增長] `mercatorCache`（FlightScene.ts:1004）在一份資料集內無上限增長**：每點一個 `[x,y,z,t]` JS 陣列 + ECEF，估 70–100 B/點，僅在 flights reference 改變時清空（customLayer.ts:163）。world 播完一天 ~87–125 MB。
4. **[確定] 全量重建的 2× 峰值窗**：`finalFlights` reference 一變就全量重建（篩航司、機型、換 LOD、起降染色，FlightScene.ts:517–536），舊陣列待 GC 時新陣列已配好，world ~200 MB 暫時峰值；換 LOD 時新舊兩層並存（useFlightData.ts:119–127，設計如此）。
5. **[確定] 資料層**：airport/region/airspace 快取有 LRU + 點數上限（flightLoader.ts:138–176）。world 1.24M 點超過 region 快取上限 500K → 不快取，每回 world 重抓重解析 94 MB（主執行緒串流逐行 JSON.parse，flightLoader.ts:362–375），且日期過濾在 preprocessFlight **之後** → 其他 51 天資料也先建 TrackPath 再丟，GC 波動。
6. **[確定，小] CPU 浪費**：useFlightData.ts:279–285 `filterByAirport` + `getTimeRange`（掃全部點）每 10 Hz 白算且結果未被使用；viewshed rAF（App.tsx:1724）track-single 模式暫停也 60Hz 跑；terminator rAF（terminatorOverlay.ts:130）60Hz 空喚醒；`update()` 播放每幀新建 Set/orbEntries/active 陣列（world 每幀上萬物件 → GC 壓力）。
7. **[確定] 無任何預算**：靜態 mesh、mercatorCache、state 中航班數/點數都沒有上限。光軌上限 16,384 slot（~93 MB×2），光球 8,192。
8. world 單日穩態估（推測）：JS ~400 MB（航班 120 + 靜態 102 + 光軌 72 + cache 100）；GPU ~175 MB。2D 模式 world 會產完整 GeoJSON 複製到 worker（推測很大）。
9. 2026-09-04 之後 94 個 src commit 沒有新增 rAF/interval/每幀工作；起降染色多一個重建觸發點（80ms debounce）。
