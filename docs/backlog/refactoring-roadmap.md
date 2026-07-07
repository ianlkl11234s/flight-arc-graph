# 重構規劃 Roadmap（Refactoring Roadmap）

> 建立日期：2026-06-12
> 狀態：規劃中（未動工）
> 範圍：資料管線、UI 狀態架構、比較/配色功能、效能、程式碼健康度
> 所有問題均已逐條對照程式碼驗證（file:line 為 2026-06-12 當下位置）

---

## 一、總診斷

專案經多次迭代疊加功能，目前「疊床架屋」的感受可歸結為 **三個根因**，
使用上的各種不直覺都是它們的下游症狀：

| # | 根因 | 下游症狀 |
|---|------|---------|
| R1 | **manifest 缺「資料目錄」**：不記錄機場是主動抓滿還是被動沾到、不記錄涵蓋日期 | 日期雜訊（杜拜看到 2/28、4/05 以外的零星資料）、1,400+ 機場主從不分、無法以「主機場狀態」為核心呈現 |
| R2 | **「Region」一詞三種語義重載**：地理分類 + 載入單位 + scope 階層混在一起 | 階層不直覺、看紐約三機場要繞路勾選、套組合時全量 dump 整個 region |
| R3 | **兩套配色/比較系統各自為政**：日期比較與機場分色獨立實作、互相禁用 | 顏色順序怪、調色不理想、Summary 數字與畫面對不上（雞肋感） |

---

## 二、已驗證的問題清單

### A. 資料層（對應根因 R1）

| ID | 問題 | 證據 |
|----|------|------|
| A1 | manifest.json 只有 `airports[ICAO]={flights,gzipBytes}` + `regions` + `totalFlights` + `generatedAt`，**沒有任何日期欄位** | `scripts/split-tracks.ts:142-152` |
| A2 | 前端已定義並嘗試讀取 `regionDates` / `regionFullDates`，但 manifest 從未寫入 → `getRegionDates()` 永遠回傳 `[]`（**死接口**） | `src/data/flightLoader.ts:236-244`、`src/hooks/useFlightData.ts:56-65` |
| A3 | 無欄位區分「主動抓滿」vs「被動沾到」的機場。1,406 個機場呈 power law：核心 ~100 座 vs 長尾（209 座只有 1 筆航班），全部混在同一清單 | manifest.json 全量統計 |
| A4 | 機場 JSONL 整檔下載、無日期分檔：RCTP=166MB、OMDB=89MB、WSSS=50MB。磁碟上是 plain .jsonl，壓縮靠伺服器 gzip | `public/tracks/airports/`、`src/data/flightLoader.ts:348-373` |
| A5 | 預設日期硬編碼 `"2026-02-18"`，availableDates 是載入後從 allFlights 即時算的，UI 無法區分「抓滿的日期」vs「零星沾到的日期」 | `src/hooks/useTimeline.ts:39-40`、`src/App.tsx:326-349` |

### B. UI 狀態架構（對應根因 R2）

| ID | 問題 | 證據 |
|----|------|------|
| B1 | Region 定義有兩套：`REGION_CONFIG`（App.tsx）與 `REGION_ICAO_MATCH`/`REGION_LABELS`（IconRailSidebar），語義重複 | `src/App.tsx:233-300`、`src/components/IconRailSidebar.tsx:812-833` |
| B2 | `applySavedSet` 強制 `setScope("region")` → 套「紐約三機場」會走 `loadRegionFullFlights` 載入**整個 region 所有機場**再前端篩選 | `src/App.tsx:551-575` |
| B3 | Saved sets 完全 hardcoded（5 組），無自訂/儲存機制（Tier 2 localStorage 規劃未實作） | `src/map/savedSets.ts:7-38` |
| B4 | 篩選管線五層串聯（allFlights → displayed → analysisFiltered → setFiltered → final），全在前端、無索引、timeline seek 觸發全量重算 | `src/App.tsx:468-606` |
| B5 | Dep/Arr toggle 在組合模式語義歧義：「dep」=從組合內任一機場起飛，無「組合內互飛/轉機」概念 | `src/App.tsx:600-606`、`src/components/DepArrToggle.tsx` |

