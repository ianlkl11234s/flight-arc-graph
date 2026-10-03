# Changelog

## 版本總覽

| 版號 | 日期 | 重點 |
|---|---|---|
| v3.2.0 | 2026-10-03 | 網址狀態、手機外觀、雷達開場、機場列表起降數、多日比較精簡 |
| v3.1.0 | 2026-10-03 | 流程修正、起降染色、字級最小 11px |
| v3.0.0 | 2026-10-02 | 介面全面改版：A 塔台儀表・琥珀設計系統 |
| v2.3.0 | 2026-09-17 | Top-1000 第 2、3 批資料上線 |
| v2.2.1 | 2026-09-04 | 修空域在 3D 地球上的投影 |
| v2.2.0 | 2026-09-03 | 渲染效能工程 |
| v2.1.0 | 2026-09-01 | 進站載入量瘦身 35MB→6MB、機場星圖配色 |
| v2.0.0 | 2026-08-30 | 選擇優先的機場地圖（Selection-first Atlas） |
| v1.0.0 | 2026-08-22 | 穩定版（2.0 UI 改版前） |
| v0.12.2 | 2026-07-28 | 高度單位治本修正 |
| v0.12.1 | 2026-07-25 | 遠景純黑修正 |
| v0.12.0 | 2026-07-11 | 世界尺度效能、Bloom 星圖貼合地球 |
| v0.11.0 | 2026-06-12 | 中國區、資料目錄（manifest Phase 1） |
| v0.10.0 | 2026-05-16 | 韓國／泰國區、巴黎機場群 |
| v0.9.0 | 2026-04-27 | 深度分析：機型／航司／用途篩選與著色 |
| v0.8.0 | 2026-04-24 | 多機場組合、歐洲樞紐 |
| v0.7.0 | 2026-04-19 | 禁航區、ADIZ／海峽中線、英國區、多日比較 |
| v0.6.0 | 2026-03-28 | Summary 面板、航司篩選、24h 熱力條 |
| v0.5.0 | 2026-03-22 | 配色主題系統、4K 錄影、美國區 |
| v0.4.0 | 2026-03-16 | 錄影模式（Cinema）、動態視域 |
| v0.3.0 | 2026-03-15 | 區域選擇、延遲載入、淺色主題、S3／Zeabur 部署 |
| v0.2.0 | 2026-03-14 | 日期導航時間軸、場景預設、空域掃描 |
| v0.1.0 | 2026-02-21 | 專案起點：航跡生成藝術、底圖切換、光球 |

> 版號規則與發布流程見 [RELEASING.md](RELEASING.md)。v1.0.0／v2.0.0 為既有 tag；v0.1.0–v0.12.2、v2.1.0 起為補打的歷史版號。

## v3.2.0 — 2026-10-03 — 網址狀態、手機外觀、雷達開場、機場列表起降數、多日比較精簡

### 新增

- 網址記住狀態（history.replaceState）並提供工具列「複製連結」
- 手機 header 單排＋⋯ 選單；手機與錄影畫面 chrome 跟隨底圖明暗
- 雷達掃描開場（BootScreen）與 dev-only 調整頁 boot-tuner.html
- 機場面板三分頁（機場｜組合｜場景）、進／離數字欄、可點欄首排序
- 多日比較：已選日期 chip＋月曆多選、直方圖每日等寬分段、左側面板依實際高度動態讓位

### 修正

- 時間軸直方圖與進度滑桿對齊；月曆 portal 到 body 不再被左側面板蓋住
- 手機航班卡不再被時間軸蓋住；錄影畫面 Trail 鈕不再貼上座標行
- 搜尋結果「符合：…」與機場列副標單行截斷

### 資料

- manifest 每機場每日新增 arr／dep（`split-tracks --manifest-only` 重建）；型別新增可選 datesArr／datesDep
- 寫死色碼歸零，資料色集中 `src/types/dataColors.ts`；設計系統 spec v1.0

### 注意事項

- 空域資訊卡 chrome 色改用 tokens、手機／錄影 chrome 跟隨底圖明暗屬行為變化

## v3.1.0 — 2026-10-03 — 流程修正、起降染色、字級最小 11px

### 新增

- 工具列「染色：高度｜起降」，組合內互飛沿路漸層、光球跟色（region／Compare 停用）
- 統計改為 rail「分析 › 統計」分頁；航班卡停靠右下 dock，單擊出卡、按「追蹤」才鎖定

### 修正

- Select 的 placeholder 可選回；空域總開關關閉時子開關仍可點
- 首次進站先出地圖＋狀態條；載入中圖說日期顯示實際載入日期
- 圖表配色統一（目前／選中／hover 用 accent，其餘中性灰階）

### 注意事項

- 選機場改單選優先（保留預設組合）；日期只留時間軸月曆；字級階層改角色名、最小 11px，由 guard 守門
- 高度模式逐像素不變

## v3.0.0 — 2026-10-02 — 介面全面改版：A 塔台儀表・琥珀設計系統

### 新增

- Studio 設計系統 P1–P4：tokens、ThemeContext、`src/ui` 13 個基礎元件、活元件頁、design-guard ratchet、spec v0.1
- 工具列、圖說＋引導入口、時間軸膠囊、右下 dock、空域快照 rail 模式、區域 chip

### 修正

- 浮層互斥、Esc 分層；載入狀態條、載入失敗與無資料分離

### 注意事項

- 整體介面視覺大改，軌跡渲染未變（summary-snapshot 相同、地圖主體像素不變）

## v2.3.0 — 2026-09-17 — Top-1000 第 2、3 批資料上線

### 新增

- Top-1000 戰役 Batch 2、3 機場軌跡覆蓋上線（PR #13）

### 資料

- 軌跡資料走 S3 上傳後於 Zeabur 執行 pull-from-s3；覆蓋數字以 `public/tracks/manifest.json` 為準

### 注意事項

- 資料變動版本，部署後需拉資料

## v2.2.1 — 2026-09-04 — 修空域在 3D 地球上的投影

### 修正

- 空域圖層貼合 globe 球體（PR #12）

### 資料

- 補資料來源署名與全球空域規劃（OpenAIP 為 CC BY-NC，擴全球前需拍板）

## v2.2.0 — 2026-09-03 — 渲染效能工程

### 新增

- 依 zoom band 換 LOD 層（L0／L1／L2，含 hysteresis）；`tracks/lod-files.txt` 清單與 pull／upload 支援 L1／L2
- 視覺回歸與效能 A/B 工具（`scripts/perf/`）

### 修正

- 全世界模式 fps 12 → 27；多機場線段 -89%、heap -49%
- Flight.path 改 TrackPath typed array；播放時鐘留 ref、React 10 Hz 發布；光球上限 1024 → 8192
- 光軌顏色改由 fr24_id 決定，具決定性

### 資料

- LOD 檔共 9,476 個，約 1.2 GB，S3 上傳完成

### 注意事項

- 部署後 Zeabur 需 `pull-from-s3.sh`（可加 `--no-lod` 略過 LOD）

## v2.1.0 — 2026-09-01 — 進站載入量瘦身 35MB→6MB、機場星圖配色

### 新增

- 機場星圖完整度新色階、點地球飛俯瞰視角、機場點待按紅點（PR #10）

### 修正

- 進站載入量約 35MB → 6MB（空域延遲載入、nginx gzip，PR #9）
- 初始軌跡載入去重（PR #8）

---

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
