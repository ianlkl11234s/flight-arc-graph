# Flight Arc Design System（Studio · A 塔台儀表 · 琥珀）

> 狀態：**v1.0**（2026-10-03，P1–P8 完成）
> 改 UI 前必讀本檔。規劃與進度見 [studio-design-system.md](../backlog/studio-design-system.md)；其他候選方向見 [direction-showcase](../design/direction-showcase/README.md)。
> 骨架與 UX 規則借自 `mini-taiwan-pulse/docs/design-system/spec.md`；本檔只記 PlanArt 自己的版本與刻意偏離。

---

## §1 原則

1. **軌跡是主角，chrome 是儀器**。介面退成安靜的石墨色，不和夜空光軌搶亮度。
2. **琥珀只標「正在發生的事」**：選中、播放中、主要按鈕、目前時刻。不拿來裝飾、不當標題色。
3. **一個位置一種職責**（§4）。新功能先找它屬於哪一區，不另開浮層。
4. **範圍**：本系統只管 chrome。軌跡渲染（Three 光軌與光球、靜態軌跡、`COLOR_THEMES`、起降／分析染色、空域極光、晨昏線、Bloom 星圖、viewshed）**不在範圍內，不得因 UI 改版而改變**。

---

## §2 Token

唯一數值來源：`src/styles/tokens.ts`，CSS 版 `src/styles/tokens.css`，兩者由 `scripts/design/check-tokens-sync.mjs` 強制同值。元件取色一律走 `useTheme().tokens`（`src/styles/ThemeContext.tsx`）；明暗由底圖決定（`App.tsx` 的 `isDarkTheme`）。

| 分組 | 內容 |
|---|---|
| `COLOR.dark / light` | panel、border、fg1/2/3、ctl、accent、accentInk、rail、mapBg（數值見 tokens.ts） |
| 語意色（P2 補） | danger、rec（錄影紅 `#e5484d`）、warn（警示琥珀 `#f59e0b`，兩色同）、accentSoft（accent 12–16% 透明） |
| `BLUR` | 10px，所有半透明面板共用 |
| `FONT` | `ui`：JetBrains Mono → PingFang TC → Noto Sans TC；`data`：JetBrains Mono → ui-monospace |
| `SIZE` | key 為角色名：`eyebrow` 11 眉標 · `minor` 11.5 次要 · **`body` 12.5 正文** · `sub` 13 小標 · **`title` 15 面板標題** · `large` 18 大字 · `caption` 30 圖說機場碼。**chrome 最小字級 11**（含 SVG 圖表刻度；`design:guard` 硬規則，只准 0 處 <11；viewBox 內圖示字形以 `/* glyph */` 註記豁免）。錄影畫面（`useCanvasRecorder` 與其 HTML 鏡像標題）、地圖圖層內文字不屬本階層 |
| `SPACE` | 2 · 4 · 6 · 8 · 12 · 16 · 24 |
| `RADIUS` | **2**（面板與控件，近直角）· pill 99（僅狀態點） |
| `Z` | mapOverlay 10 · panel 20 · toolbar 25 · popover 30 · modal 40 · toast 50 · boot 60（開場遮罩，唯一高於 toast 的一層） |
| `LAYOUT` | railWidth 56 · panelWidth 288 · panelWidthWide 360（分析›統計）· panelLeft 64 · panelTop 52 · mapBottomInset 64 · dockWidth 260 |

不得自創字級、圓角、z-index；需要新值先加 token（TS 與 CSS 同時加）。

### 和 Pulse 的刻意偏離（不是違規，不要「修」掉）
| Pulse 規則 | PlanArt | 理由 |
|---|---|---|
| 不載 web font | 載一套 JetBrains Mono | 等寬字是 A 方向的識別；只此一套 |
| 不用等寬字包中文 | 容器字體 mono 優先、CJK 落到 PingFang | 中英混排一律實測字距；全中文長段落可改用系統字 |
| 強調色藍 | 琥珀 | 雷達幕語言，和軌跡藍區隔 |

---

## §3 視覺語言（A 方向特徵）

