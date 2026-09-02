# Flight Arc 渲染幾何審查（C2：靜態軌跡 / 光軌 / 資料表示 / LOD）

分支 `perf/render-audit`，唯讀審查。所有數字由 `geom/scenarios.py`、`geom/dp_timing.mjs` 對實際檔案算出（`geom/results.json`、`geom/scenarios.out`）。日期一律台灣時間 2026-02-18（預設主資料日，`App.tsx:249`）。

## 0. 先講最重要的一件事（任務前提已過期）

任務假設「saved set → `applySavedSet` 切 scope=region → 載 `regions/{region}.jsonl`」。**現行程式不是這樣**：

- `App.tsx:266-274` 把 `airportSet` 當 `airportSelection` 傳進 `useFlightData`；`useFlightData.ts:144-157` 只要 `airportSelection !== null` 就走 `loadAirportSelectionFlights`，**優先於 scope/region**。
- `loadAirportSelectionFlights`（`flightLoader.ts:523-565`）對 set 內每座機場呼叫 `loadAirportFlights` → 讀**全解析度** daily shard `airports/{ICAO}/2026-02-18.jsonl`（`flightLoader.ts:470-495`），4 路並行，按 fr24_id 去重。
- 因此 saved set / `toggleAirportInSet` 載的是「每航班平均 600-760 點」的全解析度資料，而不是 ≤40 點的 LOD。`region` state 維持 'TW' 只影響進度標籤 `expectedTotal`（`useFlightData.ts:117-131`），對載入內容無影響；「跨 region 靜默缺資料」在現行路徑**不成立**（set 直接讀各機場檔）。

後果：EU+LHR 一組 = 7,088 班 × 761 點 = **10.77M 頂點 → 431 MB GPU + 474 MB CPU 鏡像 + ~324 MB V8 heap ≈ 1.2 GB**，每幀 vertex shader 呼叫 2,360 萬次。同一組若走 `all.jsonl` LOD 只要 262k 頂點（**41 倍**差距）。這就是「開多個機場風扇狂轉」的直接根因，優先級高於任何 shader 改法。

## 1. 總表

