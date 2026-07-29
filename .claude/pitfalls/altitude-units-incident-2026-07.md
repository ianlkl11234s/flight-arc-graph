# 高度單位事故（2026-07-27 ~ 07-28）

一次用戶回報（「All Taiwan 軌跡壓扁」）連環挖出三隻蟲。全部已修復並部署，這裡記現象/根因/對策供未來對照。

## 蟲 1：高度單位混用 + 前端 heuristic 雙重轉換（主案）

**現象**：region / World scope 軌跡壓扁貼地（~10.8 倍）；airport scope 看似正常。

**根因鏈**：
1. FR24 flight-tracks 的 alt **一律英呎**，且恆為 25 ft 倍數（1.09M 點實測 100%）。
2. `fetch-tracks.ts` 舊碼 `alt > 1000 ? round(alt*0.3048) : alt` → ≤1000 ft 的點以生英呎落地，同一條 path 混用兩種單位。
3. 前端 `fixAltitudeUnits()` heuristic（為遮 2 而生）用「相鄰點跳動 >200」觸發：
   - 密集路徑：起飛段 `prev=0` 時 `jumpConv < jumpRaw*0.5` **恆成立** → 99.8% 航班被改動、23-44% 巡航被單次誤轉。
   - LOD 稀疏路徑（點距數分鐘）：正常爬升相鄰差必 >200 → 正反雙掃全誤觸發 → **雙重 ×0.3048**。

**對策**：
- 腐蝕是確定性函數 → 用 25 ft 量化特性**精確反解**（`scripts/oneoff/migrate-alt-units.ts`，判別式 + 4 歧義值 {450,625,800,975} 鄰點裁決）。⚠️ 非冪等，marker `public/tracks/.alt-units-migrated` 守門，**絕不可重跑**。
- fetch-tracks 改無條件轉換；前端 heuristic 整個刪除；split-tracks 加 alt >16,000m 警示。

**教訓**：
- 單位轉換**在資料落地那一刻做對**，不要落地存疑再用 heuristic 遮。
- Heuristic 的觸發條件要對「取樣密度」做假設檢查 —— 同一函式餵 LOD 稀疏資料直接災難。
- 除錯方法論：離線推理（弦線假說 0.7×）解釋不了 10× 級的症狀時，**live A/B 鎖變因**（同相機/同時間/同日期切 scope）直接定位到層。

## 蟲 2：retry-failed-tracks 寫壞格式

**現象**：3,603 份記錄（1,803 班）path 第 4 欄是**地速不是 unix ts**、高度生英呎沒轉換。KLGA 91%、KEWR 77% 整檔中獎。

**根因**：舊 retry 腳本 `[lat, lon, alt, spd]` mapping 拿錯欄位、漏轉換。

**對策**：高度由遷移腳本救回（全段 ×0.3048）；時間戳救不回（寫入時就丟了）→ `scripts/oneoff/refetch-retry-broken.ts` 重抓 1,803 班全數成功（72,120 credits，FR24 五個月歷史軌跡可得）。識別法：`path 第 4 欄 max < 1e9`。

**教訓**：兩支腳本寫同一批 JSONL，**輸出契約必須同一份程式碼**（或至少對齊測試）。retry 腳本當時沒人驗過輸出格式。

## 蟲 3：no-ICAO 靜默丟棄（審計挖出）

**現象**：track-done 54,644 vs 實際資料 54,533，差 111 筆 —— 錢花了、資料沒存、還標記完成。

**根因**：`writeFlightToJsonl` 對兩端 ICAO 皆空的航班（未申報公務機/直升機）迴圈跑 0 次一行不寫，上層仍無條件 `markDone`。

**對策**：抓取前跳過並記 `scripts/track-skipped-no-icao.ndjson`（0 credits）；寫入零目標改 throw。111 班沉沒認列（~4,440 credits）；flight-list 尚有 3,568 筆同型會被自動跳過。

**教訓**：「花錢的操作」與「標記完成」之間的每一步都要能 fail loudly；ledger 對帳（done 數 vs 資料數）是抓靜默丟失的唯一方法，值得定期跑。

## 部署陷阱（兩個，都已修）

- `pull-from-s3.sh` 對已存在 airport 檔 **skip-if-exists** → 資料整批更新時必須 `--force-airports`（已加旗標）。
- 機場 ICAO regex `[A-Z][A-Z0-9]{3}` 吃不到**數字開頭**代碼（65GA）→ 放寬為 `[A-Z0-9]{4}`。
- 另：`upload-split-to-s3.ts` 原本 state 只在結尾落盤，中斷 = 白傳 → 已改每 50 檔落盤。

## 相關

- 完整敘事：auto-memory `project_altitude_units_migration.md`、journal 2026-07 兩條
- 驗收證據截圖：session scratchpad `fix_airport/fix_region/prod_region.png`（暫存，重要的是結論已入文件）
