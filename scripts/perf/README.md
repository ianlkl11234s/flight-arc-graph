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
