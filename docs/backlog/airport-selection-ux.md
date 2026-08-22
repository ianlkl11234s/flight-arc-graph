# 機場／區域選擇 UX — 2,300 座規模下的重新設計

> **建立**：2026-08-22 ｜ **狀態**：規劃中，尚未實作
> **起因**：Top-1000 戰役讓機場數從 1,594 → **2,303 座**（2026-08 週期），既有選擇 UI（141 座相機 preset + 8 個以台灣為中心的 region）撐不住。
> **這份文件是新 session 的開場入口**：讀完這份就能開工，不必重新盤點。
> **與既有規劃的關係**：本文是 [`refactoring-roadmap.md`](refactoring-roadmap.md) **Phase 2「Region 與 Scope 解耦、組合變一等公民」**的實證補充 + 規模壓力更新。Phase 2 的架構主張（focus / 載入策略兩軸分離）仍然有效，本文補上「2,300 座之後才浮現」的部分。

---

## 一、關鍵事實（2026-08-22 實測，非估計）

### 1. 完整度 metadata 是錯的（低報 2.5 倍）

`scripts/core-airports.json` 由 `build-core-airports.ts` 產生，但它**只讀 legacy 的 `scripts/flight-list.json`**；Top-1000 戰役的班表在新格式 `scripts/flights/{ICAO}/{date}.json`，完全沒被算進去。該檔最後產生於 **2026-06-11**，戰役是 7–8 月的事。

用專案自己的規則（該日 `done ≥ 50` 且 `done/scheduled ≥ 0.8`）對「新格式 ∪ legacy」重算：

| 口徑 | 座數 |
|---|---|
| manifest 目前標 `complete`（過期） | 74 |
| **實際「至少一天抓滿」** | **191** |
| 2026-02-18 當天抓滿 | 189 |
| 2/18 零缺口（≥50 班且 100%） | 63 |

2/18 全 2,303 座完成率分布：100% **705 座**（多為只有數班的小機場）、≥80% 341、≥50% 597、**<20% 1,522 座**（雙寫順帶織入的輻條）。

> 重算方式：`python3 scripts/oneoff/coverage-audit.py`（本次為此寫的稽核腳本，唯讀、不改任何檔）。

### 2. `other` / `world` 已是最大桶

| region | 機場數 | 軌跡數 |
|---|---:|---:|
| **other（=UI 的 World）** | **1,213** | **59,552** |
| US | 662 | 46,284 |
| CN | 209 | 21,300 |
| JP | 78 | 7,613 |
| UK | 75 | 4,806 |
| TH | 33 | 3,431 |
| TW | 17 | 14,801 |
| KR | 15 | 3,337 |
| HK | 1 | 1,878 |

`other` 的內部組成（按 `airport-points.geojson` 的 continent）：AS 429 座/28,812 筆、EU 346/19,239、NA 180/4,948、AF 149/3,545、OC 61/2,462、SA 29/484。
top 國家（軌跡數）：IN 6,159｜AE 4,590｜DE 3,334｜FR 3,084｜ES 2,993｜VN 2,576｜CA 2,501｜SA 2,379｜AU 2,276｜SG 2,065｜TR 1,962｜PH 1,901。

現行 region 是「以台灣為中心」的舊分類，**歐洲、印度、東南亞、中東、澳洲、南美、非洲全部沒有歸屬**；而 `world` 的預設機場是 `LPMA`（馬德拉，葡萄牙離島）——`App.tsx:364-371`。

---

## 二、UI 現況盤點（2026-08-22，附行號）

### A. Region / Scope 層

- 型別：`src/types/index.ts:69` → `"TW"|"JP"|"HK"|"KR"|"TH"|"US"|"UK"|"CN"|"world"|"all"`
- UI：`src/App.tsx:1667-1699` Region Pills，10 顆單層平鋪，無搜尋、無巢狀
- **ICAO→region 判斷全專案有 8 份 hardcode**：
  1. `scripts/split-tracks.ts:126-137` `getRegion()`（build-time 權威，未命中回 `"other"`）
  2. `scripts/pull-from-s3.sh:90` 下載清單字串陣列
  3. `src/App.tsx:272-277` `KNOWN_REGIONS` / `isKnownRegion` / `isChinaIcao`
  4. `src/App.tsx:292-381` `REGION_CONFIG[*].icaoMatch` — **死程式碼**（全專案零呼叫）
  5. `src/App.tsx:726-741` `regionalAirports` prefix map（只餵機場配色）
  6. `src/components/IconRailSidebar.tsx:877-904` `REGION_ICAO_MATCH` / `REGION_LABELS`（側欄清單分組實際用的）
  7. `src/data/flightLoader.ts:399-416` `REGION_PREFIXES` / `icaoMatchesRegion()`（決定撈哪些軌跡的 fallback）