| id | file:line | 現況 | 估算成本 | 修法草案 | 視覺影響 | 工作量 | 風險 |
|---|---|---|---|---|---|---|---|
| **G1 set 走全解析度** | `useFlightData.ts:144-157`、`flightLoader.ts:523-565`、`App.tsx:816-847` | airportSet 非 null 即逐機場讀全解析度 shard，忽略 scope/region | eu-lhr 10.77M verts / 431 MB GPU / 1.2 GB 總記憶體 / 23.6M vert-shader/幀 / 193 MB JSONL 主執行緒解析；apac-hub 5.06M verts / 202 MB；S4 5.12M | `airportSet.length > 1` 時改讀中階 LOD（C2d L2，eps 250 m）或至少 `all.jsonl` 篩 dep/dest ∈ set；fitBounds `maxZoom: 7`（`App.tsx:836`）→ 554 m/px，eps 250 m 為 0.45 px | 零視覺差異（z≤8）；z≥9 放大時 ≤2 device px | S（先用 all.jsonl）/ M（新 LOD 檔） | 需重生 split-tracks 產物並同步 `pull-from-s3.sh` region 清單 |
| **G2 建構期整桶重傳** | `FlightScene.ts:583-589`（`needsUpdate=true`，無 `addUpdateRange`）；three `WebGLAttributes.updateBuffer`：`updateRanges.length===0` → `bufferSubData(0, array)` 整條 | 漸進建構每幀只寫 10k verts，卻把每個髒桶的**整個** buffer（40 B/vert）重傳 | S1 最大桶 490k verts = 19.6 MB/幀 × ~49 幀；eu-lhr 最大桶 3.14M verts = **125.7 MB/幀** × ~314 幀 ≈ 39 GB；建構幀數 S1 88（1.5 s）、apac 506（8.4 s）、eu-lhr 1,077（18 s）、S3 196（3.3 s），且 theme / perFlightColorMap / 高度 slider 都會 `forceRebuildStatic` 重跑（`customLayer.ts:104`） | 對每個髒桶 `attr.clearUpdateRanges(); attr.addUpdateRange(startThisFrame×itemSize, writtenThisFrame×itemSize)`（照 `BatchedTrails.applyRange` 324-345 抄）→ 每幀上傳 10k × 40 B = 400 KB | 零視覺差異 | S | 無；`alphaAttr` 在 `updateStaticVisibility`（691-725）同樣可用 per-flight range |
| **C2a 靜態 glow 雙 pass** | `FlightScene.ts:368-385`（兩支材質）、`409-414`（glowMesh）、`603-666`（opacity/width/glow gate）、`678-684`、`852`、`945-951`；`staticTrail.frag:13` | 同 geometry 畫兩次；draw call = 2 × 非空桶 | S1 9 桶 → 18 DC、1.77M vert-shader/幀；eu-lhr 19 桶 → 38 DC、21.5M；S3 36 桶 → 72 DC、3.93M；合併後全部減半 | frag 改 `a1 = vAlpha·uOpacity·uWidth; a2 = a1·uGlowW; alpha = uAdditive ? a1+a2 : a1+a2−a1·a2`，`uGlowW = glowHidden ? 0 : 0.3·w`；刪 `staticGlowMat`/`glowMesh`；`setGlowHidden` 改設 uniform | dark（additive）**逐像素相同**（僅 8-bit 二次捨入 ≤1/255）；light（normal）單色像素相同，異色交疊處預設 O=0.25 誤差 ≤3/255、O=0.7 最壞 18/255 | S | light theme 若要絕對一致可保留雙 pass（light 只有 1 桶=2 DC，成本小） |
| **G3 Float32 timestamp** | `FlightScene.ts:391,552`、`740-760` | `timestamps` 為 Float32Array 存絕對 unix 秒 | 1.77e9 的 float32 ulp = 128 s → 誤差 ±64 s；progressive 模式以 128 s 為單位跳格顯示（60× 播放 ≈ 每 2 s 一跳） | 存 `t − windowStart`（≤86,400 → ulp 0.0078 s）；C2e 的 `uTime` 同理用相對時間 | 修 bug（目前有可見階梯） | S | 無 |
| **G4 S3 規模 slot/orb 溢位** | `BatchedTrails.ts:25,294-317,324-336`；`InstancedOrbs.ts:4,98-99,199` | MAX_SLOTS=6000、MAX_INSTANCES=1024 | all.jsonl 10:00 同時空中 **7,868**（峰值 23:00 8,675）；每幀 1,868 班無 slot → 每班 `acquireSlot` 線性掃 6,000 筆 Map ≈ **11.2M 次迭代/幀**；被踢的「最近抵達」仍在空中 → 下一幀再互踢（軌跡閃爍）；髒區橫跨全部 slot → **34.3 MB × 5 attribute 每幀重傳**；光球 `count = min(entries, 1024)` **靜默丟掉後 6,844 班**，`pickFlight` 也看不到 | 短期：victim 用 min-heap；光球改 billboard quad（今 1,860 verts/顆 → 24）並把上限提到 8,192；長期：C2e 消滅 slot | 目前是可見缺陷（無光球、閃爍） | S（heap）/ M（orb 幾何） | 光球換幾何要重調呼吸/閃爍視覺 |
| **C2b 頂點預算** | 見 §2 | — | S1 每幀 2.05M verts、170 MB；eu-lhr 23.6M、1.3 GB；S3 6.6M、297 MB | — | — | — | — |
| **C2c path 表示** | `types/index.ts:2,16`；`flightLoader.ts:66-101,355-410`；`.path` 53 處/9 檔（`flightStats` 12、`FlightScene` 11、`flightLoader` 10、`App` 8、`flightIndex` 5、`customLayer` 3、`staticTrails` 2、worker 1、`s3Loader` 1） | `number[][]`，每點 1 JSArray + FixedDoubleArray | V8（pointer compression）每點 16+40+4 ≈ **60 B**；S1 26.6 MB、S3-day 62.9 MB、eu-lhr 324 MB；`preprocessFlight` 逐行再配一份（`385`）→ 每點 2 次配置；Float32 SoA(lat,lng,alt)+Uint32 t = 16 B/pt（S1 7.1 MB、eu-lhr 86 MB）；Float64 SoA 32 B | `TrackPath` 包裝類（`length/lat(i)/lng(i)/alt(i)/t(i)`）機械替換 53 處；解析改為直接填 typed array（略過中間陣列） | 零視覺差異 | M（包裝）/ L（自寫數值 parser） | 物件數從 2/點降到 ~4/航班 → major GC 標記成本降 100×+；worker 傳輸可 Transferable |
| **C2d 多層 LOD** | `scripts/split-tracks.ts:63-125`（2D DP，eps 2 km、cap 40） | 只有 全解析度 / 2 km 兩層 | RCTP 日檔 442,806 點：eps 50 m → 79,463（18%，2.9 MB）；100 m → 57,938；250 m ≈ 38k（~1.4 MB）；2 km → 14,768（3.3%，0.54 MB）；DP 在 Node 跑 S1 全部點：eps≥50 m 0.1–0.6 s，eps 20 m 遞迴版 2.4 s / 迭代版 1.4 s | build-time 產 `airports/{ICAO}/{date}.lod50.jsonl`、`.lod250.jsonl`；airport scope 預設 lod50、set/region 用 lod250、單機追蹤才讀全解析度 | lat 25° z10.4 preset：26 m/device px → eps 50 m ≤2 device px（低於 ADS-B 抖動）；z≤9 不可辨 | M | DP 目前只算 2D，×3 高度誇張下 300 m 高度折點 = 900 m 視覺（z8 3 px）→ 粗層要用 3D epsilon |
| **C2e GPU 時間驅動光軌** | `FlightScene.ts:857-909`（每幀重寫）、`BatchedTrails.ts:119-267`（CPU 切片 + 上傳） | 光軌每幀 CPU 切片 + `bufferSubData` | S1 每幀 ~150k float 寫入 + 0.8 MB 上傳（便宜）；eu-lhr 1.35M 寫入 + 7 MB；S3 見 G4（34 MB/幀 + 11M 迭代） | 頂點加 `tRel`(4) + partner pos/ecef/t(28) + colorIdx(4) → **76 B/vert**（略去 partnerEcef 改 shader 算 → 64）；pass A 靜態、pass B 光軌（index list 只含活躍段）；每幀 CPU 只剩 1 個 uniform + 光球二分搜尋（7,868 × ~4 步 ≈ 0.2 ms）+ orbs updateAll ~1 ms | 顏色 cycle 分配順序改變（同色盤）；其餘可做到一致 | L | 記憶體 40→76 B/vert：eu-lhr 全解析度 819 MB **不可行**，必須搭配 G1/C2d 走 LOD；WebGL1 無 gl_VertexID 故用 partner attribute |
| **C2f progressive 全掃** | `FlightScene.ts:740-760`；`customLayer.ts:165-168` | 每模擬秒全頂點掃描 + 髒桶整條 alpha 重傳 | S3 1.96M verts 掃 ≈ 2–4 ms + 7.9 MB 上傳／模擬秒；60× 速度 = 每幀；eu-lhr 10.8M 掃 15–25 ms + 43 MB/幀 → 無法播放 | 併入 C2e：`vAlpha *= step(tRel, uTime)`，CPU 0 | 零視覺差異（且修掉 G3 的 128 s 階梯） | S（獨立可先做：只要 tRel attribute + uTime） | 無 |