- **面板**：`panel` 底 + `BLUR` + 1px `border` + 圓角 2；左上與右下各一個 8px 琥珀直角刻度（`::before/::after`，opacity .8）
- **rail 選中**：圖示變 fg1 + 左側 2px 琥珀直線
- **圖說（Caption）**：左側 2px 琥珀直線；機場碼 `SIZE.caption` 30px mono
- **開關、滑桿 thumb、勾選框**：方角
- **眉標**：`SIZE.eyebrow` 11px、字距 .18em、大寫英文 + 中文（例：`SELECTION · 機場`）
- **數字**：一律 `FONT.data` + `tabular-nums`

---

## §4 版面區域

| 區域 | 職責 | 元件 |
|---|---|---|
| 左 rail（寬 56） | workspace 入口：探索（含區域 chip）／機場（含預設組合）／呈現／分析／空域快照 … 錄影 | `IconRailSidebar` |
| 左浮動面板（288，left 64 / top 52） | 設定與選擇；**同時只開一個** | `Panel` + `PanelHeader` |
| 左上 | 字標 `FLIGHT ARC` + 相機 HUD（座標、俯角） | `Brand` |
| 右上 | **唯一的工具列**，順序固定（§6 R3）；下方是載入狀態條 | `Toolbar`、`StatusBar` |
| 左下 | 圖說（在看什麼）+ 時間軸膠囊 | `Caption`、`Timeline` |
| 右下 dock（260） | 點擊資訊卡（航班／空域／機場）+ 圖例；同時只一張卡 | `DockCard` |
| 置中 | 說明視窗 | `Modal` |

時間軸與 dock 底邊共用 `LAYOUT.mapBottomInset`。

---

## §5 元件

### `src/ui/`（基礎元件，由 `src/ui/index.ts` 統一匯出）

| 元件 | 規格要點 |
|---|---|
| `Panel`／`PanelBody` | 左側浮動面板外殼（panel 底 + BLUR + 邊框 + 兩個琥珀刻度） |
| `PanelHeader`（含 `Eyebrow`、`CloseButton`） | 眉標 + `title` 15px 標題 + 24×24 關閉鈕（SVG，不用「×」字元） |
| `Section` | 眉標 + 右延細線；可收合時用 chevron |
| `Button` | 高 28；primary（accent 底）／secondary（ctl 底 + border）／ghost／danger |
| `Segmented` | 選項 ≤3；選中 = accent 字 + accentSoft 底 |
| `Select` | 選項 >3；原生 select 套樣式 |
| `Toggle` | 28×16 方角，開 = accent 底 |
| `Slider` | 全站唯一；2px 軌 + 6×14 方形 thumb；標籤與數值同一行，控件在下一行；支援單值與區間 |
| `Chip`／`ChipGroup` | 篩選與最近瀏覽；選中 = accent 邊框 |
| `StatCard`／`StatGrid` | 標籤 `minor` 11.5 / 數字 `title` 15 mono / 副標 `minor` 11.5（列式：標籤 `body` / 數字 `sub`） |
| `DockCard` | 右下資訊卡外殼：眉標、標題、`kv` 列、動作列、關閉 |
| `StatusBar` | 單行載入／完成／空／失敗（§6 R6），搭配 `loadingStatusController` |
| `Modal` | 置中、z modal、Esc 關閉 |
| `Caption` | 左下圖說：左側 2px 琥珀線 + `SIZE.caption` 機場碼 + meta 列 |
| `SelectionRing` | 點擊處選取圈（R1），相機一動就收 |
| `icons`（`IconClose`／`Chevron`／`Play`／`Pause`／`Plus`／`Minus`／`Link`／`Info`） | SVG 圖示；不用「×」「▶」「▼」字元 |

行為模組（純函式，有單元測試）：`escStack`（R7）、`overlayMutex`（R2）、`timelineExpand`（R4）、`loadingStatusController`（R6）；`vars.ts` 提供 `themeVars`／`mix`（在 token 色上取透明度，不寫死色碼）。

### `src/components/`（由基礎元件組成的版面元件）