### C. 比較功能與配色（對應根因 R3）

| ID | 問題 | 證據 |
|----|------|------|
| C1 | 「日期比較」與「機場分色」是兩套獨立系統，開啟 Compare 時機場分色被禁用，邏輯層未整合 | `src/App.tsx:494-510`、`src/types/airportColors.ts` |
| C2 | 機場分色**按航班數量由多到少**分配顏色，非按使用者選擇順序 → 「順序怪怪的」直接成因 | `src/types/airportColors.ts:90-94` |
| C3 | 🔶 **部分修**（2026-07-07 覆核）：`analysisFilteredFlights` 已接進管線（App.tsx:583 → finalFlights），但 Summary 面板仍吃 `displayedFlights`（App.tsx:1408）→ 開 Deep Analysis 篩選後 Summary 數字仍不同步 | `src/App.tsx:583, 1408`、`IconRailSidebar.tsx:2596` |
| C4 | `computeAirportComparison` hardcode 只統計 RC 開頭（台灣）機場，region 比較對其他區域全部失效 → 「數據比較雞肋/壞掉」直接成因 | `src/data/flightStats.ts:198-203` |

### D. 效能

| ID | 問題 | 證據 |
|----|------|------|
| D1 | **最大宗是資料量**：選一個機場動輒下載 89~166MB（見 A4），任何前端優化都不如按日期分檔有感 | 同 A4 |
| D2 | `perFlightColorMap` 變更觸發靜態 mesh **全量重建**（`forceRebuildStatic`），其實只需更新 color buffer attribute | `src/three/FlightScene.ts:181` |
| D3 | ✅ **已修**（2026-07-07 覆核）：`flightLoader.ts:169` 已有 `airportCache` + `regionCache`，切走再切回不重新下載 | `src/data/flightLoader.ts:169-171` |
| D4 | `BatchedTrails.ts` 寫好但零 import；目前每條動態 trail 是獨立 Line + material，draw call 隨數量線性增長 | `src/three/BatchedTrails.ts`（孤兒檔） |
| D5 | 無 code splitting，所有面板打進單一 bundle | `vite.config` 無 manualChunks |

> ✅ 已排除的疑慮：`removeStaticMeshes()` **已正確呼叫** `geometry.dispose()` / `material.dispose()`（FlightScene.ts:672-690），無 GPU 洩漏。tsconfig strict 全開、依賴健康、`public/tracks/` 確實不進 git（走 S3），這些都沒問題。

### E. 程式碼健康度與其他

| ID | 問題 | 證據 |
|----|------|------|
| E1 | God components：`IconRailSidebar.tsx` 2,622 行（6 個面板擠一檔）、`App.tsx` 2,013 行（45 個 useState）— 2026-07-07 覆核仍在變大 | 行數統計 |
| E2 | ✅ **已解**（2026-07-07）：7 個一次性腳本（fetch-week.sh、fetch-tracks-week.sh、sync-s3-to-data.sh、backfill-metadata.ts、migrate-progress.ts、backup-to-s3.ts、fetch-japan-lax-batch.ts）已搬 `scripts/oneoff/`；`npm run s3:upload` 改指 upload-split-to-s3.ts；fetch-japan-lax-batch 歸為一次性後重複問題消失 | commit 9cd2d01 |
| E3 | .gitignore 的 `scripts/fetch-tracks*.log` 沒匹配到 `_fetch-tracks-shanghai.log`、`fetch-jp-lax-tracks.log`（目前 untracked 漂浮） | `.gitignore`、git status |
| E4 | 載入錯誤靜默吞掉（9 個 `catch { continue; }`），失敗時 UI 無回饋 | `src/data/flightLoader.ts` |
| E5 | 無 URL state：無法分享「某機場某日期」的連結；localStorage key 無統一管理 | 全專案無 pushState 用法 |
| E6 | 測試數量為 0 | 無 .test.ts |

---

## 三、重構方案（按投資報酬率分期）

### Phase 1：補齊 manifest 資料目錄（小工程，解最多痛）🎯 最優先

**只改 `split-tracks.ts` + 日期選單 UI**，manifest 每個機場加欄位：