## 2. C2b 預算表

前提：`loadAirportFlights` 的日期篩選在 `streamLoadJsonl`（`flightLoader.ts:384-388`）逐行套 `flightDateTW`（`194-198`）：`dep_time || path[0][3]` 加 8 h 取日期 → **依 dep_time、UTC+8**；有 daily shard 時直接讀 shard（`470-495`），shard 切分規則相同（`migrate-airport-daily-shards.ts:37-40`）。`displayedFlights`（`App.tsx:727-745`）再以 dep_time ∈ [windowStart, windowEnd] 篩一次，結果一致（dep_in_day 欄 = flights）。

靜態 verts = Σ(points−1)×2；GPU 40 B/vert（pos12+color12+alpha4+ecef12，`FlightScene.ts:387-404` 確認；timestamps 4 B 只在 CPU，**未上傳**）；CPU 鏡像 44 B/vert；heap 60 B/pt。BatchedTrails 固定 6,000×130×44 B = 34.3 MB（CPU+GPU 各一份）；drawRange = (maxEverUsed+1)×130 ≈ 峰值同時空中數×130。光球 3×540+240 = **1,860 verts/顆**（`IcosahedronGeometry(1,2)`=540、`(1,1)`=240，非索引）。

| scenario | flights | points | 平均點 | static verts | ×2 glow | 光軌 drawRange | 光球 verts | **每幀 vert-shader** | GPU static | CPU 鏡像 | heap path | 桶數/DC | 建構幀數 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| S1 RCTP 02-18（airport scope，shard 16.3 MB） | 649 | 442,806 | 682 | 884,314 | 1,768,628 | ~26k | 253k | **2.05M** | 35.4 MB | 38.9 MB | 26.6 MB | 9 / 18 | 88（1.5 s） |
| S2 eu-lhr（7 座，shard 合計 193 MB） | 7,088 | 5,394,089 | 761 | 10,774,002 | 21,548,004 | 160k | 1.90M（1,231>1,024 截斷） | **23.6M** | 431 MB | 474 MB | 324 MB | 19 / 38 | 1,077（18 s） |
| S2 transatlantic | 4,412 | 3,322,660 | 753 | 6,636,496 | 13,272,992 | 96k | 1.38M | 14.7M | 265 MB | 292 MB | 199 MB | — | 664 |
| S2 apac-hub | 3,769 | 2,533,949 | 672 | 5,060,360 | 10,120,720 | 90k | 1.29M | 11.5M | 202 MB | 223 MB | 152 MB | 20 / 40 | 506 |
| S4 RCTP+VHHH+RJTT+WSSS（toggle，同樣走 shard，region 'TW' 無作用） | 3,629 | 2,563,128 | 706 | 5,118,998 | 10,237,996 | 89k | 1.28M | 11.6M | 205 MB | 225 MB | 154 MB | 21 / 42 | 512 |
| S2 london-cluster | 2,514 | 1,885,507 | 750 | 3,765,986 | 7,531,972 | 60k | 865k | 8.5M | 151 MB | 166 MB | 113 MB | — | 377 |
| S2 bangkok-metro | 1,791 | 1,216,375 | 679 | 2,429,168 | 4,858,336 | 34k | 489k | 5.4M | 97 MB | 107 MB | 73 MB | — | 243 |
| S2 tw-intl | 945 | 573,641 | 607 | 1,145,392 | 2,290,784 | 22k | 311k | 2.6M | 46 MB | 50 MB | 34 MB | — | 115 |
| S2 taipei-metro | 816 | 509,967 | 625 | 1,018,302 | 2,036,604 | 20k | 288k | 2.35M | 41 MB | 45 MB | 31 MB | — | 102 |
| S3 all.jsonl 02-18（region all 預設載入，dates 篩選） | 66,478 | 1,048,287 | 15.8 | 1,963,618 | 3,927,236 | 780k（滿） | 1.90M（截斷） | **6.6M** | 78.5 MB | 86 MB | 63 MB | 36 / 72 | 196（3.3 s） |
| S3 all.jsonl 全檔（無日期篩選） | 82,390 | 1,380,749 | 16.8 | 2,596,718 | 5,193,436 | 780k | 1.90M | 7.9M | 104 MB | 114 MB | 83 MB | — | 260 |
| 對照：region TW LOD 02-18 | 1,134 | 19,463 | 17.2 | 36,658 | 73,316 | 24k | 348k | 0.45M | 1.5 MB | 1.6 MB | 1.2 MB | — | 4 |
| 對照：eu-lhr 若從 all.jsonl 篩 dep/dest∈set | 7,088 | 138,253 | 19.5 | 262,330 | 524,660 | — | — | — | 10.5 MB | 11.5 MB | 8.3 MB | — | 26 |
| 對照：apac-hub 從 all.jsonl | 3,769 | 75,786 | 20.1 | 144,034 | 288,068 | — | — | — | 5.8 MB | — | — | — | 14 |
| 對照：S4 從 all.jsonl | 3,629 | 77,590 | 21.4 | 147,922 | 295,844 | — | — | — | 5.9 MB | — | — | — | 15 |