| 元件 | 職責 |
|---|---|
| `Toolbar` | 右上唯一工具列（R3）：起降 ｜ 染色 ｜ 2D/3D · 底圖 ｜ 錄影 · 複製連結 · 說明 |
| `Timeline` | 左下時間軸膠囊（R4／R5），手機固定展開 |
| `Dock` | 右下 dock 容器（同時只一張卡）；內容為 `FlightInfoCard`／`AirspaceInfoCard`／機場資訊與圖例 |
| `FlightInfoCard`、`AirspaceInfoCard` | 點擊資訊卡（內容；外殼是 `DockCard`） |
| `LoadingStatus` | 把載入狀態接到 `StatusBar` |
| `IconRailSidebar` + `sidebar/panels/*` | 左 rail 與各面板（一個 panel 一檔） |
| `MobileHeader`、`MobileBottomSheet` | 手機版 chrome（只統一外觀，R11／Q8） |
| `InfoModal` | 說明視窗內容（外殼是 `Modal`） |
| `boot/BootScreen` | 首次載入的雷達遮罩（見下方「開場（Boot）」） |

### 資料色與地圖疊層色（不屬 chrome）

`src/types/colorTheme.ts`（軌跡配色）與 `src/types/dataColors.ts`（Atlas 完整度／流量漸層、日期 Compare 4 色、InfoModal 色條、空域類別與海峽中線、羅盤、拍攝模式疊層）是資料色 SSOT，兩者在 `design:guard` 排除清單內。元件取資料色一律從這裡 import，**不得在元件內寫色碼**；數值代表圖例意義，不隨意改。

活元件頁：`design-system.html`（dev server 下開 `/design-system.html`），直接 import 真元件、暗／淡並排。新增元件必須同時加一段展示。**不進正式 build。**

---|---|---|
| `PanelHeader` | 眉標 + `title` 15px 標題 + 24×24 關閉鈕（SVG，不用「×」字元） | 各面板自寫標題 |
| `Section` | 眉標 + 右延細線；可收合時用 chevron | `SectionHeader`、DeepAnalysis/FlightStats `Section`、`SectionTitle`、`SectionLabel` |
| `Button` | 高 28；primary（accent 底）／secondary（ctl 底 + border）／ghost／danger | 各處裸 `<button>` |
| `Segmented` | 選項 ≤3；選中 = accent 字 + accentSoft 底 | `ToggleButtons`、`ChipGroup`、DepArr、DataSource |
| `Select` | 選項 >3；原生 select 套樣式 | 9 處原生 select |
| `Toggle` | 28×16 方角，開 = accent 底 | `ToggleRow` checkbox 等 |
| `Slider` | 全站唯一；2px 軌 + 6×14 方形 thumb；標籤與數值同一行，控件在下一行 | `SliderRow`、`DurationRange`、Cinema、Timeline 滑桿 |
| `Chip` | 篩選與最近瀏覽；選中 = accent 邊框 | `SetChip` 等 |
| `StatCard` | 標籤 `minor` 11.5 / 數字 `title` 15 mono / 副標 `minor` 11.5（列式：標籤 `body` / 數字 `sub`） | `Card`、`MetricBlock`、`StatRow` |
| `DockCard` | 右下資訊卡外殼：眉標、標題、`kv` 列、動作列、關閉 | `AirspaceInfoCard` 外殼、航班 tooltip |
| `StatusBar` | 單行載入／完成／失敗（§6 R6） | 中央 `LoadingIndicator` |
| `Modal` | 置中、z modal、Esc 關閉 | `InfoModal` 外殼 |

活元件頁：`design-system.html`（dev server 下開 `/design-system.html`），直接 import 真元件、暗／淡並排。新增元件必須同時加一段展示。**不進正式 build。**

---

## §6 UX 規則