```jsonc
"OMDB": {
  "flights": 1234,
  "gzipBytes": 9300000,
  "isCore": true,                                        // 主動抓滿 vs 被動沾到
  "dates": ["2026-02-25", "2026-02-28", "2026-04-05"],   // 有資料的日期（可附每日筆數）
  "fullDates": ["2026-02-28", "2026-04-05"]              // 抓「滿」的日期
}
```

- `dates` 可在 split-tracks 掃 JSONL 時順便統計（已在掃每筆航班，零額外成本）
- `isCore` / `fullDates` 來源：`docs/backlog/data-fetching-status.md` 的目標清單，整理成一份 `scripts/core-airports.json` config 餵入
- 同時把 flightLoader.ts 的死接口（A2）接活，或改成 per-airport 的 `airportDates`

**完成後直接解掉：**
- 選杜拜 → 日期選單只亮 2/28、4/05，其他日期灰掉/隱藏（問題 3 整組消失）
- 機場清單預設只顯示 ~100 座核心機場，長尾收進「全部機場」折疊區（問題 1a/1b 大幅緩解）
- 「以主機場狀態為核心」= UI 以 **core airport × full date** 為有效檢視組合

**驗收標準：** 選 OMDB 時日期選單只顯示其 fullDates；非 core 機場不出現在預設清單。

---

### Phase 2：Region 與 Scope 解耦、組合變一等公民（中工程，解架構心病）

把三層混合語義拆成兩個獨立軸：

| 軸 | 角色 | 值 |
|----|------|-----|
| **焦點（focus）** | 使用者決定「看什麼」 | 單機場 / 機場組合 / 整個 region |
| **載入策略** | 系統內部自動決定，使用者不感知 | 按 focus 選最小載入單位 |

具體工作：
1. **組合走 per-airport 載入**：選「紐約三機場」只載 KJFK+KEWR+KLGA 三個 JSONL（`loadAirportFlights` 機制已存在，讓 set 走這條路），廢除 `applySavedSet` 強制 region scope（B2）
2. **自訂 set + localStorage**（savedSets.ts 註解中的 Tier 2）：選機場與管理組合收進同一面板，不再跑兩個地方
3. **統一 region 定義**：合併 `REGION_CONFIG` 與 IconRailSidebar 那套（B1），region 降級為「機場清單的地理分組 + 預設相機」，不再承載 scope 語義
4. **Dep/Arr 語義改為「以焦點為錨」**：離開焦點 / 抵達焦點 / 全部，組合模式加「組合內互飛」標記（B5）

**驗收標準：** 選 3 機場組合的網路下載量 = 3 個 JSONL（非整個 region）；自訂 set 重整頁面後仍在。

**建議單獨開分支**（動到核心 state，影響面大）。

---

### Phase 3：統一比較與配色 + 修復統計（中工程）

1. **合併為單一「比較維度」概念**：`compareBy: 'none' | 'date' | 'airport'`，共用一套顏色分配器
2. **顏色按選擇順序分配**：第一個選的永遠拿第一色（改 `assignAirportColors` 排序依據，C2）
3. **Summary 面板改吃篩選管線末端**：`summaryFlights={finalFlights}`（或至少 analysisFilteredFlights），數字與畫面一致（C3）
4. **`computeAirportComparison` 去 hardcode**：依當前 region/set 的機場清單統計，而非寫死 RC 開頭（C4）
5. 配色變更只更新 color buffer attribute，不重建靜態 mesh（D2，順手做）

**驗收標準：** Deep Analysis 開篩選後 Summary 數字同步變化；EU region 的機場比較有資料；比較色序 = 選擇順序。

---

### Phase 4：資料按日期分檔（大工程，效能終極解）

在 Phase 1 的日期目錄基礎上，把機場 JSONL 改為按日期分檔：

```
tracks/airports/RCTP/2026-02-18.jsonl   （選一天只載一天）
tracks/airports/RCTP/index.json         （該機場的日期索引）
```