GPU 時間量級（假設整合式 GPU 對這支含 4×4 矩陣乘 + normalize + 2 個 smoothstep 的 vertex shader 吞吐 ≈ 500M verts/s；mercator 模式 `uTransition>=1` 提前 return 便宜約一半）：S1 ≈ 4 ms、S3 ≈ 13 ms、apac/S4 ≈ 23 ms、eu-lhr ≈ **47 ms（GPU 上限 ~21 fps）**。fragment 端 1 px 線很便宜（S1 442k 段 × 3–14 px ≈ 1.3–6M frag/pass）。實測請用 `__flightArcDebug`（`App.tsx:1031-1050`）+ Chrome GPU profiler / `EXT_disjoint_timer_query_webgl2`，不要信這個假設值。

### 同時空中航班數（all.jsonl，path 首尾時間戳含該時刻）

| 時刻（TW） | 全檔 | 02-18 dep 篩選後 | vs MAX_SLOTS 6000 | vs MAX_INSTANCES 1024 |
|---|---:|---:|---|---|
| 10:00 | 7,877 | **7,868** | 超 1,868 → 每幀互踢 + 全 buffer 重傳 | 超 6,844 → 光球靜默丟棄 |
| 18:00 | 6,693 | **6,692** | 超 692 | 超 5,668 |
| 峰 23:00 | 8,675 | 8,625 | 超 2,625 | 超 7,601 |
| 谷 00:00 | 79 | 13 | — | dep 日篩選把「前一天起飛仍在空中」的航班排除（`App.tsx:727-745`） |

逐小時（02-18 篩選）：`[13, 2625, 4706, 5760, 6356, 6653, 6366, 6729, 7418, 7926, 7868, 7632, 7332, 6731, 6709, 6658, 6494, 6477, 6692, 6994, 7434, 7919, 8394, 8625]`。各 set 的同時空中：eu-lhr 769/1,231、transatlantic 742/662、apac 691/658、S4 661/688、S1 105/136（10:00/18:00）。只有 eu-lhr 18:00 超過 1,024 光球上限。

超過 1,024 的行為（`InstancedOrbs.ts:99`）：`this.count = Math.min(entries.length, MAX_INSTANCES)`，`entries[1024:]` 完全不處理——沒有警告、沒有淘汰策略，光軌照畫（BatchedTrails 上限 6,000）但頭部沒有光球；`pickFlight`（`199-230`）只掃前 `count` 個。哪些被丟由 `activeFlights` 順序（`flightIndex.ts:39-55`，桶內 index 順序 = 載入順序）決定。

## 3. 證據與推導

### C2a 單 pass 等價證明

材質（`FlightScene.ts:368-385`）：兩支 `ShaderMaterial` 的 vertex/fragment 原始碼字串完全相同，只有 uniform 值不同（`uOpacity`, `uWidth`）。three.js `WebGLPrograms` 以 shader 原始碼 + 定義為 key 快取，所以兩個 mesh 用**同一個 WebGLProgram**、同一份 geometry、同一組 attribute → `gl_Position` 逐位元相同 → 光柵化產生**完全相同的 fragment 集合**（同 program、同 state 的兩次 draw 在 GL 不變性規則下保證一致；這裡甚至是同一 program）。1 px `GL_LINES` 不涉及線寬展開，故無「兩次覆蓋不同像素」的問題。

