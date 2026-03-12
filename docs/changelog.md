# Changelog

## feature/date-navigation-timeline (2026-03-12)

### 日期導航時間軸：取代 ±12h 連續篩選

**問題**：靜態軌跡在 ±12h 時間窗口模式下會頓頓的。`displayedFlights` 的 useMemo 依賴 `timeline.currentTime`（每幀更新），導致航班集合持續變動，React 層面每幀重算 `filterByTimeWindow`。

**解法**：改用**日期 + 天數範圍**的離散篩選。日期篩選只在使用者操作時改變（選日期、±1 天、切 rangeDays），不隨 currentTime 每幀變動。

### UI 變更

時間軸底部新增日期導航列：

```
◀  2/18 (二)  ▶   1d ▽         ← 新增：日期導航列
⏸   60x ▽   02/18 14:30       ← 播放控制列
━━━━━━━━━━━ scrub bar ━━━━━━━━  ← 時間滑桿
00:00                    23:59  ← 滑桿範圍 = 選定日期範圍
```

- **◀ ▶**：±1 天導航，受 `availableDates` 限制
- **日期標籤**：顯示 `M/DD (星期)`
- **rangeDays 下拉**：1d / 3d / 7d，控制顯示幾天資料
- 滑桿範圍自動對應 `selectedDate ~ selectedDate + rangeDays`
- CalendarPanel 點日期也會同步

### 移除項目

- ±12h Window checkbox（SettingsPanel）
- `timeWindow` state（App.tsx）
- `selectedDate` state（App.tsx，改由 useTimeline 管理）
- `dateFilteredFlights` / `baseFlightsForStatic` useMemo
- Per-vertex alpha 系統（FlightScene）
  - `staticFlightRanges`, `lastVisibleIds`, `staticAlphaAttr`
  - `updateStaticVisibility()` 方法
  - ShaderMaterial → LineBasicMaterial
- `staticTrail.vert` / `staticTrail.frag` shader 檔案
- `filterByTimeWindow()` 函式（flightLoader.ts）
- `getBaseFlights` callback（customLayer.ts）

### 改動檔案

| 檔案 | 改動類型 |
|------|---------|
| `src/hooks/useTimeline.ts` | **重寫** — 以 `availableDates` 驅動，新增 `selectedDate`, `rangeDays`, `windowStart/windowEnd`, `shiftDate`, `setRangeDays` |
| `src/components/TimelineControls.tsx` | **重寫** — 新增日期導航列 + rangeDays 下拉，時間顯示改台灣時區 |
| `src/App.tsx` | **簡化** — 移除 6 個 state/useMemo，`displayedFlights` 改用離散 window 篩選 |
| `src/components/IconRailSidebar.tsx` | **簡化** — 移除 `timeWindow` prop + ±12h checkbox |
| `src/map/customLayer.ts` | **簡化** — 移除 `getBaseFlights`、visibility 追蹤 |
| `src/three/FlightScene.ts` | **簡化** — 移除 per-vertex alpha 系統，改回 `LineBasicMaterial` |
| `src/data/flightLoader.ts` | **清理** — 移除 `filterByTimeWindow` |
| `src/three/shaders/staticTrail.vert` | **刪除** |
| `src/three/shaders/staticTrail.frag` | **刪除** |

### 效能影響

- `displayedFlights` 不再依賴 `timeline.currentTime`，React 不再每幀重算航班集合
- 靜態軌跡不再需要 per-vertex alpha 增量更新
- 靜態軌跡改用 `LineBasicMaterial`（比 ShaderMaterial 更輕量）
- 切天時靜態軌跡會完整重建（含漸進展開動畫）