- 選 RCTP 單日從 166MB 降到 ~10-20MB，下載量降一個數量級
- split-tracks.ts 改輸出結構 + flightLoader 改載入路徑 + S3 同步腳本對應調整
- **依賴 Phase 1**（沒有日期目錄做不乾淨），建議等 Phase 1-2 穩定後再做

---

## 四、其他值得做的事（獨立於上述分期，可穿插）

### 高效益

| 項目 | 內容 | 成本 |
|------|------|------|
| 拆 god components | IconRailSidebar 2,486 行 → 按面板拆 6 檔；App.tsx 抽自訂 hooks（useFlightFilters / useAirportSelection 等） | 中 |
| URL state | `?airport=RCTP&date=2026-02-18` 可分享直達連結（目前零 pushState） | 中 |
| 載入錯誤回饋 | flightLoader 9 個靜默 catch → 失敗時 toast/banner 通知 | 低 |

### 低成本順手做

| 項目 | 內容 | 成本 |
|------|------|------|
| .gitignore 修正 | `scripts/*.log` 一行涵蓋所有 log（E3） | 極低 |
| scripts/ 整理 | 一次性腳本搬 `scripts/oneoff/`；fetch 系列抽共用 FR24 fetcher | 低 |
| localStorage 統一 | `storageManager.ts` 統一 key 前綴與版本 | 低 |
| 刪除或啟用 BatchedTrails.ts | 孤兒檔二選一：接上（trail 多時省 draw call）或刪掉 | 低 |
| 面板 lazy load | React.lazy 大面板，降初始 bundle | 低 |
| 機場資料記憶體快取 | ✅ 已具備（D3，2026-07-07 覆核） | 低 |

### 可延後

- 單元測試：建議「改到哪補到哪」（Phase 3 改 flightStats 時先補該模組），不一次全補
- ARIA / 無障礙：非核心使用場景，延後
- a11y 完整支援、SEO：同上

---

## 五、建議執行順序

```
Phase 1（manifest 目錄）─→ Phase 2（解耦，開分支）─→ Phase 4（日期分檔）
                     └→ Phase 3（比較/配色，相對獨立可穿插）
低成本順手做：隨時，建議跟著相關 Phase 的 commit 一起
```

**理由：** Phase 1 工程量最小但同時解掉問題 1(a)(b) 與 3(a)(b)(c)，且是 Phase 2/4 的地基。
Phase 3 與 Phase 2 幾乎不相依，可並行或穿插。

---

## 六、進度追蹤

| Phase | 狀態 | 分支 | 備註 |
|-------|------|------|------|
| Phase 1 manifest 目錄 | ✅ 完成（2026-06-13，待用戶驗收 + 上傳 S3） | `refactor/phase1-manifest-catalog` | 細項見 [refactoring-status.md](./refactoring-status.md) |
| Phase 2 Region/Scope 解耦 | ⬜ 未開始 | — | 建議獨立分支；含「非 preset 機場鏡頭跳轉」待辦 |
| Phase 3 比較/配色統一 | ⬜ 未開始 | — | |
| Phase 4 日期分檔 | ⬜ 未開始 | — | 依賴 Phase 1（已就緒） |
| 順手做清單 | 🔶 部分（.gitignore log 修正；2026-07-07 scripts 歸位 oneoff/ + s3:upload 指向修正 + 死檔清 196MB） | 同上 | |

### 2026-07-07 infra 收尾（不動顯示層）

- 航班清單遷移收尾：fetch-flights 新增 `scripts/flights/{ICAO}/{日期}.json` 分檔格式（過渡期雙寫 legacy），fetch-tracks 優先讀新格式、fallback legacy（commit a1bb8db）
- raw 備份 `unknown/` 桶修正：datetime_takeoff 缺值 fallback path 首點時間戳分桶
- scripts/ 歸位：7 個一次性腳本搬 oneoff/、`npm run s3:upload` 改指 upload-split-to-s3.ts（commit 9cd2d01，解 E2）
- 磁碟清理：flight-list.json.bak-before-rollback（54MB）+ flight-lists/（142MB）搬資源回收桶（grep 確認現行管線零引用）
- 待辦接力：跑過一輪完整 fetch 後，可拿掉 fetch-flights 的 legacy flight-list.json 雙寫