fragment（`staticTrail.frag:13`）：`finalAlpha = vAlpha·uOpacity·uWidth`。

- 本體：a₁ = vAlpha·O·w
- glow：a₂ = vAlpha·(0.3O)·(w²) = a₁·0.3w

**Dark / AdditiveBlending**（three 0.172 `WebGLState.js:71`：非 premultiplied → `blendFunc(SRC_ALPHA, ONE)`）：D₁ = min(D₀ + a₁c, 1)，D₂ = min(D₁ + a₂c, 1)。對 a,b ≥ 0，min(min(x+a,1)+b,1) = min(x+a+b,1)，故 D₂ = min(D₀ + (a₁+a₂)c, 1)，單 pass alpha = a₁+a₂ = vAlpha·O·w·(1+0.3w)。**逐像素相同**；唯一差異是 8-bit framebuffer 兩次捨入 vs 一次（≤1/255），以及 `discard` 門檻（雙 pass 各自 <0.001 才丟，單 pass 對總和判定，差值 <0.001 < 1/255）。數值：O=0.7, w=1 → a₁+a₂ = 0.91 = 0.7·1·1.3 ✔。

**Light / NormalBlending**（`WebGLState.js:67`：`(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)`）：同色 c 疊兩次 D₂ = D₀(1−a₁)(1−a₂) + c[1−(1−a₁)(1−a₂)]，與單次 alpha **a_eq = a₁+a₂−a₁a₂** 完全相同（與 D₀、c 無關）。誤差只出現在**異色線交疊的像素**：light theme 全部航班進單一桶（`bucketKeyForFlight` 313 行回 0），繪製順序為「全部本體 → 全部 glow」，而單 pass 是「A → B」，合成順序不同。用實際色盤（gradient stops `[0.6,0.1,0.05]→[0.05,0.15,0.55]` + `LIGHT_COLORS`）、D₀ ∈ 淺色底、O ∈ {0.25(預設 0.1×2.5), 0.5, 0.7}、w ∈ {0.25,0.5,1} 窮舉最壞 8-bit 誤差：**O=0.25 → 3/255；O=0.5 → 10/255；O=0.7 → 18/255**（`geom` 腳本輸出）。預設值在 JND 邊緣；slider 拉滿時在交叉點可辨。

**最小改法（牽連處）**：
1. `staticTrail.frag`：加 `uniform float uGlowW; uniform float uAdditive;`，`a1 = vAlpha*uOpacity*uWidth; a2 = a1*uGlowW; alpha = mix(a1+a2-a1*a2, a1+a2, uAdditive);`
2. `FlightScene.ts:368-385`：刪 `staticGlowMat`，`staticMat` uniforms 加 `uGlowW: 0.3*w*(glowHidden?0:1)`、`uAdditive: isDark?1:0`。
3. `387-428`：刪 `glowMesh` 建立/`scene.add`/`StaticBucket.glowMesh` 欄位。
4. `setStaticOpacity 603-616`：只設 `uOpacity`；`setStaticWidth 622-634`：設 `uWidth` 與 `uGlowW`；`recomputeGlowVisibility 650-657` 保留判斷、`setGlowHidden 660-666` 改寫 `uGlowW` 而非 `visible`；`setShowTrails 678-684`、`updateStaticCulling 852`、`removeStaticMeshes 945-951` 刪 glowMesh 行。
5. Draw call：今 2×非空桶（S1 18、eu-lhr 38、S3 72；light 2）→ 1×。每幀 vertex 工作減半（S1 −884k、eu-lhr −10.8M、S3 −1.96M）。

### G2 整桶重傳（three.js 行為）

`node_modules/three/src/renderers/webgl/WebGLAttributes.js` `updateBuffer`：
```js
if ( updateRanges.length === 0 ) {
    // Not using update ranges
    gl.bufferSubData( bufferType, 0, array );
```
`continueStaticBuild`（`FlightScene.ts:583-589`）對每個髒桶四個 attribute 只設 `needsUpdate = true` → 整條 array 重傳。每幀寫 10,000 verts（`183`），航班依檔案順序、桶依 path 中點分（`313-317`），連續航班常落不同桶 → 每幀 2–4 個桶髒。S1 桶 34 有 490,192 verts（19.6 MB）；eu-lhr 桶 42 有 3,142,590 verts（125.7 MB）。`BatchedTrails.applyRange`（`338-342`）已示範正確做法。

### C2b 補充：載入端成本

`streamLoadJsonl` 在**主執行緒**逐行 `JSON.parse` + `preprocessFlight`（`355-410`）。eu-lhr 7 個 shard 合計 193 MB 文字（Python 逐行解析用 24 s；V8 JSON.parse 約 100–200 MB/s → 1–2 s 純解析，但穿插在 fetch chunk 之間並持續配置 5.4M×2 個陣列，觸發數十次 scavenge）。RCTP 全檔 220 MB / 7,693 班 / 6.15M 點（無 shard 時的 flat fallback 會掃整檔再丟 92%）。