- **已存在漂移**：`App.tsx:272` 的 `KNOWN_REGIONS` 缺 `RK`（韓）/`VT`（泰），與 `App.tsx:736-737`、`IconRailSidebar.tsx:877` 不一致；因 #4 是死碼才沒爆。
- **world 與 all 的定義在三層各不相同**：資料層 `flightLoader.ts:427-435` 兩者讀同一個 `regions/all.jsonl`（選 World 實際載到全球）；fallback 層 `REGION_PREFIXES` 沒有 `world` key → 撈 0 座；側欄層用「排除 8 個具名 region」的排除法。

### B. 機場選擇層

- `src/map/cameraPresets.ts`：`CAMERA_PRESETS` 146 筆，其中 **141 座真實機場** + 5 個虛擬總覽相機（`*_OVERVIEW`）。結構只有 `{name, icao, center, zoom, pitch, bearing}`（`types/index.ts:36-43`），**無 country / continent / rank**。
- 桌面側欄 `IconRailSidebar.tsx` 的 `LocationsPanel`（906-1182）：依 region 分組的捲動清單；日本另有 Major/Regional/Local/Special 四層 hardcode（1003-1010）。有搜尋框（1052-1069，吃 manifest 全部 2,303 座，比對 ICAO/IATA/中文名），結果分 core/tail 兩段、**各上限 30 筆**；非 preset 機場歸「其他機場」區塊，**硬上限 `OTHER_CAP = 30`**（967-982）。
- **手機版 `src/components/AirportSelector.tsx:21-38`**：原生 `<select>`，直接吃 `getManifestAirports()`（`flightLoader.ts:271-273`，2,303 座依 ICAO 字母排序），**不分區、不分完整度、無搜尋**。
- 選機場**不連動日期**（`App.tsx:649-653` `selectAirportSingle` 只設 `selectedAirport`）→ 選到冷門機場常直接看到「此日期範圍無航班資料」。
- 無 preset 的機場靠 `cameraForAirport()`（`cameraPresets.ts:1382-1401`）依座標現算相機。

### C. 多機場組合（Saved Sets）

- `src/map/savedSets.ts`：`BUILTIN_SETS` 5 組全 hardcode（`eu-lhr` 7 / `tw-intl` 3 / `apac-hub` 6 / `transatlantic` 4 / `london-cluster` 5）。Tier 2（localStorage 自訂）尚未實作。
- `SetsPanel`（`IconRailSidebar.tsx:1281-1456`）的勾選清單**只來自 `CAMERA_PRESETS`**（1312）→ **只能勾 141 座**，其餘 ~2,160 座在組合模式完全不可及；且無搜尋框。其 region 分組列表（1309）缺 `"CN"`（目前無中國 preset 才未爆）。

### D. 完整度資訊有兩套、且沒進選擇 UI

- manifest：`{flights, gzipBytes, isCore, dates, fullDates}`。UI 只用 `isCore`（布林）→ `AirportButton`（825-875）非 core 顯示 `◐ N` + hover「被動收集，資料不完整」；選中時側欄頂部橘色提示（1071-1087）。
- `airport-points.geojson`：2,623 筆，含 `status`（complete/core-partial/partial/planned）、`rank`、`capturedFlights`、`estDaily`、`country`、`continent`。
- **`src/data/airportMeta.ts:12-19,30-39` 解析時把 `status`/`rank`/`capturedFlights`/`estDaily` 全部丟棄**，選擇 UI 拿不到。`country`/`continent` 有留但只用在 Atlas hover tooltip（`App.tsx:82`），清單/搜尋沒拿來分組。
- `src/map/atlasGlowLayer.ts:5-14,34,50` 是唯一讀 `status` 的地方（Atlas 星圖 completeness 上色）。但**點 Atlas 光點只跳 popup**（`App.tsx:997-1030`），不會選取機場、不切 scope。
- **347 座 `planned`** 無軌跡 → 不在 manifest → 搜尋/清單完全找不到，只能在 Atlas 上看到灰點。

