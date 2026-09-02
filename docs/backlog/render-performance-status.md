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
| 視覺回歸 | Phase 0 建立的 `visual-check`（固定時刻＋固定相機＋動畫凍結，dark 與 light 各一組） | 逐像素 diff：>2/255 的像素 <0.5%，且 diff 不得成塊（只允許沿線條邊緣的捨入差） |
| 功能冒煙 | agent-browser 或手動 | 播放／暫停／seek、切機場、切底圖、Far View、時間窗（±12h）、漸進模式、點光球選航班，全部正常 |
| 資料一致 | Summary 面板數字（航班數、dep/arr、每日趨勢） | 改前後完全相同 |

每個子項完成 → 一個 commit（訊息含 A/B 關鍵數字）。**不 push、不 merge；上傳 S3 前先問用戶。**

---

## Phase 0：把「呈現不能錯」變成可自動檢查（先做，之後每一步都靠它）

- [ ] **0-1 視覺回歸腳本 `scripts/perf/visual-check.mjs`**
  - 在 `window.__flightArcDebug` 加 `freezeAnimation(t | null)`：把光球呼吸／閃爍與任何 wall-clock 動畫的時間凍結成固定值（DEV only），截圖才可重現
  - 場景清單（存 `scripts/perf/visual-scenes.json`：seek 時刻、center/zoom/pitch/bearing、theme、模式）：
    1. S1 RCTP dark、2. S1 RCTP light（`light` 底圖）、3. S2 亞太樞紐 dark（fitBounds 後視角）、4. world globe（z3，Far View 開）、5. S1 漸進模式播到中段、6. S1 時間窗開啟
  - `--baseline` 存到 `scripts/perf/out/baseline/`（gitignored），`--compare` 產出 diff 圖與數字表（PIL + numpy 已可用）
  - 測試：對同一 commit 連跑兩次 `--compare`，diff 必須 0（證明可重現）
- [ ] **0-2 用 0-1 對 Tier 0 補驗 light theme**（`b9cf92d` 只驗過 dark）
  - 用 `git stash`／checkout `8346b2c` 產 baseline → 回到 HEAD 比對；light 場景 diff 需符合通過標準
  - 另手動：切底圖一次、Far View、漸進模式 60× 播 30 秒無跳格、即時錄影 5 秒檔案可播放
- [ ] **0-3 Summary 數字快照**：把 S1／S2 的 Summary 面板數字（航班數、dep/arr、Top 航空公司、24h 熱力）dump 成 JSON 存 `scripts/perf/out/baseline/summary-*.json`，之後 Phase 2 換 LOD 要對照

---

## Phase 1：Tier 0.5（近零視覺差異）

- [ ] **1-1 光球動畫搬進 shader**（T05-1；`src/three/InstancedOrbs.ts`）
  - 呼吸／閃爍改 `uTime`（wall-clock 秒）uniform + per-instance `aPhase` attribute；instanceMatrix 只在 entries／globe 參數／scale 變時重算；attribute 改 `DynamicDrawUsage`
  - 現在 `updateAll` 用固定 `dt=0.016`，改 wall-clock 後動畫速度要與改前一致（用 freezeAnimation 在同一 t 截圖比對）
  - 測試：visual-check 全場景；暫停＋相機靜止時 `probe.mjs` 量到 instance buffer 零上傳（`renderer.info` 或 trace 內 bufferSubData 次數）；點光球選航班仍正確
- [ ] **1-2 暫停時降頻／閒置**（T05-2；`src/map/customLayer.ts:239-251`，同 pattern `atlasGlowLayer.ts`、`airspaceAurora.ts`）
  - **預設政策（用戶可改）**：暫停且相機靜止 → 用單一 `setTimeout` 以 20 fps 排 `triggerRepaint`；連續 30 秒無互動 → 完全停止重繪（呼吸停在當下相位）；任何互動／播放／slider 立即恢復；`document.hidden` → 停
  - 測試：`probe.mjs` 暫停 rAF≈20/s，30 秒後 0/s，按播放回到滿幀；播放中無 stall（`KEEP_ALIVE` 語意保留）；visual-check 不變
- [ ] **1-3 播放時鐘留在 ref、React 10 Hz 發布**（T05-3；`src/hooks/useTimeline.ts`、`src/App.tsx:996`）
  - 時鐘由 hook 持 `timeRef`，rAF 內直接 `map.triggerRepaint()`；state 節流 ~10 Hz；`seek()` 同步寫 ref 並立即發布
  - 影響面要逐一驗：時間標籤、進度 slider、cinema keyframe（`useCinemaCamera.ts`）、錄影 overlay 時間字（`useCanvasRecorder.ts`）、晨昏線、viewshed track-single
  - 測試：60×／600×／3600× 播放 30 秒，slider 與標籤連續更新無倒退；seek 後立即反映；harness 播放時主執行緒 busy 下降；visual-check 不變