### C2c V8 堆積成本

`[lat, lng, alt, ts]`：JSON.parse 第一個元素是 double → `PACKED_DOUBLE_ELEMENTS`；`unwrapPathLongitudes`（`66-79`）的字面量同樣落 double kind（unboxed）。Chrome 64-bit 開 pointer compression：JSArray 16 B（map/properties/elements/length 各 4）+ FixedDoubleArray 8 + 4×8 = 40 B + 父陣列 4 B 指標 = **60 B/點**。若退化成 boxed（`PACKED_ELEMENTS` + HeapNumber 12 B×4）為 92 B/點，本專案資料不會觸發。對照：Float64 SoA 32 B、Float32 lat/lng/alt + Uint32 t = 16 B（lat/lng float32 ≈ 1e-5°≈1 m，夠用；t 用 Uint32 到 2106 年不溢位）。

| | 點數 | number[][] 60 B | F64 SoA 32 B | F32 SoA 16 B |
|---|---:|---:|---:|---:|
| S1 | 442,806 | 26.6 MB | 14.2 MB | 7.1 MB |
| S3-day | 1,048,287 | 62.9 MB | 33.5 MB | 16.8 MB |
| eu-lhr | 5,394,089 | 324 MB | 173 MB | 86 MB |

暫時性雙倍：`streamLoadJsonl:385` 每行 `preprocessFlight(JSON.parse(...))` → 解析出的 path 立刻被 unwrap 複本取代，所以是**逐航班**的短命垃圾（不是整資料集雙倍），但每點仍有 2 次陣列配置 + 1 次 4-double 解構；`preprocessFlights`（`99-101`，airspace/loadTracks 走這條）才是整陣列雙倍。此外 `getMercatorPath`（`767-782`）對每個進入視窗的航班再配一份 `[mx,my,mz,t]` 陣列（60 B/點）+ Float32 ecef 12 B/點，且 `invalidateMercatorCache` 後重來。

GC 與「一頓一頓」：(1) 載入期 V8 新生代 semi-space 16–32 MB，每解析 ~27 萬點觸發一次 scavenge，**存活的 path 陣列全部要被複製再晉升**（scavenge 成本 ∝ 存活量，不是垃圾量）→ 載入時規律停頓；(2) 播放期每幀配置 `orbEntries` N 個物件 + `activeIds` Set + `getActiveFlights` 陣列（S3 約 8k 物件/幀），加上 old-gen 已有 300 MB / 1,000 萬個小陣列，增量標記的最後 atomic pause + compaction 就是那一頓（幾十到上百 ms）；(3) 改 typed array 後物件數從 2/點 降到 ~4/航班（eu-lhr 1,080 萬 → 2.8 萬），標記/壓縮成本按物件數計，等於消掉這類 pause；也讓 worker 傳輸可用 Transferable 而非 structured clone。

`.path` 影響面：53 處 / 9 個 src 檔（見總表）。**M 方案**：`Flight.path` 換成 `TrackPath` 類（內含一條 Float32Array stride 4 或 SoA + `length`、`lat(i)`…、`at(i)` 回 tuple 給統計用），53 處機械替換，型別檢查會逐一指出；解析仍先 JSON.parse 再灌入 typed array（暫時垃圾不變）。**L 方案**：自寫串流數值 parser 直接填 typed array，才真正消掉載入期配置。`scripts/` 的 4 處維持磁碟格式不動。

### C2d 多層 LOD

Web Mercator（Mapbox 512 px tile）lat 25°：m/px = 2πR·cos25° / (512·2^z)。

| zoom | m / CSS px | m / device px (DPR 2) | 「不可辨」eps（0.5 device px） | 1 CSS px |
|---|---:|---:|---:|---:|
| z6 | 1,108 | 554 | 277 m | 1.1 km |
| z7（set fitBounds maxZoom） | 554 | 277 | 139 m | 554 m |
| z8 | 277 | 139 | 69 m | 277 m |
| z9 | 139 | 69 | 35 m | 139 m |
| z10 | 69 | 35 | 17 m | 69 m |
| z10.4（RCTP preset，`cameraPresets.ts:183`） | 52 | 26 | 13 m | 52 m |
| z11 | 35 | 17 | 8.7 m | 35 m |
| z12 | 17 | 8.7 | 4.3 m | 17 m |

現行 2 km LOD 在 z7 是 3.6 CSS px（set 視角可辨），在 z≤5 才 <1 px。ADS-B 位置本身噪聲 ~20–50 m、region path 更有 ±10–18 km 抖動（記憶紀錄），eps 低於 20 m 沒有意義。

DP（`split-tracks.ts:81-99` 原樣複製到 `geom/dp_timing.mjs`，Node 22，RCTP 02-18 shard 442,806 點，warm 取最佳）：

