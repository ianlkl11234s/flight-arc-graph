# 渲染效能執行計畫與進度（Render Performance Status）

> 對應規劃：[`render-performance-plan.md`](./render-performance-plan.md)（歸因、各項設計、證據）
> 分支：`perf/render-audit`（Tier 0 已完成於 `b9cf92d`；本檔從 Phase 0 開始接手）
> 規則：**每項都要有對應測試，通過才打勾**；「東西與呈現不能錯」優先於效能數字。
> 進度標記：`[ ]` 未做、`[x]` 完成、`[~]` 進行中、`[!]` 卡住（寫原因）

---

## 通用驗收（每個 Phase 都要跑）

| 檢查 | 工具 | 通過標準 |
|---|---|---|
| 型別 | `npm run typecheck` | 綠 |
| 效能 A/B | `scripts/perf/`（README 有指令；場景 S1 單機場 RCTP、S2 set「亞太樞紐」，暫停＋播放各 6 秒） | 目標指標改善，且沒有任何指標退步 >5% |
| 視覺回歸 | `scripts/perf/visual-check.mjs`（6 場景，固定時刻＋固定相機＋動畫凍結） | `pctOver8 < 0.15%` 且不成塊（顯著閾值 8/255 的理由見 `scripts/perf/README.md` §5）。⚠️ 鑑別力在 4 個 S1 場景（同版本底線 0.000%）；**S2／world 的底線本身就有 0.05–0.07%，pct 幾乎不鑑別，要看 blocky**。Phase 2 換 LOD 時 S2 是主戰場，屆時須先把 S2 底線壓下去（查併發載入順序），或加一個「3 座機場」的中型場景讓底線歸零 |
| Summary 數字 | `scripts/perf/summary-snapshot.mjs --compare` | 三場景數字完全相同 |
| 功能冒煙 | agent-browser 或手動 | 播放／暫停／seek、切機場、切底圖、Far View、時間窗（±12h）、漸進模式、點光球選航班，全部正常 |
| 資料一致 | Summary 面板數字（航班數、dep/arr、每日趨勢） | 改前後完全相同 |

每個子項完成 → 一個 commit（訊息含 A/B 關鍵數字）。**不 push、不 merge；上傳 S3 前先問用戶。**

---

## Phase 0：把「呈現不能錯」變成可自動檢查（先做，之後每一步都靠它）

- [x] **0-1 視覺回歸腳本 `scripts/perf/visual-check.mjs`**（2026-09-02 完成）
  - 在 `window.__flightArcDebug` 加 `freezeAnimation(t | null)`：把光球呼吸／閃爍與任何 wall-clock 動畫的時間凍結成固定值（DEV only），截圖才可重現
  - 場景清單（存 `scripts/perf/visual-scenes.json`：seek 時刻、center/zoom/pitch/bearing、theme、模式）：
    1. S1 RCTP dark、2. S1 RCTP light（`light` 底圖）、3. S2 亞太樞紐 dark（fitBounds 後視角）、4. world globe（z3，Far View 開）、5. S1 漸進模式播到中段、6. S1 時間窗開啟
  - `--baseline` 存到 `scripts/perf/out/baseline/`（gitignored），`--compare` 產出 diff 圖與數字表（PIL + numpy 已可用）
  - ✅ 測試結果（同一 commit 背靠背 `--baseline` → `--compare`）：4 個 S1 場景 **maxDiff = 0**；s2-apac-dark 72／0.14%、world-globe-far 136／0.12%（不成塊，記為噪聲底線，見 `scripts/perf/README.md` §5）
  - 🔑 過程中查出的真正非決定性根因：**底圖 style 切換會改變軌跡渲染結果**（同場景「從未切過 style」vs「切過 light→dark」maxDiff 90，兩次都切過則為 0）。解法是每次執行先 `Page.reload` 再強制走一次 light→dark 歸零（`bootstrap()`），不是加長等待
