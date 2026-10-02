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

## 起降染色（2026-10，§7）
工具列「染色：高度｜起降」。高度 = 上面的主題高度漸層（預設，行為不變）；起降 = 依「選定的機場」上色：

| 航班 | 顏色 |
|------|------|
| dest ∈ 選定、origin ∉ | 進場色 `TRAJ.arr`（暗 `#5fb4ff`／淡 `#1f6fbf`） |
| origin ∈ 選定、dest ∉ | 離場色 `TRAJ.dep`（暗 `#ff9b55`／淡 `#c4561b`） |
| 兩端都在選定內（組合內互飛） | 沿路漸層：起點離場色 → 終點進場色（累積大圓距離比例） |

- 選定 = 單機場範圍的那座機場，或組合模式的所有機場；region 範圍沒有選定機場 → 不可選
- 資料色定義：`src/types/colorTheme.ts` 的 `TRAJ`；判斷與比例：`src/data/depArrColors.ts`（測試 `scripts/design/tests/depArrColors.test.mjs`）
- 管線：進場／離場平色走既有 `perFlightColorMap`（與機場配色同一條）；互飛漸層另走 `FlightScene.setDepArrGradients()`——靜態軌跡 per-vertex 插值、光軌與光球取目前位置在漸層上的色；2D（Mapbox）把互飛航線切 12 段近似漸層
- 光球：起降模式下 glow 兩層改用 per-instance 色（`InstancedOrbs.setInstanceColors`）；切回高度時 `instanceColor` 回 null、material 色復原，shader 回到原本那支
- 互斥：選起降 → 機場配色回 theme、分析染色回 none；選了它們 → 染色回高度。Compare 多日時停用
- 漸層比例以 `WeakMap<TrackPath>` 快取，LOD 換層換 path 物件時自動重算；每幀只做 binary search，不配置記憶體
