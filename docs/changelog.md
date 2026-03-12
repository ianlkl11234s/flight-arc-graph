# Changelog

## feature/date-navigation-timeline (2026-03-12)

### 日期導航時間軸 + ±12h GPU 可見度

**問題**：靜態軌跡在 ±12h 時間窗口模式下會頓頓的。`displayedFlights` 的 useMemo 依賴 `timeline.currentTime`（每幀更新），導致航班集合持續變動，React 層面每幀重算 `filterByTimeWindow`。

**解法**：
1. 改用**日期 + 天數範圍**的離散篩選，`displayedFlights` 不再依賴 `currentTime`
2. ±12h 時間窗口改為 **GPU render loop** 中計算（per-vertex alpha），不經過 React

### UI 變更

**日期導航列**（時間軸上方新增）：

```
◀  2/19 (三)  ▶   1d ▽         ← 新增：日期導航列
⏸   60x ▽   02/19 14:30       ← 播放控制列
━━━━━━━━━━━ scrub bar ━━━━━━━━  ← 時間滑桿
00:00                    23:59  ← 滑桿範圍 = 選定日期範圍
```

- **◀ ▶**：±1 天導航，受 `availableDates` 限制
- **日期標籤**：顯示 `M/DD (星期)`
- **rangeDays 下拉**：1d / 3d / 7d，控制顯示幾天資料
- 滑桿範圍自動對應 `selectedDate ~ selectedDate + rangeDays`
- CalendarPanel 點日期也會同步
- 預設起始日為第二個可用日期（2/19）

**±12h Window checkbox**：
- 保留在 Settings > Display > Flight Trails 下
- 開啟時：靜態軌跡只顯示 currentTime ±12h 內的航班（GPU per-vertex alpha）
- 關閉時：所有航班軌跡全部可見

**Airspace Scan 預設**：
- 切換到 Airspace Scan 時自動設定：
  - Scope → All Taiwan
  - rangeDays → 7d
  - Opacity → 0.04
  - 相機飛到全台視角 `[120.9, 24.2] z7.3 pitch 42`
- 切回 Route Tracks 時恢復：airport / 1d / 0.1

### 架構改動

**核心改動**：`displayedFlights` 從每幀重算改為離散日期篩選

- `useTimeline` 以 `availableDates` 驅動，新增 `selectedDate`, `rangeDays`, `windowStart/windowEnd`
- `displayedFlights` 只依賴 `windowStart/windowEnd`（使用者操作才變）
- ±12h 可見度移到 `customLayer.ts` render loop（GPU 計算，不觸發 React）
- `filterByTimeWindow` React-side 函式已移除

**靜態軌跡渲染**：
- 使用 ShaderMaterial + per-vertex alpha（支援 ±12h 增量可見度）
- 漸進式建構保留（每幀 10000 頂點，展開動畫）

### 配色調整

靜態軌跡高度漸層色（暗色主題）：
- 低空：`(1.0, 0.8, 0.5)` — 暖白色
- 高空：`(0.5, 0.75, 1.0)` — 亮藍白色

### 改動檔案

| 檔案 | 改動 |
|------|------|
| `src/hooks/useTimeline.ts` | 重寫：`availableDates` 驅動，日期導航，預設 2/19 |
| `src/components/TimelineControls.tsx` | 重寫：日期導航列 + rangeDays 下拉 |
| `src/App.tsx` | 簡化：移除 `dateFilteredFlights`/`baseFlightsForStatic`，加入 Airspace Scan 預設 |
| `src/components/IconRailSidebar.tsx` | ±12h checkbox 保留為可選 |
| `src/map/customLayer.ts` | ±12h 可見度在 render loop 計算，加入 `getTimeWindow` |
| `src/three/FlightScene.ts` | 恢復 per-vertex alpha 系統，調整配色 |
| `src/three/shaders/staticTrail.vert/frag` | 恢復（per-vertex alpha shader） |
| `src/data/flightLoader.ts` | 移除 `filterByTimeWindow` |

### Git Tags

- **`v1.0-pre-date-nav`** — 打在 master 上，此功能開發前的最後穩定版本