| # | 規則 |
|---|---|
| R1 | 點擊資訊一律停靠右下 dock，點擊處畫選取圈；不用游標 tooltip 或 Mapbox popup 承載資訊 |
| R2 | 左側面板與浮層互斥（純函式 + 測試）；新的浮層必須登記到互斥清單 |
| R3 | 右上只有一條工具列，順序：起降 ｜ 染色 ｜ 2D/3D · 底圖 ｜ 錄影 · 複製連結 · 說明。不得加第二排（航線軌跡／空域快照是 rail 上的獨立模式，見 Q4）。「染色」= `高度`（預設）｜`起降`：沒有選定機場（region 範圍）時「起降」disabled、提示「先選機場」；多日 Compare 時也 disabled（日期分色優先）；兩種情況下若正在起降模式會自動回到高度。起降與機場配色、分析染色互斥 |
| R4 | 時間軸平常是膠囊；hover／鍵盤 focus／拖曳／日期面板開著 → 展開，全部解除後 2 秒收合；滑鼠點出來的 focus 不算 |
| R5 | 時間軸與 dock 底邊共用 `mapBottomInset` |
| R6 | 載入狀態條：150ms 內完成不顯示、至少顯示 600ms、完成停 2 秒、失敗停 4 秒、播放中不跳「已載入」；**失敗必須明講，和「這天沒資料」分開** |
| R7 | Esc 分層：說明視窗 → dock 卡 → 單航班模式 → 面板 |
| R8 | URL 只寫與預設不同的值、帶版本、未知參數靜默忽略（P6，key 表見下） |
| R9 | 缺值顯示「—」不寫 0；介面不露內部代號（`api`/`fused`、region key 等） |
| R10 | 不放占位按鈕；會切換文字的按鈕固定寬度 |
| R11 | 選機場：點擊／搜尋＝單選並飛過去；組合是第二步（Q1） |
| R12 | 日期只有時間軸一套月曆（Q2） |
| R13 | 進站面板收起，但要有可見的引導入口（Q6） |

### 起降染色（R3 的「染色」）

工具列「染色：高度（預設）｜起降」。判斷依據是選定機場（dest ∈ 選定 → 進場色，origin ∈ 選定 → 離場色），組合內互飛沿路漸層；region 範圍與多日 Compare 時不可選。光球與拖尾跟著起降色。完整規則見 [studio-design-system.md §7](../backlog/studio-design-system.md)；色票邏輯在 `src/data/depArrColors.ts`。

### R8 網址 key 表（P6，`src/data/urlState.ts`）

| key | 內容 | 預設（不寫） |
|---|---|---|
| `v` | 版本，固定 `1`；有寫其他 key 時才寫。缺少或不符仍盡量解析 | — |
| `a` | 單一機場 ICAO（須在機場目錄內） | `RCTP` |
| `set` | 組合：預設組合 id（`BUILTIN_SETS`）或逗號分隔 ICAO 清單 | — |
| `scope` | 區域範圍的 region key（空域快照時也寫） | — |
| `d` | 起始日期 YYYY-MM-DD（須是該選取對象有資料的日期） | `2026-02-18` |
| `n` | 天數（1／3／7） | `1` |
| `cmp` | Compare 日期，逗號分隔 | — |
| `f` | 起降篩選 `arr`／`dep` | 全部 |
| `cb` | 染色 `deparr` | 高度 |
| `th` | 軌跡配色主題 key（`COLOR_THEMES`） | `default` |
| `t` | 暫停中的播放時刻 HH:MM（台灣時間）；多日時 `HH:MM+N` = 第 N+1 天。**有 `t` ＝ 暫停在該時刻**，播放中不寫 | — |
| `cam` | 鏡頭 `lat,lng,zoom,pitch,bearing`（4／4／2／1／1 位小數） | 單機場時 = 機場預設鏡頭；組合與區域一律寫 |
| `ds` | 資料來源 `airspace`（空域快照） | 航線軌跡 |
| `fl` | 選取中的航班 fr24_id（還原成開航班卡，不還原追蹤） | — |

- `set` ＞ `scope` ＞ `a` 互斥，encode／decode 都只留優先者。
- 壞值只丟該 key、不 throw；查目錄才知道的（機場不存在、該日無資料）在套用時落回預設。
- 進站只套用一次，順序：資料來源 → 選取對象 → 日期 → 等資料載完 → 篩選／配色／染色 → 暫停在 `t` → 鏡頭（蓋掉預設飛行）→ 航班卡。
- 寫回用 `history.replaceState`：鏡頭 debounce 500ms，其他 150ms；套用完成前不寫。

### 開場（Boot）

首次進站才出現一次的全螢幕遮罩（C「雷達掃描」，設計稿 `docs/design/boot-and-list/boot-and-list.tpl.html` Q1-C）；之後的載入一律走 R6 狀態條。機制照 Pulse M2。