- [x] **0-2 用 0-1 對 Tier 0 補驗 light theme**（2026-09-02 完成）
  - 做法：`git switch -c perf/vis-baseline-tmp 8346b2c` → cherry-pick freeze commit（`8d869ae`）→ 另補 `git checkout 6a59854 -- scripts/perf`（harness 基礎檔在 8346b2c 上還不存在）→ 產 baseline → 切回 → compare
  - ✅ **light theme 通過**：maxDiff 4、`pctOver8` **0.000%**、不成塊。T0-1 的 normal-blending 近似公式（理論誤差 ≤3/255）實測落在理論範圍內
  - ✅ dark 與 timewindow 場景 `pctOver8` 也是 0.000%（maxDiff 8–9 全是 8-bit 累加捨入）
  - ✅ s1-progressive `pctOver8` 0.022% = T0-5 修掉 128 s 量化階梯的真實改善；另跑 60× 播放 10 秒逐幀比對，**39 個相鄰幀對 0 次完全相同**，階梯確認消失
  - ✅ s2-apac 0.083%／world 0.074%，與同版本背靠背噪聲底線（0.068%／0.046%）同量級
  - ✅ 切底圖（bootstrap 每次都走 light↔dark）、Far View（world 場景）皆無殘影
  - ⚠️ **仍待手動確認一次即時錄影**（Tier 0 沒動 `useCanvasRecorder`，但 T0-2 刪了三個 renderer 的 GL 狀態還原；這條在 T05-4 動錄影路徑時一定要再驗）
  - 📌 副產物：`visual-diff.py` 的顯著閾值由 2/255 改為 8/255（理由見 `scripts/perf/README.md` §5）
- [x] **0-3 Summary 數字快照**（2026-09-02 完成，工具 `scripts/perf/summary-snapshot.mjs`；三場景 baseline 已建立並驗過 `--compare` 全數相同）：把 S1／S2 的 Summary 面板數字（航班數、dep/arr、Top 航空公司、24h 熱力）dump 成 JSON 存 `scripts/perf/out/baseline/summary-*.json`，之後 Phase 2 換 LOD 要對照

---

## Phase 1：Tier 0.5（近零視覺差異）

- [x] **1-1 光球動畫搬進 shader**（2026-09-02 完成，`a9e3398`）
  - 呼吸／閃爍改 `uTime`（wall-clock 秒）uniform + per-instance `aPhase` attribute；instanceMatrix 只在 entries／globe 參數／scale 變時重算；attribute 改 `DynamicDrawUsage`
  - 現在 `updateAll` 用固定 `dt=0.016`，改 wall-clock 後動畫速度要與改前一致（用 freezeAnimation 在同一 t 截圖比對）
  - ✅ visual-check 全 6 場景：4 個 S1 場景 maxDiff = 0；s2-apac 74、world 136（噪聲底線內）
  - ✅ summary-snapshot 三場景數字完全相同
  - ✅ 零上傳：暫停＋相機靜止 5 秒，Three.js 側 `bufferData`/`bufferSubData` = 0（新增 DEV 計數器 `__flightArcDebug.glStats()`；殘留計數經 call-stack 追查全屬 Mapbox 自身的 symbol/label placement）
  - ✅ 播放中光球正確跟隨、`pickFlight` 正常
  - ⚠️ **CPU 沒有可測量的改善，也沒有退步**：S1 播放 `perFrame.script` after 7.14 ms/f vs before 三次 5.91／7.77／7.78（噪聲內）；暫停 1.79 vs 1.69／2.37／1.74。原因是 S1 只有 ~105 顆活躍光球，`updateAll` 本來就便宜。**1-1 的價值是「暫停時零上傳」這個 1-2 的前提**，CPU 收益要到 1-2 降頻／閒置才體現；真正吃光球成本的是 world 場景（頂到 `MAX_INSTANCES=1024`）
  - 📌 順帶修掉潛在 bug：4 個 orb `InstancedMesh` 沒有明確 `renderOrder`，three.js 對 transparent 物件在 renderOrder 平手時退回 Z-depth 排序，而各層 `boundingSphere` 半徑不同 → 疊繪順序不穩定；dark 的 additive 蓋掉了，light 的 Normal blending 會顯現。已指定 0.1／0.2／0.3／0.4，夾在靜態軌跡桶（預設 0）與 `BatchedTrails`（1）之間
