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

## 動態空域研究（未實作）

OpenAIP 只收**永久 AIP** 空域。台海周邊真正讓飛機改道的多半是**臨時公告**，需另闢資料源。

### 1. PLA 演習區（歷史快照可做）

中國國防部 / 海事局在大型演習前會公告「禁止航行 / 禁止飛越」區域，**含具體經緯度多邊形**，是公開資訊：

| 事件 | 日期 | 區域數 | 說明 |
|------|------|--------|------|
| Pelosi 訪台 | 2022-08-04 ~ 08-07 | 6 個矩形 | 圍繞台灣四周，最近距台灣 12 海里；MSA 海事局公告 |
| 聯合利劍 2023 | 2023-04-08 ~ 04-10 | 多個區塊 | 台灣周邊三方向 |
| 聯合利劍 2024-A | 2024-05-23 ~ 05-24 | 5 個區塊 | 環台 24 小時 |
| 聯合利劍 2024-B | 2024-10-14 | 多區塊 | 紀念雙十、海上靶場 |

**官方資料源**：
- 中國海事局 https://www.msa.gov.cn/ 「航行警告」欄目（中文 HTML）
- 中國國防部 http://www.mod.gov.cn/ 新聞稿（含座標但 PDF 為主）
- 維基百科彙整（如 [2022 Chinese military exercises around Taiwan](https://en.wikipedia.org/wiki/2022_Chinese_military_exercises_around_Taiwan)）通常列出座標表

**實作建議**：
- 手動建 `public/airspace/historical/pla-exercises.geojson`，每個 feature 加 `active_from` / `active_to` 欄位
- airspaceLoader 依當前 timeline 日期過濾顯示
- UI: Airspace 面板加「歷史 PLA 演習」分類

**工作量**：~半天（蒐集 4 大事件座標 + schema 擴充 + 日期感知過濾）

### 2. NOTAM 爬蟲（即時動態，但歷史困難）

NOTAM = Notice to Airmen，臨時飛航公告，包含禁航、危險、機場關閉等。**正在生效**的 NOTAM 公開取得不難，但**歷史 NOTAM 通常被刪除**。

**台灣 NOTAM 資料源**：
- **民航局 NOTAM 系統**：https://aischina.caa.gov.tw/eaip/ → 「動態資料」→ NOTAM
  - 提供：當前生效 + 未來 3 天
  - 格式：標準 ICAO NOTAM 電碼（Q-line 含區域 lat/lng + 半徑）
  - 中華民國 PDF + HTML 並存
- **AIP Supplement**（AIP SUP）：較大型/長期的修訂，有 PDF
- **航管廣播 AIRMET / SIGMET**：氣象+亂流警報，可從 https://aviationweather.gov/sigmet 取得

**中國 NOTAM 資料源**：
- **CAAC eAIP** https://www.eaipchina.cn/eaip → NOTAM 欄位
- **MSA 海事局**（前述演習區，海上禁航通常先在 MSA 公告）
- **新加坡 ICAO 區辦** https://www.notams.faa.gov/dinsQueryWeb/ 也轉發部分 CN NOTAM

**國際 NOTAM 集散**（最完整、英文）：
- **FAA International NOTAM** https://notams.aim.faa.gov/notamSearch/ — 全球 NOTAM 查詢，需點國家代碼
- **EUROCONTROL NOP** https://www.public.nm.eurocontrol.int/PUBPORTAL/ — 歐洲 NOTAM
- **NavCanada AIS** https://flightplanning.navcanada.ca/Latest/cfps/cfps-en.html
- **PilotWeb / SkyVector / ForeFlight**（商用，含歷史）

**NOTAM 解析難點**：
1. **電碼格式**：純文字 + ICAO 縮寫（Q-line、A-line、B-line、C-line、D-line、E-line、F-line、G-line）
   - 範例：`Q) RCAA/QRTCA/IV/BO/W /000/300/2510N12130E001`
   - `QRTCA` = Restricted area / Activated；`/000/300/` = SFC to FL300；`2510N12130E001` = 中心點 + 1nm 半徑
2. **多邊形 NOTAM**：複雜禁航區會列多個座標點，但**沒有標準格式**，每國略有差異
3. **時間有效性**：B-line（生效）+ C-line（失效），需即時過濾
4. **語言**：CN / TW NOTAM 含中文 free-text，得 LLM 輔助理解

**現成 parser**：
- npm `notam-parser`（社群維護，覆蓋 80%）
- Python `NotamParser`、`pynotam`
- 商用：FAA Pilot Web 直接提供 JSON/XML

**實作建議（如果真要做）**：
1. 寫 cron job（如每小時）抓 CAA + CAAC NOTAM HTML / PDF
2. 用 `pynotam` 解析 Q-line + E-line free text
3. 抽出 active 時段 + lat/lng + 半徑/多邊形
4. 存到 `public/airspace/notam/active.geojson`，前端依 timeline 顯示
5. **歷史 NOTAM**：除非自己 archiving，不然只能拿到當下生效的；對你「看 2026/02 歷史資料」沒用

**工作量**：~3-5 天（爬蟲 + parser + 資料管線 + UI）

### 3. 台灣的動態禁航區

✅ **有！** 已抓的 `taiwan_airspace.geojson` 裡 27 個 RCR 限航區裡，多數是**永久但有時段限制**：

| RCR | 時段 | remarks 抽取 |
|-----|------|--------------|
| RCR6（屏東基地）| **每日 2300-0200, 0600-0900 UTC** | 已抽取顯示在 InfoCard "🕐 限航時段" |
| RCR2 / RCR3 / RCR5 / RCR7~50 等大多數 | **晝夜連續限航** | 顯示 "24/7 限航" |
| RCR 東沙、南沙 | H24 | 顯示 "24/7 限航" |

這些**已經在現行系統可看**，點空域就會顯示時段。屬於「**永久區域 + 動態啟用**」混合型。

**台灣真正的動態禁航**（NOTAM 才有）：
- 軍演期間擴大的訓練空域（如漢光演習、聯翔演習）
- 總統出訪 / 元首接機臨時禁航
- 自然災害應變區（颱風、地震救災）
- 特殊活動（國慶煙火、跨年、F-16 飛行表演）

**這些都得從 CAA NOTAM 抓**，方法同 §2。

### 結論建議

| 你想要 | 做哪個 | 投資 |
|--------|--------|------|
| 只是看「為什麼台海航班這樣繞」 | 改做 ATC Airways 圖層（M503 / W121 等），比禁航區更有解釋力 | 中 |
| 看歷史大事件（Pelosi、聯合利劍）視覺化 | 手建 PLA 演習 GeoJSON + 日期感知顯示 | 小 |
| 看現在生效的 TW NOTAM | 寫 CAA NOTAM 爬蟲 + parser | 大 |
| 全自動歷史 + 即時 | NOTAM archiving（每天爬 + 入庫）| 巨大 |

**目前的系統已經完整顯示「永久 AIP 含時段」資料**（含台灣 RCR 的 24/7 與時段限航），這已經涵蓋了 70% 的「真實禁航區」需求。剩下的 30%（演習、總統行程、突發）才需要動態 NOTAM。
