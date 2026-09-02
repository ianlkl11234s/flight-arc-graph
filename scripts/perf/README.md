# 效能量測 Harness

零依賴 CDP（Chrome DevTools Protocol）量測工具，抓 before/after trace + 截圖 diff。輸出寫進 `out/`（gitignored）。

## 1. 啟動 dev server + Chrome
```bash
npm run dev -- --port 5199 --strictPort &                 # repo 根目錄執行
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 --user-data-dir="$(pwd)/scripts/perf/out/chrome-profile" \
  --no-first-run --no-default-browser-check --window-size=1600,1000 --window-position=100,100 \
  --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding --disable-background-timer-throttling \
  http://localhost:5199/ &
cd scripts/perf && node reassert-dpr1.mjs   # 釘死 DPR1 / canvas 1600x913
```
⚠️ 多螢幕環境新視窗可能落在非可見座標／被遮擋，導致 `visibilityState` 卡 `hidden`、rAF 被節流；上面 4 個 `--disable-*` flag 是必要的，仍卡住用 `node cdp-eval.mjs "document.visibilityState"` 確認。

## 2. 場景指令（於 `scripts/perf/` 內執行）
```bash
node scenario.mjs s1          # RCTP 單機場
node scenario.mjs s2          # apac-hub 差集（6 機場）
node scenario.mjs pause / play / glow0 / glow08 / status / trails / terrain-off / terrain-on
node cdp-eval.mjs '<js>'      # 任意 eval（走 window.__flightArcDebug）
node cdp-shot.mjs out/x.png   # 截圖
```

## 3. 跑一輪量測
```bash
sh run-scenario.sh <TAG> [seconds=8]
```
流程：暫停→trace→播放→trace→暫停→截圖，寫 `out/trace-<TAG>-{paused,playing}.json` + `out/shot-<TAG>.png`。

## 4. 指標欄位意義
- `fps`：`DrawFrame` 事件數 ÷ span 秒數
- `mainThread.busyPct`：主執行緒忙碌佔比；`selfTimeTop` 是**累計 ms**（÷ `spanSeconds` 才是 ms/s）
- `gpu.busyPct` / `sys.gpuHw.deviceUtilAvgPct`：GPU process busy vs. `ioreg` 硬體使用率（後者較準）
- `longTasks`：主執行緒單一 task > 50ms 次數
- `brief.py <summary.json>`：壓成一行方便比對

多螢幕、系統負載會讓絕對數字失真，同場景 before/after 盡量背靠背跑、避免中途換視窗。

## 5. 視覺回歸（visual-check）

固定相機 + 固定時刻 + 凍結動畫 → 截圖 → 與 baseline 逐像素比對。用來確保效能改動「呈現不會錯」。

```bash
node visual-check.mjs --baseline [--scenes s1-rctp-dark,s2-apac-dark]
node visual-check.mjs --compare  [--scenes ...]        # 任一 FAIL → exit 1
python3 visual-diff.py a.png b.png diff.png            # 單獨比兩張圖
```

- 場景定義：`visual-scenes.json`（6 個；相機是對著活的 app 讀出後釘死的字面值，時間存 unix 秒）
- 輸出：`out/baseline/`、`out/current/`、`out/diff/`（diff 圖差值 ×20 方便肉眼看）
- 動畫凍結靠 `window.__flightArcDebug.freezeAnimation(t)`（DEV-only，見 `src/three/animClock.ts`）：光球呼吸／閃爍、機場 bloom、空域極光的 wall-clock 時間釘死，並停掉所有 CSS animation/transition

### 通過標準
`pctOver8 < 0.15%` 且**不成塊**（16×16 block 內 `diff>8` 的像素超過 50% 即判成塊）。

顯著閾值是 **8/255 而不是 2/255**（2026-09-02 實測定的）：additive 下把兩次 8-bit 累加合併成一次（T0-1）數學上等價，但每條線的捨入會累積，軌跡密集處實測最大到 8/255 —— 任何顯示器上都不可辨。用 2/255 當門檻時，密集區整個 block 會被捨入差填滿而誤判成塊。改用 8/255 後，Tier 0 前後比對在 s1-rctp-dark / light / timewindow 的 `pctOver8` 都是 **0.000%**，而真實差異（s1-progressive 的 T0-5 修正）仍被算出來（0.022%）。`pctOver2` 與 `blockyWorst2` 仍會輸出供人工參考。

### 每次執行都會先 bootstrap（不要拿掉）
連線後先 `Page.reload` 再強制走一次 `light → dark`。原因是實測（2026-09-02）**底圖 style 切換會改變軌跡渲染結果**：同一場景在「reload 後從未切過 style」與「切過 light→dark」下 maxDiff 達 90，但兩次都切過就是 0。場景序列裡 `s1-rctp-light` 會切 style，於是「這次執行有沒有跑過 light 場景」會影響 dark 場景的結果。bootstrap 讓所有執行從同一起點出發。