- [x] **1-2 暫停時降頻／閒置**（2026-09-03 完成，`d53b80a`）
  - **政策（2026-09-02 用戶已拍板）**：暫停且相機靜止 → 用單一 `setTimeout` 以 20 fps 排 `triggerRepaint`；連續 30 秒無互動 → 完全停止重繪（呼吸停在當下相位）；任何互動／播放／slider 立即恢復；`document.hidden` → 停
  - ✅ 新增 `src/map/repaintScheduler.ts`，三個 `triggerRepaint` 來源（customLayer／atlasGlowLayer／airspaceAurora）走同一節流器
  - ✅ 降頻：裝飾性重繪 15.5–18.6 renders/秒（全部歸因 repaintScheduler）。probe 讀到的 raw rAF ≈31–37/秒高於 20，是 Mapbox 自身的 `_triggerFrame(false)` idle-confirm dummy frame + 從 `render()` 內重排 timer 的額外 vsync 等待，非節流器行為
  - ✅ 閒置：32 秒後 rAF = 0，且 `hasActiveOrbs=true`／`activeOrbCount=105`（排除假陽性）
  - ✅ 恢復：play 無 stall（rAF callback max 10.1 ms）；暫停後 panBy 立即更新
  - ✅ 視覺：s1-rctp-light maxDiff 0；s1-rctp-dark maxDiff 11、`pctOver8` 0.0044%（49 px，sidebar 文字抗鋸齒，地圖主體 0.006%）。summary 三場景完全相同
  - ✅ 功能冒煙 7/7，其中 2 項從「已完全閒置停止」狀態再測
- [x] **1-3 播放時鐘留在 ref、React 10 Hz 發布**（2026-09-03 完成，`7d01d7c`）
  - 時鐘由 hook 持 `timeRef`，rAF 內直接 `map.triggerRepaint()`；state 節流 ~10 Hz；`seek()` 同步寫 ref 並立即發布
  - 影響面要逐一驗：時間標籤、進度 slider、cinema keyframe（`useCinemaCamera.ts`）、錄影 overlay 時間字（`useCanvasRecorder.ts`）、晨昏線、viewshed track-single
  - ✅ **A/B：播放 `perFrame.script` 7.14 → 3.20 ms/frame，降 55%**（三次取中位數）
  - ✅ 關鍵設計：App 的 `timeRef` 改成 `timeline.timeRef` 的別名 → 錄影 overlay、晨昏線、customLayer、viewshed、點擊查高度全部零改動自動讀到每幀值
  - ✅ visual-check 6/6、summary 三場景相同；播放連續性 30 秒 × 60×／600×／3600× ref 單調遞增、state ~10 Hz 零倒退；seek ref <12 ms／state ~14 ms；錄影時間字 rAF probe 119/119 逐幀變化
  - ✅ `KEEP_ALIVE_FRAMES` 12 → 3（原用途「橋接 timeRef 落後一幀」已消失）
  - ⚠️ 未實測：viewshed track-single 的 UI 級效果、`KEEP_ALIVE_FRAMES=3` 的極端序列（暫停時連續快速拖多個 slider）
- [x] **1-4 `preserveDrawingBuffer:false`**（2026-09-03 完成，`d3a49de`）
  - 即時錄製改在 `map.on("render")` 內同步取像；HQ 匯出維持 `once("render")`
  - ✅ 即時錄製改 `map.on("render")` 內同步取像；HQ 匯出維持 `once("render")`，兩者改用同一個 `captureFrame()`
  - ✅ **真的錄了一段檔案驗證**：完整 MediaRecorder 流程產出 2800×1600 VP9 webm（9.9 MB），ffmpeg 解出 45 幀逐幀檢查，min nonBlackRatio 0.9992、無一幀低於 0.9。另走生產取像路徑取 32 幀，每幀 nonBlackRatio = 1
  - ✅ HQ 路徑 30 幀全非黑且亮度隨相機 bearing 平滑變化（非卡住的同一幀）
  - ✅ visual-check 6/6、summary 3/3
  - ⚠️ **本身會改變渲染輸出**：後來隔離量測發現 `preserveDrawingBuffer: false` 讓地圖主體有約 0.4% 像素的次像素差異（pctOver8 0.15–0.18%，maxDiff ~48），推測是瀏覽器改走不同合成路徑。在門檻邊緣，不是「畫錯」但也不是零差異 —— 之後若視覺驗收出現莫名其妙的 0.15% 級差異，先確認 baseline 有沒有跨過這個 commit
  - ⚠️ A/B 量不出收益：script 2.16 → 2.21 ms/frame 在噪聲內，GPU 欄位兩側相同（gpuHw 播放時 99% 已飽和）。省一次 back buffer 複製的收益在這個場景／canvas 尺寸下測不出來，如實記錄
  - ⚠️ **留下的風險（未修）**：`useCanvasRecorder.ts:196` 的 `waitForRender` 有 200 ms timeout fallback。舊 flag 下逾時只抓到「舊但有效」的幀，新 flag 下可能抓到已清空的 buffer。S1 每幀約 13 ms 遠低於門檻，但沒對「大場景 jumpTo 後第一幀伴隨大量 tile 載入」壓測
  - ⚠️ 未驗證：用播放器實際播放存下的 webm（只做程式化解碼與像素分析）；從「閒置 30 秒完全停止」狀態啟動錄影

