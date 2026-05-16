# Changelog

## 2026-05-16 — Korea / Thailand region + Paris cluster

### 新增

- **Region Pills 加入 KR / TH** — 韓國（RK*）、泰國（VT*）獨立 region，原本歸在 "other"
- **15 座機場 camera presets**：
  - 韓國 6：RKSI 仁川、RKSS 金浦、RKPK 釜山、RKPC 濟州、RKTU 清州、RKTN 大邱 + KR_OVERVIEW
  - 泰國 9：VTBS 蘇凡那布、VTBD 廊曼、VTCC 清邁、VTSP 普吉、VTSG 喀比、VTSM 蘇梅、VTBU 烏塔堡、VTSS 合艾、VTSB 素叻他尼 + TH_OVERVIEW
  - 巴黎 3：LFPO 奧利、LFPB 布爾歇、LFOB 博韋
- **`fetch-tracks.ts` 新參數 `--from-time` / `--to-time`** — 接受 ISO datetime，精準時區過濾 `datetime_takeoff`，避免 `--date` 被 UTC 0:00 切斷台灣時區的問題

### 資料

台灣時間 2026-02-18 整天範圍（UTC `2026-02-17T16:00:00Z ~ 2026-02-18T16:00:00Z`）抓取：

| 區 | 機場 | 軌跡 |
|----|------|------|
| 🇫🇷 巴黎 | LFPG / LFPO / LFPB / LFOB | 1,807 (100%) |
| 🇹🇭 泰國 | VTBS / VTBD / VTCC / VTSP / VTSG / VTSM / VTBU / VTSS / VTSB | 2,656 (100%) |
| 🇰🇷 韓國 | RKSI / RKPK / RKPC / RKSS / RKTU / RKTN | 2,501 (100%) |

**新增 4,039 筆軌跡**（4 無軌跡 / 0 失敗），累計 done 28,688 → 32,727。
JSONL 機場數 1,049 → 1,137（+88 個被連帶帶出的目的地）。

### 改動檔案

| 檔案 | 改動 |
|------|------|
| `scripts/fetch-tracks.ts` | 加 `--from-time` / `--to-time` ISO 時間範圍過濾 |
| `scripts/split-tracks.ts` | `getRegion()` 加 RK→KR、VT→TH |
| `src/types/index.ts` | `Region` type 加 `KR \| TH` |
| `src/App.tsx` | `REGION_CONFIG` 加 KR/TH 配置；regionalAirports prefixes 同步；Region Pills 列表 |
| `src/components/IconRailSidebar.tsx` | `REGION_ICAO_MATCH` / `REGION_LABELS` / `KNOWN_PREFIXES` / `groupedByRegion` 同步 |
| `src/data/flightLoader.ts` | `REGION_PREFIXES` 加 KR/TH（漏這個會讓 region jsonl 載不到） |
| `src/hooks/useFlightData.ts` | manifest 載入迴圈含 KR/TH |
| `src/map/cameraPresets.ts` | 15 座新機場 + 2 個 OVERVIEW preset |
| `docs/backlog/data-fetching-status.md` | 標記巴黎/泰國/韓國 2/18 完成 |
| `README.md` | 涵蓋範圍表更新（138 機場 / 1,137 JSONL / 32,616 航班） |

### 已知後續

- 跑道 bearing 用粗略值，看單機場視角時可微調
- 各 region 可擴大日期範圍（目前只抓台灣 2/18 一天）

---

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