### 已知噪聲底線（2026-09-02，同一 commit 背靠背 baseline → compare）

| 場景 | maxDiff | >2px% | >8px% |
|---|---:|---:|---:|
| s1-rctp-dark / light / progressive / timewindow | 0–1 | 0% | 0.000% |
| s2-apac-dark | 68 | 0.14% | 0.068% |
| world-globe-far | 83 | 0.12% | 0.046% |

S1 系列是完全可重現的（唯一例外是底部播放列 UI 有 16 px 的 1/255 抗鋸齒差）。S2 與 world 還有 0.12–0.14% 殘留，推測與多檔併發載入的完成順序、光球 `MAX_INSTANCES=1024` 截斷、光軌 `MAX_SLOTS=6000` 溢位有關（後兩者是 `plan` 的 G4 已知缺陷）。**比對這兩個場景時，差異若在此量級且不成塊視為噪聲；超過或成塊才是回歸。**

## 6. Summary 數字快照（summary-snapshot）

證明渲染改動沒有動到 Sidebar Summary 面板的統計數字（Phase 2 換 LOD 時特別重要）。

```bash
node summary-snapshot.mjs --baseline    # 預設三個資料集合不同的場景：s1 / s2 / world
node summary-snapshot.mjs --compare     # 深度比對，任一場景有差 → exit 1
```

- 資料來自 `window.__flightArcDebug.summarySnapshot()`，輸入就是 Summary 面板實際吃到的 `finalFlights`
- 排序類統計一律存成無序 `{key: count}`（同分時的順序取決於航班陣列疊代順序，會造成假 diff），另附 `xxxOrdered` 供人工判讀
- 另存 `flightCount` 與 `fr24_id` 排序後的 hash，用來區分「統計算法變了」還是「載到的航班集合變了」
- ⚠️ airport scope 的 `total` = `departures + arrivals`，不是 `flightCount`（起訖同機場會算兩次）

## 7. A/B 量測的噪聲（2026-09-02 踩過）

`sh ab-run.sh <tag> <s1|s2>` 會先 reload → 設場景 → **釘死相機與時刻** → 再跑 `run-scenario.sh`。不這樣做的話，前一輪跑完留下的相機位置與累積的 heap（實測跑過 6 場景後 heap 到 1.9 GB）會讓兩次量測不可比。

**`mainThread.busyPct` 在 S1 場景的噪聲是 ±6 個百分點**：同一份程式碼連跑三次，播放時分別是 41% / 52% / 53%。拿單次結果當基準會得到「改壞了」的假結論。判讀規則：

- 看 `brief.py` 的 `perFrame.script`（ms/frame）而不是 `busyPct`，前者直接反映 CPU 工作量
- **同一版至少跑三次取中位數**，差異小於該場景的噪聲範圍就直說「測不出來」，不要挑對自己有利的那次
- 光球相關的改動要用 world 場景才測得出來（S1 只有 ~105 顆活躍光球、S2 ~116，world 才會頂到 `MAX_INSTANCES=1024`）

## 8. ⚠️ 量測環境會漂（2026-09-03 踩過，代價是一次假 FAIL）

**症狀**：全 6 場景 visual-check 突然 maxDiff 240–255、`pctOver8` 1.7–5.0%，看起來像大回歸。實際上 96% 的差異落在 DOM/UI chrome（sidebar 文字、時間軸 slider），WebGL 畫布本身乾淨。

**根因**：兩件事同時發生

1. 這台機器的 `devicePixelRatio` 在 session 中途從 1 變成 2（用戶闔上筆電再打開，螢幕配置改變）
2. `visual-scenes.json` 原本的 viewport override 是 1600×913，但 Chrome 視窗實際只有 **1469 CSS px** 寬（`window.outerWidth`）。override 成比視窗大的 viewport 時，`Page.captureScreenshot({fromSurface:true})` 的行為會受實際視窗表面影響 → 文字次像素渲染跨執行不一致

**現在的設定**：viewport 1400×800（留在視窗內），Chrome 用 `--window-size=1480,940`。

**每次開始量測前先確認**：
```bash
node cdp-eval.mjs "[devicePixelRatio, innerWidth, innerHeight, window.outerWidth, screen.width]"
```
viewport 必須 **小於** `outerWidth`／`outerHeight`。換螢幕、闔上筆電再開、外接顯示器插拔之後，**baseline 一律作廢重建**——baseline 與 current 必須在同一個實體環境產生，否則比對沒有意義。

**判斷是不是環境問題**：把 diff 分區統計（sidebar / 底部控制列 / 地圖主體）。差異若壓倒性落在 UI 而地圖主體乾淨，就是環境；反過來才是真回歸。確認方式是在同一環境下對**同一個 commit** 跑 baseline → compare，應該得到 maxDiff = 0。
