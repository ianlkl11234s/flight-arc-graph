# Flight Arc Design System（Studio · A 塔台儀表 · 琥珀）

> 狀態：v0.1（2026-10-02，P1 完成、P2 進行中）
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
| 語意色（P2 補） | danger、rec（錄影紅 `#e5484d`）、accentSoft（accent 12–16% 透明） |
| `BLUR` | 10px，所有半透明面板共用 |
| `FONT` | `ui`：JetBrains Mono → PingFang TC → Noto Sans TC；`data`：JetBrains Mono → ui-monospace |
| `SIZE` | 9 眉標 · 10 次要 · **11 正文** · 12 · **14 面板標題** · 18 · 30 圖說機場碼 |
| `SPACE` | 2 · 4 · 6 · 8 · 12 · 16 · 24 |
| `RADIUS` | **2**（面板與控件，近直角）· pill 99（僅狀態點） |
| `Z` | mapOverlay 10 · panel 20 · toolbar 25 · popover 30 · modal 40 · toast 50 |
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
- **圖說（Caption）**：左側 2px 琥珀直線；機場碼 30px mono
- **開關、滑桿 thumb、勾選框**：方角
- **眉標**：9px、字距 .18em、大寫英文 + 中文（例：`SELECTION · 機場`）
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

## §5 元件（P2 起建立於 `src/ui/`）

| 元件 | 規格要點 | 取代的既有實作 |
|---|---|---|
| `PanelHeader` | 眉標 + 14px 標題 + 24×24 關閉鈕（SVG，不用「×」字元） | 各面板自寫標題 |
| `Section` | 眉標 + 右延細線；可收合時用 chevron | `SectionHeader`、DeepAnalysis/FlightStats `Section`、`SectionTitle`、`SectionLabel` |
| `Button` | 高 28；primary（accent 底）／secondary（ctl 底 + border）／ghost／danger | 各處裸 `<button>` |
| `Segmented` | 選項 ≤3；選中 = accent 字 + accentSoft 底 | `ToggleButtons`、`ChipGroup`、DepArr、DataSource |
| `Select` | 選項 >3；原生 select 套樣式 | 9 處原生 select |
| `Toggle` | 28×16 方角，開 = accent 底 | `ToggleRow` checkbox 等 |
| `Slider` | 全站唯一；2px 軌 + 6×14 方形 thumb；標籤與數值同一行，控件在下一行 | `SliderRow`、`DurationRange`、Cinema、Timeline 滑桿 |
| `Chip` | 篩選與最近瀏覽；選中 = accent 邊框 | `SetChip` 等 |
| `StatCard` | 標籤 9.5 / 數字 15 mono / 副標 9.5 | `Card`、`MetricBlock`、`StatRow` |
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
| R3 | 右上只有一條工具列，順序：起降 ｜ 染色 ｜ 2D/3D · 底圖 ｜ 錄影 · 說明。不得加第二排（航線軌跡／空域快照是 rail 上的獨立模式，見 Q4） |
| R4 | 時間軸平常是膠囊；hover／鍵盤 focus／拖曳／日期面板開著 → 展開，全部解除後 2 秒收合；滑鼠點出來的 focus 不算 |
| R5 | 時間軸與 dock 底邊共用 `mapBottomInset` |
| R6 | 載入狀態條：150ms 內完成不顯示、至少顯示 600ms、完成停 2 秒、失敗停 4 秒、播放中不跳「已載入」；**失敗必須明講，和「這天沒資料」分開** |
| R7 | Esc 分層：說明視窗 → dock 卡 → 單航班模式 → 面板 |
| R8 | URL 只寫與預設不同的值、帶版本、未知參數靜默忽略（P6） |
| R9 | 缺值顯示「—」不寫 0；介面不露內部代號（`api`/`fused`、region key 等） |
| R10 | 不放占位按鈕；會切換文字的按鈕固定寬度 |
| R11 | 選機場：點擊／搜尋＝單選並飛過去；組合是第二步（Q1） |
| R12 | 日期只有時間軸一套月曆（Q2） |
| R13 | 進站面板收起，但要有可見的引導入口（Q6） |

---

## §7 禁止事項

- 寫死色碼（hex／rgba）於 `src/components/**`、`src/App.tsx`、`src/ui/**`（由 `design:guard` 計數，只准減少）
- 自創字級、圓角、z-index；寫死 ≥10 的 z-index
- 直接用 `isDarkTheme ? a : b` 取色（改用 `useTheme().tokens`）
- 第二套月曆、第二排工具列、第二種資訊卡定位方式
- 以 UI 改版為由改動軌跡渲染或 `COLOR_THEMES`
- 占位按鈕、用「×」「▶」「▼」文字字元當圖示

---

## §8 PR / commit checklist

- [ ] `npm run typecheck`（`tsc -b`）綠
- [ ] `npm run design:guard` 綠；計數下降時用 `--update` 提交新 baseline
- [ ] `scripts/perf`：`summary-snapshot --compare` **完全相同**；`visual-check --compare` 差異只在 chrome（看 diff 圖），通過後 `--baseline` 重建
- [ ] 暗、淡底圖都看過
- [ ] 新元件已加進活元件頁
- [ ] 新浮層已登記互斥、有 Esc 行為
- [ ] 一個行為改動一個 commit