---

## 三、建議方案（優先序）

### P0 — 資料層前提（不做這些，UI 改了也沒依據）

**① 重建完整度 metadata**
- `build-core-airports.ts` 改讀「`scripts/flights/` ∪ `flight-list.json`」聯集（比照 `fetch-tracks.ts` 的作法）→ 重跑 → `split-tracks.ts --manifest-only` 重建 → `complete` 74 → **189 座**
- `airportMeta.ts` 停止丟棄 `status`/`rank`/`estDaily`，讓選擇 UI 能排序、篩選、標徽章
- 驗收：manifest 裡 KORD/ZUTF/VIDP/MMUN/OPKC 的 `fullDates` 含 `2026-02-18`

**② Region 重切 + 收斂成單一 SSOT**

拆 `other` 的建議切法（依上方實測分布）：

| 新 region | 機場數 | 軌跡數 |
|---|---:|---:|
| EU 歐洲（英國外） | 346 | ~19,200 |
| ME 中東 | ~90 | ~9,000 |
| SEA 東南亞（越/馬/印尼/菲） | ~150 | ~8,000 |
| IN 印度 | ~40 | ~6,200 |
| AF 非洲 | 149 | ~3,500 |
| OC 大洋洲 | 61 | ~2,500 |
| CA 加拿大 | ~50 | ~2,500 |
| SA 南美 | 29 | ~500 |

⚠️ 動 region 前**必須先把 8 份 hardcode 收斂成一份共用定義**（前端與 scripts 共用），否則必再漏（UK、CN 都漏過；`pull-from-s3.sh` 的 `for R in ...` 是消費端，新增 region 一定要同步）。順手刪 `REGION_CONFIG[*].icaoMatch` 死碼、修 `KNOWN_REGIONS` 缺 RK/VT。
⚠️ 新增 region 會增加 `regions/*.jsonl` LOD 檔數量 → S3 上傳量與 Zeabur 拉取檔數同步變多。
⚠️ `world` 的預設機場要從 LPMA 換成有意義的入口。

### P1 — 選擇 UI

**③ 搜尋優先取代瀏覽清單**：解除 `OTHER_CAP = 30` 與搜尋 30 筆上限（虛擬滾動或分頁），結果依「完整度 → 航班數」排序，每項掛徽章（● 完整 / ◐ 核心 / ○ 部分 / · 無資料）
**④ 手機版換掉原生 `<select>`**：與桌面共用同一套搜尋清單
**⑤ SetsPanel 解除 preset 限制**：改吃 manifest + 搜尋（對應 roadmap Phase 2 的「組合變一等公民」）

### P2 — 體驗

**⑥ Atlas 星圖點擊 = 選取機場**（投報最高）：2,623 點的全球星圖本來就是 2,300 座機場最自然的選單，點光點 → 選機場 → **自動跳到該機場有資料的日期**（補上目前選機場不連動 `selectedDate` 的缺口）
**⑦ `planned` 347 座的去留**：搜尋中顯示為灰色不可選項，或從 Atlas 拿掉 —— 別讓人看得到卻選不到

### 建議順序

**① → ② → ⑥ → ③④⑤**。①②是地基（風險低），⑥是最高投報體驗改動，③④⑤把長尾真正變可用。

---

## 四、新 session 開場

1. 讀本檔（就是這份）
2. 想驗證數字：`python3 scripts/oneoff/coverage-audit.py`（唯讀，0 credits）
3. 架構背景：[`refactoring-roadmap.md`](refactoring-roadmap.md) 的 Phase 2 段落
4. 已知的 set × region 耦合痛點與三個候選方案：見記憶 `project_airport_set_region_coupling.md`（用戶當時對 A/B/C 三案都「感覺怪怪的」，未拍板 → **不要擅自套用，先問**）
5. 資料抓取那條線不在本題範圍 → [`data-fetching-status.md`](data-fetching-status.md)