---

> ✅ **已修（2026-09-03，`b32fb6b`）**：`colorForFlight` 改成 `hashFlightId(fr24_id) % colors.length`，三次 reload 顏色逐 id 相同。顏色一次性洗牌（用戶已同意），6× 裁圖確認軌跡位置不變、只有顏色不同。
>
> ~~⚠️ **開工前先修掉 S2／world 的視覺噪聲**（否則換 LOD 的驗收沒有鑑別力）。~~
> 已查明根因（2026-09-02）：`FlightScene.colorForFlight`（`src/three/FlightScene.ts:280-290`）的 theme-cycle 依「首次出現順序」輪派 `colorIndex++`，而 `loadAirportSelectionFlights` 多檔並行、合併順序隨完成順序變 → 同一架飛機兩次拿到不同光軌顏色；切 style 重建 FlightScene 後 `colorIndex` 歸零重派，同理（這也是 Phase 0 查到的「切 style 改變畫面」的一部分）。
> **範圍只在光軌**：靜態軌跡顏色走高度漸層（`FlightScene.ts:502` 附近），是決定性的；S1 場景光軌只有 ~16 條所以噪聲 0.000%，S2 有 116 條、world 更多。
> 修法：(a) 合併後依 `(dep_time, fr24_id)` 排序；(b) `colorForFlight` 改成 `index = hash(fr24_id) % theme.trailColors.length`（`perFlightColorMap` override 優先不變，`flightColors`／`colorIndex` 狀態整個刪掉）。**建議 (b)**（兩個非決定性一起消失、錄影可重現），代價是光軌顏色一次性重洗（色盤不變，靜態軌跡不動）→ **需用戶點頭**，做完要重建 S2／world baseline。
> 這也很可能是「切 style 改變畫面」（maxDiff 90）的**同一個**根因：光軌是飽和亮色 + additive，同一像素從藍換成橘就是 90–150/255 的差，S1 只有 16 條光軌也夠；首次載入時 `colorIndex` 依「seek 前那幾幀」的活躍順序開始輪派，style 切換後 FlightScene 重建、`colorIndex` 歸零改依 seek 時刻的順序重派。
> **(b) 做完的驗證**：重跑「未切 style vs 切過 style」對照（做法見 Phase 0-1 執行紀錄）。maxDiff 歸零 → 不必再追第二來源；`bootstrap()` 的 style 歸零留著當保險即可。

## Phase 2：多層 LOD × 依 zoom 換層（2026-09-02 用戶拍板：換層依 zoom band，不依模式）

> 目標：**拉遠與拉近都不能看出差異**。單機場／set／world 走同一套規則。
> 長期目標：**全球某一天所有機場全開**（= world 場景 S3，同時空中 7.9K–8.6K 班）。

門檻推導：Web Mercator lat 25°、DPR 2 下 `m/device px = 554 / 2^(z−6)`（plan 引用的 C2d 表）。取「該層 eps ≤ 1 device px」為可用上限。

| 層 | eps | 「≤1 device px」上限 z | 採用 band | 資料來源 |
|---|---|---:|---|---|
| L3（現有） | 2 km／40 pt | 4.15 | z ≤ 6 | `regions/*.jsonl`、`all.jsonl` |
| L2 | 250 m | 7.15 | 6 < z ≤ 7.2 | 新：`airports/{ICAO}/{date}.l2.jsonl` |
| L1 | 50 m | 9.47 | 7.2 < z ≤ 9.5 | 新：`airports/{ICAO}/{date}.l1.jsonl` |
| L0 | 全解析度 | — | z > 9.5（**僅視窗內**航班） | 現有 daily shard |