- **畫面**：`tokens.mapBg` 底；canvas 雷達（距離環、琥珀掃描扇形＋掃描線、掃過處亮起的點）；下方字標 `FLIGHT ARC`（ARC 為 accent）與狀態 chip「載入軌跡 · {機場／組合／區域}」＋旋轉小環 → 「完成」（逾時或失敗時改「進入地圖」，失敗由狀態條說明＋重試）。顏色全從 tokens 讀，canvas 也是（扇形用 globalAlpha 切片，不寫色碼）。
- **雷達上的點不捏造**：預設機場（組合取第一座）周邊 `radiusKm` 內的真實機場，依大圓方位與距離投影（北在上）；座標取機場目錄（`airport-points.geojson`），未載入時退回 `cameraPresets`；中心機場沒有座標就只畫環與掃描線。
- **時序**（`src/components/boot/bootSequence.ts`，純函式＋測試）：

| 階段 | 條件／長度 | `<html data-boot>` |
|---|---|---|
| loading | 至少 `minShowMs`（預設 2000），且等「地圖 ready ＋第一批航班載完或失敗」；30s 未就緒直接跳 leaving | `wait` |
| done | 「完成」停 0.4s | `wait` |
| leaving | 遮罩淡出 0.45s，內容放大 1.04 | `wait` |
| entering | 主畫面元件彈入：`cubic-bezier(0.34,1.56,0.64,1)` 0.85s；rail 0 → toolbar 0.12 → timeline 0.24 → caption 0.30 → title 0.36s；rail 圖示 0.4s 逐一放大（延遲 0.40–0.70s）；timeline 到位閃一下 accent 光暈；總長 1.6s。全部時間 × `enterScale`（`--boot-k`） | `enter` |
| gone | 移除 `data-boot` | — |

  減少動態（`prefers-reduced-motion`）：就緒即結束，不等最少顯示、不淡出、不彈入。
- **`data-boot-part`**：`src/main.tsx` 在 render 前設 `data-boot="wait"`。參與進場的元件**只加屬性、不加 props**：`rail`（IconRailSidebar 的 rail，子元素逐一放大）、`toolbar`（Toolbar、MobileHeader、手機時間軸）、`timeline`、`caption`、`title`（左上字標）、`fade`（手機抽屜，只淡入）。屬性要加在元件自己的定位根節點上；**不要用帶 transform 的外層包住 absolute／fixed 元件**（transform 會變成新的定位基準）。規則在 `src/components/boot/boot.css`。
- 遮罩是蓋在地圖上的 overlay，地圖在下面照常初始化（P5「先出地圖」不變）；遮罩期間 `LoadingStatus` 不畫，結束後接手。
- **可調參數**集中在 `src/components/boot/bootLayout.ts`（雷達直徑／上限／位移、環數、掃描秒數、外圈距離、點大小、字標字級與間距、chip 間距、最少顯示、進場倍率）。調整頁：dev server 下開 **`/boot-tuner.html`**（不進正式 build），調好按「複製設定」貼回 `BOOT_LAYOUT`。調整頁的暫存值只存在該頁的 localStorage，正式站只讀 `bootLayout.ts`。
- `scripts/perf` 的 `waitStable` 會等 `data-boot` 消失才算穩定。

---

## §7 禁止事項

- 寫死色碼（hex／rgba）於 `src/components/**`、`src/App.tsx`、`src/ui/**`、`src/design-system/**`（`design:guard` baseline 全 0，只准 0；資料色放 `src/types/dataColors.ts`）
- 自創字級、圓角、z-index；寫死 ≥10 的 z-index；chrome 字級 < 11（含 SVG 刻度）
- 直接用 `isDarkTheme ? a : b` 取色（改用 `useTheme().tokens`）
- 第二套月曆、第二排工具列、第二種資訊卡定位方式
- 以 UI 改版為由改動軌跡渲染或 `COLOR_THEMES`
- 占位按鈕、用「×」「▶」「▼」文字字元當圖示

---

## §8 PR / commit checklist

- [ ] `npm run typecheck`（`tsc -b`）綠
- [ ] `npm run design:guard` 綠（色碼 baseline 已全 0，不得上升）
- [ ] `npm run design:test` 綠（純函式與 URL／起降色單元測試）
- [ ] `scripts/perf`：`summary-snapshot --compare` **完全相同**；`visual-check --compare` 差異只在 chrome（看 diff 圖），通過後 `--baseline` 重建
- [ ] 暗、淡底圖都看過
- [ ] 新元件已加進活元件頁
- [ ] 新浮層已登記互斥、有 Esc 行為
- [ ] 一個行為改動一個 commit
