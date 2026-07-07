# 單一機場深度分析 — 規劃

**狀態**：規劃中（2026-04-24）
**分支**：尚未開
**目的**：讓 Sidebar 能針對單一機場（或 set）做多維度分析與視覺化分類。

---

## Phase 0：資料補齊 ✅ 已完成（2026-04-24）

- [x] `fetch-tracks.ts` 擴充 `FlightOutput` 存 7 個 FR24 metadata
- [x] `src/types/index.ts` `Flight` interface 加 7 個 optional 欄位
- [x] `scripts/oneoff/backfill-metadata.ts` 把 flight-list.json JOIN 回歷史 JSONL
- [x] 1,049 檔 / 56,469 行全數補齊（0 miss，零 API credits）
- [x] `npm run typecheck` 通過

**新欄位**：`flight_number`, `operating_as`, `painted_as`, `hex`, `dest_icao_actual`, `first_seen`, `last_seen`

---

## Phase 1：建分類對照表（資料層）

### 1a. 機型分類資料庫 `src/data/aircraftDatabase.ts`
```ts
{
  "A359": { category: "widebody",   wake: "H", seats: 325, manufacturer: "Airbus" },
  "A320": { category: "narrowbody", wake: "M", seats: 194, ... },
  "P8":   { category: "military",   wake: "M", ... },
  ...
}
```
- 分類：widebody / narrowbody / regional / bizjet / prop / heli / military / cargo / other
- 資料來源：FAA aircraft-types 開源 JSON、或手工整理常見 100 型
- Wake Turbulence：H(eavy) / M(edium) / L(ight)

### 1b. 航空公司對照表 `src/data/airlineDatabase.ts`
```ts
{
  "CAL": { name: "China Airlines", country: "TW", brandColor: "#c8102e", type: "fullservice" },
  "EVA": { name: "EVA Air",        country: "TW", brandColor: "#1e7040", type: "fullservice" },
  "CPA": { name: "Cathay Pacific", country: "HK", brandColor: "#006564", type: "fullservice" },
  "FDX": { name: "FedEx",          country: "US", brandColor: "#4d148c", type: "cargo" },
  ...
}
```
- 維度：name / country / brandColor / type(fullservice/lowcost/cargo/charter/military/private)
- 範圍：先補 JSONL 裡出現的 Top 100 operating_as（佔 95% 流量）

### 1c. 飛行用途分類規則 `src/data/flightPurposeRules.ts`
啟發式分類（無官方欄位，靠規則推斷）：
- **軍用**：hex 落在軍用區段（US AE0000-AFFFFF / RU 140000-1FFFFF）、callsign 含 "ARMY"/"NAVY" 等
- **訓練**：aircraft_type 在訓練機列表（DA40/DA42/C172…）
- **貨運**：operating_as 的 airline type == cargo
- **包機**：painted_as ≠ operating_as 且兩者皆非商業航空
- **商業客運**：上述都不是

---

## Phase 2：UI 改造

### 2a. 修 `FlightStatsPanel` bug（急迫）
- 目前吃 `allFlights`，應該吃 `finalFlights`
- 改動點：`src/App.tsx:1287` 左右的 props 傳遞

### 2b. 新 icon「🔬 深度分析」
- 位於 IconRailSidebar，與 📍 / 🔗 互斥
- 開啟條件：選中某機場或某 set

### 2c. 分類維度 dropdown（colorBy）
- 按機型大小（widebody / narrowbody / regional / other）
- 按航空公司（Top 5 品牌色 + Others 灰）
- 按航線類型（domestic / regional / intercontinental）
- 按飛行時長（<1h / 1-3h / 3-6h / 6h+）
- 按飛行用途（商業 / 貨運 / 軍用 / 包機 / 訓練）
- 無（用現有 theme）

### 2d. 多條件篩選（multi-select）
- 機型 multi-select（chips）
- 航空公司 multi-select
- Toggle：只看跨洲 / 只看轉降 / 排除訓練機
- Range slider：飛行時長、起降時段

### 2e. 視覺化調整
- 點位大小：按機型大小自動縮放（widebody 最大、bizjet 最小）→ **需改 Three.js `InstancedOrbs`**
- 軌跡顏色：接到現有 `perFlightColorMap`（已支援）
- Legend：顯示分類 + 即時計數，可點 toggle filter

---

## Phase 3：收尾

- 預設組合（類似 SavedSets）：「一鍵看跨洲」「一鍵看軍用/政府」等
- 文字摘要：「過去 7 天 TPE 有 312 架次，68% narrowbody，主力 EVA/CAL 佔 38%…」
- Export：把分類結果匯出 CSV

---

## 未決議題

### Q1: operating_as 已補齊，AirlineFilter 要不要升級？
現在用 callsign regex，6.61% 誤差。應該在 Phase 2a/b 順手改成吃 `operating_as`。

### Q2: dest_icao_actual 歸檔問題
目前 JSONL 按 `dest_icao`（計畫降落）歸檔。要不要改按 `dest_icao_actual`？
- 影響：0.29% 航班（~83 筆）會從計畫機場搬到實際機場
- 建議：**不搬檔案**，在 UI 層顯示「計畫 vs 實際」標記即可

### Q3: Phase 1 分類對照表資料從哪來？
- 機型：FAA aircraft-types / ourairports.com / OpenFlights
- 航空公司：Wikipedia 整理 / 手工 Top 100
- **要討論**：要不要做成 JSON 可熱更新，還是直接 TS 檔

---

## Credits 消耗

- Phase 0：**0 credits**（純本地 JOIN）
- Phase 1-3：**0 credits**（純 UI/資料處理）

未來有 credits 要做的相關事（另一個 backlog）：
- 重抓舊 JSONL → 但 Phase 0 已經用 JOIN 解掉了，**不需要重抓**