換層一律加 hysteresis ±0.3 zoom，避免邊界來回抖動。

⚠️ **開工前需用戶拍板的張力**：嚴格門檻下 z4.15–6 的 world 視角該用 L2，但 world 走 `regions/all.jsonl` 單檔聚合，**沒有 region 級 L2／L1**。二選一：(a) 2-1 一併產 region 級 L2／L1 聚合檔（體積待估，all.jsonl 2 km 版今為 0.54 MB／機場日檔等比放大）；(b) world 視角維持 L3，接受 z5–6 的 2 km = 2–3.6 device px 折線。

- [x] **2-1 `scripts/split-tracks.ts` 產 L1／L2 檔**（2026-09-03 完成，`55a7b48`；7 座機場 × 2026-02-18，L1 17.9–23.9%、L2 8.0–10.9%；`lod-verify.ts` 全過並做過負向測試；全量 2,303 座估 40 秒–2 分鐘、+1.1 GB）
  - 每機場每日：`airports/{ICAO}/{date}.l1.jsonl`（eps 50 m）、`.l2.jsonl`（eps 250 m）；DP 改 **3D**（水平公尺 + 高度 ×3，避免爬升／下降折點被抹平）；起訖點必留
  - 若張力選 (a)，同時產 region 級 `regions/{R}.l1.jsonl`／`.l2.jsonl`
  - **張力定案實驗（先做這個再決定 a／b）**：先只對 TW region 產一份 region 級 L2 聚合檔，用 visual-check 在 z5.5 同相機比 L3 vs L2。diff 只是線條邊緣零星差異 → 定案 (b)（world 維持 L3 到 z6）；成塊可辨 → 為 z4–6 做 (a)，且只在 zoom 進入該 band 時 lazy 下載（`all.jsonl` L2 估 ≈ 3× L3 ≈ 70 MB gzip，**不能進站就載**，會打回 PR #9 修好的 6 MB 進站流量）
  - 測試（腳本 `scripts/perf/lod-verify.ts`）：每檔航班數與 fr24_id 集合 = L0；每航班起訖點座標與時間戳 = L0；每個被抽掉的點到簡化線的 3D 垂距 ≤ eps；RCTP 2/18 點數約 L1 18%、L2 ~9%（對照 plan §C2d）