- [ ] **1-4 `preserveDrawingBuffer:false`**（T05-4；`src/map/MapView.tsx:276`、`src/hooks/useCanvasRecorder.ts`）
  - 即時錄製改在 `map.on("render")` 內同步取像；HQ 匯出維持 `once("render")`
  - 測試：即時錄 10 秒 → 檔案可播且非黑畫面；HQ 匯出 30 幀 → 每幀非黑；visual-check 不變

---

## Phase 2：Tier 1 多層 LOD（多機場的根本解；需要重生資料）

- [ ] **2-1 `scripts/split-tracks.ts` 產 L1／L2 檔**
  - 每機場每日：`airports/{ICAO}/{date}.l1.jsonl`（eps 50 m）、`.l2.jsonl`（eps 250 m）；DP 改 **3D**（水平公尺 + 高度 ×3，避免爬升／下降折點被抹平）；起訖點必留
  - 測試（腳本 `scripts/perf/lod-verify.ts`）：每檔航班數與 fr24_id 集合 = L0；每航班起訖點座標與時間戳 = L0；每個被抽掉的點到簡化線的 3D 垂距 ≤ eps；RCTP 2/18 點數約 L1 18%、L2 ~9%（對照 plan §C2d）
- [ ] **2-2 前端選層**（`src/data/flightLoader.ts`、`src/hooks/useFlightData.ts`）
  - 單機場 scope → L1；set／多機場 → L2；單機追蹤（track-single）或 zoom ≥ 11 → L0；檔案缺失 graceful fallback L0；manifest 記錄各層是否存在
  - **資料一致檢查**：先盤點 `src/data/flightStats.ts`（`.path` 12 處）哪些統計依賴點數（距離、高度剖面、時間）；依賴點數的統計一律仍以 L0 或起訖點計算，不得因 LOD 改變 Summary 數字
  - 測試：Summary JSON 與 Phase 0-3 快照完全相同；visual-check 場景 3（set z≤8）L2 vs L0 diff 通過；場景 1（z10.4）L1 vs L0 diff 通過；harness S2 lines 從 2.5M 降到 ~0.5M 以下
- [ ] **2-3 部署鏈**：`scripts/pull-from-s3.sh` 與上傳腳本加新層；**上傳 S3 前向用戶確認**；README 覆蓋表若有欄位受影響同步
  - 測試：本機用 `pull-from-s3.sh` 的 dry-run 或列表確認路徑正確

---

## Phase 3：Tier 2 結構改造（world 同步顯示；每項先寫設計小節再動工）

- [ ] **3-1 `Flight.path` 改 typed array**（T2-3）：`TrackPath` 包裝類（`length/lat(i)/lng(i)/alt(i)/t(i)`）機械替換 53 處；解析直接填 typed array；worker 解碼 + Transferable
  - 測試：`Summary` 數字不變；visual-check 全場景不變；heap（S2）從 ~620 MB 明顯下降；typecheck 綠
- [ ] **3-2 GPU 時間驅動光軌**（T2-1；設計見 plan §C2e）：先做「tRel attribute + `uTime` → 漸進模式進 shader」（獨立小步），再做 partner attribute + 頭部夾回 + 活躍段 index，最後拆 `BatchedTrails`
  - 測試：freezeAnimation + 固定時刻下，光軌截圖 vs 改前 diff 通過（顏色 cycle 順序若改變需先在 plan 記錄並取得用戶同意）；world 場景 8,000+ 班同時空中無互踢閃爍；harness 播放時主執行緒 busy 顯著下降
- [ ] **3-3 光球 billboard + 上限 8,192**（T2-2）
  - 測試：world 場景每架在空中的飛機都有光球（數量 = activeFlights）；點選任一光球正確；visual-check 場景 1／3 光球外觀 diff 通過（呼吸／閃爍在凍結時刻比對）
- [ ] **3-4 依 zoom 換層 + 視窗內升級**（T2-4）
  - 測試：拉近某機場後視窗內航線換成 L1／L0，拉遠換回；換層期間無閃爍缺線；harness world 場景常駐頂點 <2M

---

## 執行紀錄

- 2026-09-02：Tier 0 完成（`b9cf92d`），規劃與證據歸檔（`3336c9d`），本檔建立，交由新 session 接手 Phase 0 起。