| eps | 剩餘點 | 比例 | path bytes | 遞迴版（slice） | 迭代版（index） |
|---|---:|---:|---:|---:|---:|
| 20 m | 120,648 | 27.2% | 4.40 MB | 2,447 ms | 1,384 ms |
| 50 m | 79,463 | 17.9% | 2.90 MB | 539 ms | 171 ms |
| 100 m | 57,938 | 13.1% | 2.11 MB | 225 ms | 189 ms |
| 200 m | 41,846 | 9.5% | 1.53 MB | 174 ms | 233 ms |
| 500 m | 26,645 | 6.0% | 0.97 MB | 603 ms | 255 ms |
| 1 km | 19,504 | 4.4% | 0.71 MB | 106 ms | 95 ms |
| 2 km | 14,768 | 3.3% | 0.54 MB | 104 ms | 150 ms |

（原始 path bytes 16.0 MB。）worker 內跑 S1 是 0.1–0.6 s 量級；eu-lhr 5.4M 點約 ×12 → 2–7 s，再加 structured clone 把 5.4M 個陣列傳進 worker 本身就要秒級（C2c 的 typed array 才能 Transferable）。

建議層級（per-airport per-date 檔，split-tracks 一次產出）：

| 層 | eps | 用途 | RCTP 日檔大小 | S1 verts | eu-lhr verts（按 S1 比例推） |
|---|---|---|---:|---:|---:|
| L0 全解析度 | — | 單機追蹤 / z≥11 | 16.3 MB | 884k | 10.8M |
| L1 | 50 m | airport scope 預設（z9–10.4，≤2 device px） | 2.9 MB | 157k | 1.9M |
| L2 | 250 m | set / 多機場（z7–8，≤0.5 CSS px） | ~1.4 MB | ~76k | ~0.9M |
| L3（現有） | 2 km / 40 pt | world / region ≤ z6 | 0.54 MB | 29k | 262k |

取捨：build-time 檔案 = 零客戶端 CPU、可 gzip 快取、S3 多 3 份檔（RCTP 全部日期約 +30%容量）、選層在載入時決定（換層 = 重載 + 重建，走現有 progressive build）；client worker = 只傳一份全解析度、可依 zoom 連續調 eps，但 eu-lhr 這種量級要先下載 193 MB + 2–7 s worker + 每次換層重建 GPU buffer，且 DP 需改成 3D（含誇張高度）才不會抹平爬升/下降折點（×3 誇張下 300 m 高度偏差 = 900 m ≈ z8 3 px）。結論：build-time 多層為主，worker 只做「單機追蹤時對 L0 做視窗內動態抽稀」的補充。

### C2e GPU 時間驅動光軌設計

現況：`timestamps`（`391`、`552`）只留在 CPU，未建 BufferAttribute（`395-403` 只有 position/color/alpha/aEcef）。`update()`（`857-909`）每幀對每個活躍航班呼叫 `writeTrail`（二分搜尋 + 頭尾插值 + 寫 ≤130 verts × 11 floats）+ `commit()` 一次 `bufferSubData`。

新頂點佈局（LineSegments，每段 2 verts）：

| attribute | bytes | 說明 |
|---|---:|---|
| position | 12 | 同今 |
| aEcef | 12 | 同今 |
| color | 12 | 靜態高度漸層 / perFlightColorMap 覆寫 |
| alpha | 4 | ±12h 可見度（CPU 增量維護，沿用 `691-725`） |
| tRel | 4 | `t − uTimeBase`（G3：絕對秒 float32 ulp 128 s） |
| partnerPos | 12 | 段另一端 |
| partnerEcef | 12 | 可省：只在 clamp 分支用 `mercatorToEcef` 的 GLSL 版現算（每幀只有活躍頭部頂點走到） |
| partnerT | 4 | |
| colorIdx | 4 | theme-cycle 色盤索引（uniform vec3 palette[8]）；覆寫時 color 已是平色 |
| **合計** | **76（省 partnerEcef 64）** | 今 40 |

Shader（單一 program，`uMode` 0/1 兩個 pass，或兩支材質共用 geometry）：
```glsl
float w = 600.0;                                   // TRAIL_DURATION_SEC
float lo = uTime - w;
// pass B：超前頂點夾回插值位置
float tS = tRel, tP = partnerT;
if (uMode > 0.5 && tS > uTime && tP <= uTime) { float r = (uTime - tP)/(tS - tP); pos = mix(partnerPos, position, r); ecef = mix(partnerEcef, aEcef, r); tS = uTime; }
if (uMode > 0.5 && ((tS > uTime && tP > uTime) || (tS < lo && tP < lo))) { pos = partnerPos; }   // 段整段在窗外 → 退化為零長度
float progress = clamp((tS - lo)/w, 0.0, 1.0);
vTrailAlpha = pow(progress, 2.0) * uTrailOpacity;  // 同 trail.frag
vGlow = smoothstep(0.85, 1.0, progress) * 0.5;
vStaticAlpha = alpha * step(tRel, uTime) /* progressive */ ;
```
Pass A（靜態，C2a 合併後單 pass）畫全部段；Pass B（光軌）建議用 **index buffer 只列活躍段**：CPU 每模擬秒用 `flightIndex` 取活躍航班，對每班二分搜尋窗內段的 vertex range（LOD 每班 ≤3 段、全解析度 ≤120 段），S3 8k 班 → ≤50k index = 200 KB 上傳/秒，vertex 成本 ≈ 50k；退而求其次直接第二次 draw 全部頂點靠退化段（vertex 成本 ×2，zero 上傳）。

