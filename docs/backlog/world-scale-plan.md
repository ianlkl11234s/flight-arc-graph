# 全世界機場軌跡 — 規模化規劃

> 2026-07-11 效能研究產出，同日已完成大部分實作（見下方勾選狀態）。
> 目標：全世界機場軌跡（現 manifest 51,430 筆 / 1,594 座）在不犧牲畫面的前提下順跑。

## 已完成（2026-07-11 session，與效能快贏一併實作）

### ✅ 1. Build-time LOD 分層
`split-tracks.ts` 的 `regions/*.jsonl` 升級為 LOD tier（DP epsilon 2km + 硬上限 40 點/航班，epsilon ×1.5 遞增達標；起迄點必留），新增 `regions/all.jsonl` 全球聯集檔。
- 成果：平均 628.8 → 18.1 點/航班（~35×）；世界視角載入從 ~1GB 全解析度合併 → 15.75MB gzip 單檔。
- `flightLoader.ts` 依 scope 選層：region/world/all 先讀 LOD（缺檔 graceful fallback 舊路徑）；單機場維持全解析度。
- `pull-from-s3.sh` region 迴圈已補 `all`。⚠️ **S3 還沒上傳新 LOD 檔**，部署前要跑 upload script。

### ✅ 2. 分區塊渲染 + 可見性剔除
`FlightScene.ts` 靜態軌跡按經度 30°×緯度 45° 網格分桶（航班依 path 中點歸桶、整條不切割），每桶預存 ECEF 方向 cap，globe 模式下整桶在地平線背面 → `mesh.visible=false`。全球視角估省 30-50% vertex 量。
- Light theme（NormalBlending 混色依繪製順序）自動退回單桶不剔除，保零畫面差異；dark theme（additive）才啟用。

### ✅ 3. LRU 快取治理
`airportCache` 上限 50 座、`regionCache` 上限 6 個，insertion-order LRU。

## 待做

### 4. Region 定義收斂（前置債，refactoring-roadmap Phase 2）

Region 定義現有**四套**互相不一致的 hardcode（`App.tsx` REGION_CONFIG / `IconRailSidebar.tsx` REGION_ICAO_MATCH / `flightLoader.ts` REGION_PREFIXES / `useFlightData.ts` 進度條用表），權威分類其實是 `split-tracks.ts getRegion()`（第五套）。CN 曾在其中三套缺席。世界分頁要加細分區（EU/SEA/Oceania…）前，必須先收斂成一套 single source of truth，否則每加一區要改 4+ 處。

## Airspace（空域快照）全球化 — 結論：暫緩

調查結論（2026-07-11）：
- 現有三個 collector（sibling 專案 `data-collectors`）都是台灣周邊固定 bbox 的設計，沒有全球掃描邏輯。
- 非官方 FR24 端點已有 IP 被封前科（2026-05-04 起停擺）；擴大規模風險只增不減。
- 官方 FR24 帳號額度僅剩 ~8K credits，Top-1000 軌跡戰役都在等回補。
- 「fuse → 按日拆檔 → 上傳 S3」目前是一次性手動流程（僅 2026-03-05~03-10 六天資料），沒有持續管線。

要全球化需要：重寫抓取策略（多 bbox 拼接或 OpenSky 全球查詢 + OAuth2 額度）、建立全球版成本模型、把拆檔流程做成持續管線。屬多週期基建專案，等軌跡戰役收尾、額度回補後再評估。
