# Color Theme System

> 可自訂所有 3D/2D 渲染元素的配色。原載於專案 CLAUDE.md，2026-07 外移至此。

## 功能
- **6 組 Preset**：Default、Warm、Ocean、Neon、Mono、Sunset
- **即時微調**：每個顏色都有 color picker，改色即時反映到地圖
- **多色停漸層**：靜態軌跡支援 2~5 個色停（低空 → 中空 → 高空）
- **localStorage 持久化**：選擇的主題會記住

## 可調整元素
| 元素 | 說明 |
|------|------|
| Trails (×5) | 動態光軌 5 色（Additive Blending） |
| Static Gradient | 靜態軌跡高度漸層（多色停） |
| Orb | 光球 glow 色 |
| 2D Map (×2) | Mapbox 2D 軌跡漸層（A→B） |

## 新增檔案
- `src/types/colorTheme.ts` — ColorTheme interface + 6 組 preset 定義

## 技術細節
- `FlightScene.setColorTheme(theme)` — 更新所有 Three.js material
- `setMapTrailColors(hexA, hexB)` — 更新 Mapbox 2D 軌跡色
- Preset 選擇清除 override，微調產生 override 覆蓋 preset
- 暗色主題用自訂 theme，亮色主題維持固定配色