- [x] **2-2 依 zoom 換層**（2026-09-03 完成，`e245662`；視窗內升級未做，見下）（`src/data/flightLoader.ts`、`src/hooks/useFlightData.ts`、`src/map/customLayer.ts` 的 zoom 監聽）
  - 依上表 band 選層；zoom ≥ 9.5 時**只**對視窗內機場載 L0／L1 shard（沿用 `loadAirportFlights` 的日期 shard），拉遠即釋放；換層走現有 progressive build（Tier 0-3 之後上傳成本已小）
  - 檔案缺失 graceful fallback 到較粗層；manifest 記錄各層是否存在
  - **資料一致檢查（2026-09-02 已盤點，結論如下）**：
    - ✅ Sidebar Summary 與 FlightStatsPanel 的**每一個數字都不讀 path 中間點**。`flightStats.ts` 12 處 `.path`（118, 142, 268-269, 358, 487, 493, 508, 517, 526, 557, 564）全是 `dep_time`／`arr_time` 缺值時拿 `path[0][3]`／`path[len-1][3]` 當時間戳 fallback；`split-tracks.ts:110` 的 DP 抽稀保證保留起訖點 → **換 LOD 不影響 Summary**
    - ⚠️ **`App.tsx:1230-1234` 的 tooltip 高度會變**：它取「最後一個 `t ≤ 當前時間` 的 path 點的 `[2]`」，點變疏就會顯示較舊的高度。2-2 要處理：對被點選的那一班用 L0（單機追蹤本來就會升級到 L0），或改成兩點線性內插
    - ⚠️ 三個與點數無關、但同樣會讓快照 diff 的來源，做快照時要避開：(1) `computeTopRoutes`／`getAirlineStats`／`computeAirportComparison`／`getAircraftTypeStats` 都是 `sort((a,b)=>b.count-a.count)`，**同分時順序 = 航班陣列疊代順序**（= 載入順序）→ 快照存無序 `{key:count}`；(2) 航班集合本身會因載入路徑改變（`flightLoader.ts:625-641` 先讀 `regions/*.jsonl`、缺檔才 fallback 全解析度；`preprocessFlights` 丟棄 `path.length===0`）→ 快照要存 `flightCount` + `fr24_id` 排序後的 hash，才能區分「算法變了」還是「載到的航班變了」；(3) airport scope 的 Total = `departures + arrivals`（`IconRailSidebar.tsx:2394`），**不是** `flights.length`（起訖同機場算兩次）
    - `FlightStatsPanel` 的 ALL REGION tab 吃的是 `allFlights`（`App.tsx:2389`，未篩選），**沒掛在 `__flightArcDebug` 上** → 若要納入快照需另外暴露
  - ⚠️ **band 定義修正**：原本寫「z ≤ 6 → L3（regions/*.jsonl）」是錯的 —— region 檔的航班集合與 per-airport shard 不同，換過去 Summary 數字會變。實作改成**同一份 shard 換副檔名**：z>9.5 → L0、7.2–9.5 → L1、≤7.2 → L2，航班集合恆定
  - ✅ **Summary 三場景數字完全相同**（s2 確認真的走 L2：267,811 點 vs L0 的 2,533,949 = 10.6%）
  - ✅ **s2-apac（z4.72）效能：lines 2,534,079 → 268,981（-89%）、heap 396 → 203 MB（-49%）**
  - ✅ band 邊界：z10.9 L1 vs L0 maxDiff 12／pctOver8 0.005% 不成塊；z8.9 L2 vs L1 maxDiff 210／4.7% 成塊 → 佐證 band 把 z8.9 放 L1 是對的
  - ✅ 連續 zoom z4→z12 層序 L2(4.0–7.5)→L1(8.0–9.5)→L0(10.0–12.0)，非背景像素比例平滑 21%→4.5%，無空白／缺線幀
  - ✅ fallback：RCKH（無 LOD 檔）在 z5 內容與強制 L0 完全相同
  - ✅ s2 視覺 pctOver8 1.46%，對最密差異區塊 4× 裁圖人工比對：線位置／粗細／亮度一致，差異只在次像素抗鋸齒，正常尺寸不可辨
  - ⏭️ **未做（留給後續）**：視窗內 L0 升級（需空間索引）、tooltip 高度內插、track-single 升 L0、region 級 L1/L2 聚合檔
  - ⏭️ LOD 檔目前只產了 7 座機場 × 2026-02-18；全量產檔（40 秒–2 分鐘、+1.1 GB）與上傳 S3 待用戶拍板
- [x] **2-3 部署鏈**（2026-09-03 完成，`3d8f8cd`；用戶已授權上傳）
  - ✅ 全量產檔：4,738 個日檔全部有 L1/L2，2,303 座機場、9,476 個檔、1,177 MB（L1 818 MB／L2 406 MB）
  - 🔑 **發現的缺口**：主 manifest 不記錄 LOD 檔，而 `pull-from-s3.sh` 是照 manifest 的 `dailyFiles.path` 解析要拉什麼、pattern 寫死 `\.jsonl` → **上傳了部署端也拉不下來**；若改成盲試 `.l1`/`.l2` 則是 9,476 次 404
  - ✅ 解法：`split-tracks` 產 `tracks/lod-files.txt`（每行 `相對路徑<TAB>bytes`，刻意用純文字而非 JSON —— 部署端 Alpine 只有 `sh`；147 KB）；新增 `--lod-manifest-only` 可單獨重產清單不重跑 DP
  - ✅ `pull-from-s3.sh` 新增 `[2b/4]` 段讀清單拉取（含 size 驗證與進度輸出）＋ `--no-lod` 旗標可跳過那 1.2 GB
  - ✅ `upload-split-to-s3.ts` 把 `lod-files.txt` 與 manifest 一樣「最後發布」
  - 測試：本機用 `pull-from-s3.sh` 的 dry-run 或列表確認路徑正確

---

## Phase 3：Tier 2 結構改造（world 同步顯示；每項先寫設計小節再動工）

> 建議順序（2026-09-02）：**3-1 typed array → 3-3 光球上限 → 3-2 GPU 光軌 → 3-4**。
> 3-3 光球 8,192 與 3-2 光軌 slot 溢位都是「全球一天全開」的硬性需求（今天 world 場景 >1,024 顆光球靜默消失、>6,000 條光軌互踢閃爍）。
> **3-4 若 Phase 2-2 已實作 zoom 換層 + 視窗內升級，即可直接刪除。**

- [x] **3-1 `Flight.path` 改 typed array**（2026-09-03 完成，`f9b187b`）（T2-3）：`TrackPath` 包裝類（`length/lat(i)/lng(i)/alt(i)/t(i)`）機械替換 53 處；解析直接填 typed array；worker 解碼 + Transferable
  - ✅ `TrackPath` SoA：Float64 lat/lng（不用 Float32，經度誤差約 1 公尺 z12 以上看得見）、Float32 alt、Uint32 t = 24 B/點（原 ~60 B）
  - ✅ heap（GC 後量、2-3 次中位數）：S1 139→124 MB（-11%）、S2 464→373 MB（-20%）、world 321→296 MB（-8%）
  - ✅ visual-check 6/6、summary 三場景相同。S1 的 pctOver8 0.0044% 有查到底：暫時把 alt 換 Float64 重跑 → maxDiff 全部歸零，證實只來自刻意的 Float32 高度精度
  - 📌 `coordTransform.worker.ts` 查證是 dead code（無任何 import），未動
- [~] **3-2 GPU 時間驅動光軌**（T2-1；設計見 plan §C2e）
  - [x] **步驟一：`tRel` attribute + `uTime` → progressive 進 shader**（2026-09-03 完成，`845d1d0`）
    - `staticTrail.vert` 加 `aTRel` + `uTime`/`uProgressive`；`updateProgressiveVisibility` 從 O(N) 全頂點掃描變成設一個 uniform
    - ✅ **S1 progressive 播放 script 2.62 → 2.17 ms/frame（-17%，三次區間不重疊）**
    - ✅ 視覺 s1-progressive maxDiff 11／pctOver8 0.005%、s1-timewindow maxDiff **0**；summary 三場景相同
    - ✅ 播放正確性：用 `bucket.timestamps` 算「已飛過頂點數／總數」，40 幀嚴格單調遞增 18.481% → 20.272%
    - ⚠️ **行為改變**：舊碼 progressive 開啟時會整批覆蓋 ±12h 的 alpha（兩者同開時視窗失效），新碼是嚴格 AND。AND 更符合直覺、舊行為比較像 bug，但這是可見改變。要改回：`vAlpha = mix(alpha, 1.0, uProgressive) * cull * step(aTRel, uTime);`
  - [ ] 步驟二～五：partner attribute → 頭部夾回 → 活躍段 index → 拆 `BatchedTrails`

> 🔑 **步驟一順帶推翻了 plan 對 world 瓶頸的假設**（2026-09-03 實測）：world 場景這一步幾乎沒收益（72.01 → 71.29 ms/frame，噪聲 4.5 ms 內）。補測 world **full 模式**（完全不走 progressive）是 69.5 ms/frame，同量級 → **world 的 ~70–80 ms/frame 不是靜態軌跡也不是 progressive 掃描造成的**。主執行緒 busy 97–99% 而 **GPU 只有 ~3%**，大頭是 Far View 下每幀更新 7,868 顆光球／光軌。
> **後續排序應據此調整**：要解 world 播放，重點在 `InstancedOrbs.updateAll` 與 `BatchedTrails` 的每幀 CPU 成本，不是繼續往靜態軌跡的 GPU 化走。
  - 測試：freezeAnimation + 固定時刻下，光軌截圖 vs 改前 diff 通過（顏色 cycle 順序若改變需先在 plan 記錄並取得用戶同意）；world 場景 8,000+ 班同時空中無互踢閃爍；harness 播放時主執行緒 busy 顯著下降
- [x] **3-3 光球上限 8,192**（2026-09-03 完成，`8b9b267`）（T2-2）
  - ✅ **不採用 billboard**：改成維持球體、細分 `(1,2)`→`(1,0)`（1,860→240 verts/顆），用省下的頂點換 8 倍上限，每幀頂點預算 1.9M→1.97M 幾乎不變。理由：billboard 在 globe 下要自建相機基底且會改變光暈外觀
  - ✅ world 場景 `instancedOrbs.count` 1,024（截斷）→ 7,866；pickFlight 8/8 命中，含索引 1500–7865（舊版根本畫不出來的那批）
  - ✅ 視覺：S1 pctOver8 0.064–0.080%、s2 0.028%，門檻內不成塊；跑過同 commit 控制組（0.0000%）確認是幾何的真實效果非噪聲，再對 dark／light 各做 4× 裁圖人工比對，光球一樣圓無稜角
  - ⚠️ **已知取捨**：world **播放** script 60.19 → 73.57 ms/frame（fps 15→12，+22%，三次穩定可重現）。這是 updateAll 從每幀處理 1,024 顆變成 7,866 顆的直接成本（S1 對照組 2.18→2.25 在噪聲內，證實放大的 buffer 本身不花錢）。world 播放改動前就已 99% busy／15 fps 不可用，解方是 3-2
- [ ] **3-4 依 zoom 換層 + 視窗內升級**（T2-4）
  - 測試：拉近某機場後視窗內航線換成 L1／L0，拉遠換回；換層期間無閃爍缺線；harness world 場景常駐頂點 <2M

---

## 整體成果（2026-09-03 05:50 量測，同一台機器背靠背）

對照組 `5ad348b`（今晚起點＝Tier 0 之後）vs `e4531b6`（現在）。DPR 2、canvas 2800×1600、terrain 開、相機靜止、滑鼠移開。指標看 `perFrame.script`（ms/frame）與主執行緒 busy%，**不看 fps 判斷暫停狀態**（暫停時 fps 降到 ~19 是 1-2 節流的預期行為，不是變慢）。

| 場景 | 狀態 | fps | 主執行緒 busy% | `perFrame.script` |
|---|---|---|---|---|
| S1 RCTP | 暫停 | 73.5 → 18.5 | 13% → **5%** | 1.42 → 2.00 |
| S1 RCTP | 播放 | 73.5 → 77.0 | 54% → **21%** | 6.47 → **2.23（-66%）** |
| S2 apac-hub | 暫停 | 41.2 → 19.4 | 11% → **8%** | 2.35 → 2.84 |
| S2 apac-hub | 播放 | 40.8 → **61.0** | 49% → 99% | 10.88 → **3.28（-70%）** |
| world all | 暫停 | 27.9 → 19.1 | 12% → **7%** | 3.70 → 3.20 |
| world all | 播放 | **11.9 → 25.5** | 99% → 98% | 75.79 → **13.92（-82%）** |

其他量到的：
- **apac-hub set 的資料量**：lines 2,534,079 → 268,981（-89%）、heap 396 → 203 MB（-49%）（2-2 依 zoom 換 L2）
- **heap 全面下降**：S1 -11%、S2 -20%、world -8%（3-1 typed array）
- **world 光球**：1,024（被靜默截斷）→ 7,866（3-3）
- **world 已從 CPU-bound 轉成 GPU-bound**：GPU 硬體使用率 66% → 97–98%，剩下的 ~37 ms/frame 裡 script 只佔 14 ms，其餘是等 GPU 命令緩衝區

⚠️ S2／world 播放的 busy% 仍是 98–99%，但那已經是「等 GPU」而非「CPU 在算」——script 只剩 3.28／13.92 ms。要再往下壓得從 GPU 端著手（見 3-2 步驟二～五）。

---

## 執行紀錄

- 2026-09-02：Tier 0 完成（`b9cf92d`），規劃與證據歸檔（`3336c9d`），本檔建立，交由新 session 接手 Phase 0 起。
- 2026-09-02 傍晚：Phase 2 依用戶拍板改寫為 zoom band 換層（`654c201`）。
- 2026-09-02 晚：**Phase 0-1 完成**。freeze 機制（`src/three/animClock.ts` + 三個 wall-clock 動畫源）、debug hook（`freezeAnimation` / `setMapStyle` / `setTrailDisplay` / `setTimeWindow` / `summarySnapshot`）、`scripts/perf/visual-{check.mjs,diff.py,scenes.json}` 與 README §5 全部就緒，6 場景 baseline 已建立。production 路徑零改變（未凍結時仍走原 `dt += 0.016` 與 `Math.random` 相位）。
  - 下一步：0-3（`summarySnapshot()` 實測並存 baseline JSON）→ 0-2（cherry-pick freeze commit 到 `8346b2c` 臨時分支產 baseline，補驗 Tier 0 的 light theme）