每幀 CPU：今 S1 ~150k float 寫入 + 0.8 MB 上傳、eu-lhr 1.35M + 7 MB、S3 11M 次 Map 迭代 + 34 MB → 改後 **1 個 uniform + 光球位置**：對每個活躍航班在 path 上二分搜尋（S3 7,868 × log₂16 ≈ 4 步；全解析度 log₂680 ≈ 10 步）+ 1 次 lerp ≈ 0.2–0.5 ms，再加 `InstancedOrbs.updateAll`（1,024 × 4 個 matrix ≈ 1 ms）。

要重做的既有功能：
- progressive（`740-760`）→ `step(tRel,uTime)`，刪 CPU 掃描（C2f）。
- ±12h alpha（`691-725`、`customLayer.ts:125-155`）→ 保留 CPU 增量寫 alpha（每秒只動進出的航班；記得 G2 的 range 上傳），或多 8 B（flight t0/t1）全搬進 shader。
- perFlightColorMap（`214-244`）→ 覆寫時同時寫 color 與「光軌用色」；今天光軌 `colorForFlight` 在**啟用順序**分配 theme-cycle 色（`297-307`），改成建構期按航班順序分配 → 同色盤但個別航班顏色會不同（可見但無關對錯）。
- light theme 繪製順序：pass A（靜態）→ pass B（光軌）用 `renderOrder` 維持「光軌在後」（`BatchedTrails.ts:105-108` 現行語意）。
- Far View：`uLimbFade` 等 globe uniforms 已共用（`104-110`），不變。
- `pickFlight`（`762-765`）走光球 CPU 位置，不變。
- 分桶剔除（`830-855`）不變；BatchedTrails 整個刪除（`−34 MB×2`）。
- G4 的 slot/踢人問題自然消失；光球 1,024 上限仍在，另解。

工作量 L，拆解：(1) tRel attribute + uTime + progressive in shader（S，獨立交付，順便修 G3）；(2) C2a 合併 pass（S）；(3) partner attribute + clamp 分支 + trail alpha（M）；(4) 活躍段 index list（M）；(5) 光球改 CPU 二分搜尋、拆 BatchedTrails（S）；(6) 顏色/覆寫/light 順序回歸（S）；(7) 記憶體：只在 LOD 資料上啟用，全解析度 S1 67 MB 可接受、eu-lhr 819 MB 不可（配 G1/C2d）。

### C2f progressive 成本

`updateProgressiveVisibility`（`740-760`）每模擬秒對全部桶 `for i < writeVerts` 比較 + 寫 alpha，再整條 `alphaAttr` 上傳（G2 行為）。S3-day 1.96M verts：掃描 2–4 ms + 7.9 MB；eu-lhr 10.8M：15–25 ms + 43 MB；速度 60× 時每幀都觸發。而且比較用 float32 絕對秒（G3）→ 128 s 階梯。改 shader 後 CPU 為 0、上傳為 0。

## 4. 優先順序

1. **G1 set 資料路由**（S，41 倍）：`airportSet.length > 1` 先改讀 `all.jsonl` 篩 dep/dest∈set（eu-lhr 262k verts）；再做 C2d L2 檔取代。這一項單獨就解掉「多機場風扇狂轉」。
2. **G2 建構期整桶重傳**（S，零視覺差異）：加 `addUpdateRange`，S1 每幀 19.6 MB → 0.4 MB；同法套 alpha 更新。
3. **C2a 單 pass**（S）：vertex 工作與 draw call 減半；dark 逐像素相同。
4. **G3 + C2f**（S）：tRel attribute + `uTime`，progressive 改 shader，順便修 128 s 階梯——這也是 C2e 的第一步。
5. **G4 slot/orb 溢位**（S/M）：heap 選 victim、光球上限與幾何；S3 規模目前是可見缺陷。
6. **C2d 多層 LOD**（M）：build-time L1/L2 檔；airport scope 預設 L1（S1 884k → 157k verts）。
7. **C2c typed array**（M/L）：heap 60 → 16 B/點、GC 物件數降 400×、worker Transferable；是 C2d client 端與 C2e 大規模化的前置。
8. **C2e GPU 光軌**（L）：在 1–7 落地後做；記憶體 76 B/vert 只對 LOD 資料可行。

（範圍外觀察：播放時 `timeline.currentTime` 每 rAF setState 讓 2,396 行的 `App` 每幀 re-render，`useMemo` 鏈雖擋住重算但 reconciliation 本身仍是每幀主執行緒成本；屬 C1/React 軌。）
