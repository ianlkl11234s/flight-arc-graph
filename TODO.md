# Flight Arc — 注意事項與待辦

## 開發注意事項

### CinemaBar Props 傳遞（維護成本）
新增 Cinema 功能時，需在三處同步修改：
1. `src/hooks/useCinemaCamera.ts` — hook return interface + 實作
2. `src/App.tsx` — 從 `cinema.*` 展開傳給 CinemaBar
3. `src/components/CinemaBar.tsx` — props interface + destructure

**未來可改善**：CinemaBar 直接接收 `cinema: UseCinemaCameraReturn`，省去中間轉換。

### App.tsx State + Ref 同步模式
每新增一個需要在 RAF callback 中讀取的 state，要同時：
1. `useState` 宣告
2. `useRef` 宣告（同初始值）
3. render body 中手動同步 `ref.current = state`

漏了第 3 步會導致 RAF 讀到 stale 值。目前有 14 組。

**未來可改善**：封裝 `useLatest(value)` hook 或用單一 config ref。

### Viewshed 幾何計算
- `getViewshedRings()` 和 `getViewshedArcPoints()` 含大量三角函數
- 目前已做「飛機未移動時跳過」的優化
- 若加入更多環或更高 segments，注意效能

### Three.js 資源清理
- 新增 Three.js mesh/material 時，確保在 `clearViewshedLines()` 或 `clearScene()` 中有對應的 `dispose()`
- `updateViewshedFans()` 的 buffer 重分配（尺寸不夠時）舊 GPU buffer 未顯式釋放，頻率低但需注意

## 架構待辦（非緊急）

- [ ] CinemaBar props 簡化（直接傳 cinema hook return）
- [ ] App.tsx ref 同步模式改善（useLatest hook）
- [ ] RAF 迴圈統一為 `useAnimationFrame` custom hook（目前 4 處重複模式）
- [ ] `computeBearing` / `destinationPoint` 從 viewshedOverlay 搬到 `src/utils/geoMath.ts`
- [ ] `lerpAngle` / `applyEasing` 從 useCinemaCamera 搬到 `src/utils/math.ts`
- [ ] mapStyleId 字串判斷改為結構化 metadata（StyleSelector 定義 isDark/isSatellite）
