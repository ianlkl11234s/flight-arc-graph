# Dynamic Viewshed

> Track Single 模式下的動態視域分析（乘客視角可見範圍）。原載於專案 CLAUDE.md，2026-07 外移至此。

## 功能
- **3D 扇形 mesh**（Three.js）：左右舷各 50° FOV，per-vertex alpha 漸層
- **3D 掃描線**（Three.js LineSegments）：從飛機射向地面弧線
- **動態半徑**：根據高度 20→60→120→150km（大氣衰減上限）
- **主題色**：Dark=白、Light=橘、Satellite=金黃
- **可調參數**：View（不透明度 0~2）、Edge（邊緣銳利度 0~1）

## 技術決策
- **用 Three.js 而非 Mapbox GeoJSON**：`source.setData()` 每幀 2-3ms（瓶頸），改用 Float32Array buffer update = 0.01ms
- **depthTest: false**：避免 Mapbox 3D terrain 遮擋扇形

## 新增檔案
- `src/map/viewshedOverlay.ts` — 純計算工具（幾何、半徑、航向，無 Mapbox 依賴）
