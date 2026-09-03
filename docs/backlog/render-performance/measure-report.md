# Flight Arc 效能量測報告（補測部分：A/B/C/D）

分支：`perf/render-audit`　harness 目錄：`scratchpad/perf/`
量測時間：2026-09-02　Chrome 152.0.7977.65（M3 / Metal，ANGLE renderer）

## 環境備註（影響方法論，先講）

- 重建 Chrome session 時，新開的分頁一度落在 Retina 內顯示器（DPR 2、3 顯示器環境：內建 Retina + 2 台 Dell 1:1 外接），且視窗座標一度是負值（`top:-703`），導致 `document.visibilityState` 卡在 `hidden` → rAF 被節流 → `scene.isStaticBuilding()` 卡死不收斂（等了 >3 分鐘沒過）。修法：
  1. 用 `Browser.setWindowBounds` 把視窗挪回可見座標；
  2. 之後重開 Chrome 時額外加 `--disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling`，避免原生遮擋偵測誤判（這個問題不加此 flag 會在 trace 中途讓某幾秒鐘的 busy/GPU 使用率驟降到接近 0，數字會失真——terrain-off 的第一次量測就中過這個雷，已作廢重量）。
  3. A/B 段用 `Emulation.setDeviceMetricsOverride(width:1600,height:913,deviceScaleFactor:1)` + `map.resize()` 把 canvas 釘死在跟原始 S1/S2/S4 一致的 `1600×913`（DPR1），這樣才能跟既有數字比。注意：`window.devicePixelRatio` 這個 JS 值本身偶爾會在重新 CDP 連線後回報成 2（讀值的 flakiness），但實際 `canvas.width/height` 全程鎖在 1600×913 沒變過——已用「canvas 實際像素」而非 `dpr` 欄位作為量測解析度的依據。
  4. C 段（DPR2）改用 Chrome flag `--force-device-scale-factor=2` 硬設，不靠 Emulation override；此時視窗內容區的 CSS 尺寸是 1469×862（非 1600×913 的 2 倍），canvas 實際像素為 **2938×1724**（詳見第 4 節說明，非乾淨的「同 CSS 尺寸 ×2」）。

---

## 1. 測試 #1：暫停時是否永續重繪

| 場景 | rafPerSec | mapRendersPerSec | triggerRepaintPerSec | 主要 caller | flights | activeOrbCount | GPU hw util% |
|---|---|---|---|---|---|---|---|
| S1 RCTP 單機場，暫停 | 60.0 | 60.2 | 60.6 | `src/map/customLayer.ts` 60.2/s | 649 | 107 | 66% |
| S2 apac-hub 差集，暫停 | 33.7 | 33.9 | 34.3 | `src/map/customLayer.ts` 33.9/s | 3769 | 726 | 99% |
| S2 apac-hub 暫停 + **runtime patch** `hasActiveOrbs()→false` | **0** | **0** | **0** | （無） | 3769 | 726（gate 前仍是 726，只是 gate 回傳 false） | 34%（樣本 `[99,11,12,14]`，patch 生效後迅速歸零） |

**結論：暫停時確實永續重繪，根因是 `scene.hasActiveOrbs()` 這個 gate**。時間軸暫停（`timeline.pause()`）只停止航班沿弧線移動，並不會讓機場光球脈動動畫（`activeOrbCount`）歸零；只要 `activeOrbCount > 0`，`customLayer.ts` 就會每幀呼叫 `map.triggerRepaint()`，逼 Mapbox 持續 `render` → Three.js 持續繪製，即使畫面上大部分內容（航跡）根本沒在動。用 runtime patch 把 gate 強制回傳 false 後，rAF/render/triggerRepaint 全部瞬間歸零、GPU 硬體使用率從 99% 掉到 34%（且樣本序列顯示是「立刻」掉，不是逐漸衰減），證實這條 gate 是唯一驅動源，沒有其他背景重繪路徑。

S1 在暫停時 rafPerSec 仍有 60（滿速），S2 只有 33.7——兩者都是「activeOrbs>0 驅動的永續重繪」，差異只在於 S2 場景更重（3769 航班、500 萬+ lines），GPU/主執行緒被拖慢到 vsync 拿不滿 60fps，不是 gate 邏輯本身不同。

---

## 3. S2 apac-hub 差分開關表

基準：`exitSetMode()` → `applySavedSet(apac-hub)`，3769 flights 穩定、`isStaticBuilding()=false`。canvas 全程 1600×913（DPR1）。

### 暫停（paused）

| toggle | fps | main busy% | GPU hw util% | three.lines | Δfps | Δbusy% | ΔGPU% | Δlines |
|---|---|---|---|---|---|---|---|---|
| 基準（trails+glow0.8+terrain） | 34.1 | 98.7 | 97 | 5,069,719 | — | — | — | — |
| 地形關閉 `setTerrain(null)` | 35.1 | 98.4 | 99 | 5,071,019 | +1.0 | −0.3 | +2 | ≈0 |
| Glow 停繪 `setAirportGlow(0)` | 53.2 | 98.9 | 99 | 2,542,399 | +19.1 | +0.2 | +2 | **−49.9%** |
| 靜態軌跡隱藏 `setDisplayMode('status')` | 118.9 | 97.0 | 99 | 14,169 | +84.8 | −1.7 | +2 | **−99.7%** |
| 三者同時關 | 119.2 | 58.9 | 88 | 16,379 | +85.1 | **−39.8** | **−9** | **−99.7%** |

### 播放（playing，speed 60x）

| toggle | fps | main busy% | GPU hw util% | three.lines | Δfps | Δbusy% | ΔGPU% | Δlines |
|---|---|---|---|---|---|---|---|---|
| 基準 | 33.4 | 98.2 | 99 | 5,069,979 | — | — | — | — |
| 地形關閉 | 33.6 | 98.3 | 99 | 5,071,019 | +0.2 | +0.1 | 0 | ≈0 |
| Glow 停繪 | 48.1 | 99.3 | 99 | 2,542,529 | +14.7 | +1.1 | 0 | **−49.9%** |
| 靜態軌跡隱藏 | 100.8 | 99.2 | 93 | 14,299 | +67.4 | +1.0 | −6 | **−99.7%** |
| 三者同時關 | 109.2 | 98.9 | 85 | 16,509 | +75.8 | +0.7 | −14 | **−99.7%** |

**判讀**：
- **displayMode='status'（隱藏靜態軌跡）貢獻最大**——單獨就能把 lines 從 500 萬砍到 1.4 萬（−99.7%），fps 翻 3–3.5 倍。這是 4 個開關裡唯一能真正把「幾何量」砍掉的，其餘三個動的是「要不要畫」而非「畫多少」。
- **Glow 停繪**貢獻其次，且有個意外發現：關閉 airport glow 讓 `three.lines` 也砍半（500萬→254萬），暗示 glow 光暈（脈動環）目前也是用 line 幾何畫的，不是純 additive sprite/quad——這點建議回報給前一位工程師確認是否符合預期。
- **地形關閉單獨看幾乎沒差**（Δfps 只有 ±1），但跟其他兩個疊加時（三者同開）busy% 才明顯多降 40pt、GPU 多降 9–14pt——地形的成本主要是跟大量 line 幾何**疊加**時的合成/深度測試開銷，單獨關掉看不出來，因為此時 GPU 早已被 line 繪製本身塞滿（bottleneck 在別處，關地形省不到）。
- 暫停時三個一起關能把 main busy% 從 98.7% 壓到 58.9%（不再是 100% 飽和），代表此時主執行緒才真正有喘息空間；播放時因為航班位置計算本身還在跑（scripting 上升），busy% 仍卡在 99% 左右，沒有暫停時降得明顯。

---

## 4. DPR 1 vs 2（S2 apac-hub，暫停）

| | canvas 實際像素 | 像素量 | fps | main busy% | WaitForGetOffset ms/s | GPU hw util% | three.lines | heap MB |
|---|---|---|---|---|---|---|---|---|
| DPR 1（Emulation override 1600×913×1） | 1600×913 | 1,460,800 | 34.1 | 98.7 | 889.6 | 97 | 5,069,719 | 645.0 |
| DPR 2（`--force-device-scale-factor=2`，CSS 1469×862） | 2938×1724 | 5,065,112（**×3.47**） | 30.7 | 98.9 | 910.9 | 98 | 5,067,509 | 531.2 |

播放狀態一併記錄：DPR1 fps 33.4 / busy 98.2% / GPU 99%；DPR2 fps 29.5 / busy 98.6% / GPU 99%。

**判讀**：canvas 像素量增加到 3.47 倍，fps 只掉了約 10%（34.1→30.7 暫停、33.4→29.5 播放），main busy% 和 GPU util% 兩邊都早已飽和在 97–99%——代表這個場景的瓶頸主要**不是**逐像素的 fragment fill rate，而是主執行緒被 `CommandBufferProxyImpl::WaitForGetOffset`（GPU command buffer 同步等待）卡住、加上大量 draw call/line 幾何本身的提交開銷。換句話說單純降 DPR 換不到多少 fps，因為省下來的是填色時間，而不是目前的瓶頸項。

⚠️ 此比較不是嚴格的「同 CSS 尺寸只差 DPR」對照組——DPR2 那次視窗的 CSS 內容區是 1469×862，跟 DPR1 釘死的 1600×913 不同（環境限制，見開頭備註）。像素量差距用實際 canvas 尺寸換算（×3.47）而非理論上的 ×4，數字仍具參考性但非完美控制實驗。

---

## 2. 場景總表（S1 / S2 / S4 / S3，暫停 / 播放）

三者位址：canvas 全程 1600×913（DPR1）。S1/S2/S4 抄自既有 `run-S1.log` / `run-S2.log` / `run-S4.log`；S3 為本輪新測。

| 場景 | phase | flights | points | three.lines | fps | main busy% | WaitForGetOffset ms/s | GPU hw util% | longtasks | heap MB |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 RCTP（單機場） | paused | 649 | 442,806 | 885,873 | 59.8 | 27.9 | 156.5 | 91 | 0 | 151.2 |
| S1 RCTP | playing | 649 | 442,806 | 885,873 | 59.6 | 58.8 | 145.4 | 90 | 0 | 151.7 |
| S2 apac-hub（6 機場差集） | paused | 3,769 | 2,533,949 | 5,071,409 | 35.3 | 98.2 | 866.9 | 98 | 3 | 574.8 |
| S2 apac-hub | playing | 3,769 | 2,533,949 | 5,071,409 | 35.4 | 98.7 | 585.0 | 99 | 1 | 573.3 |
| S4 manual4（RCTP+VHHH+RJTT+WSSS） | paused | 3,629 | 2,563,128 | 5,138,107 | 43.8 | 98.7 | 877.2 | 97 | 0 | 1284.5 |
| S4 manual4 | playing | 3,629 | 2,563,128 | 5,138,107 | 40.9 | 99.3 | 243.6 | 99 | 0 | 1293.6 |
| S3 world（region=all，全球） | paused | 66,478 | 1,048,287 | 2,639,633 | 32.7 | 98.9 | 899.4 | 98 | 0 | 749.9 |
| S3 world | playing | 66,478 | 1,048,287 | 2,644,183 | 30.4 | 99.0 | 538.0 | 98 | 0 | 784.9 |

補充（S3 world，`stats` 內 `activeOrbs`）：paused 5,256、playing 5,289、最終截圖前 5,448（本輪 `run-S3-all.log` 尾端 `stats:`）。

**S3 觀察**：flights 暴增到 6.6 萬（S2 的 17.6 倍），但因為 world scope 縮圖後線段被裁得更短，`three.lines` 反而只有 264 萬，比 S2/S4 的 500+ 萬還低；fps（32.7/30.4）跟 S2 apac-hub（35.3/35.4）同一量級——這場景的瓶頸看起來是 5,000+ activeOrbs（機場光球）與 draw call 數（76 calls vs S2 的 48），而不是純線段量。

---

## 5. 環境

- **Chrome**：152.0.7977.65（`curl localhost:9333/json/version`）
- **GPU renderer**：`ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)`（`gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)`）
- **DPR**：A/B 段用 Emulation override 釘在 1（canvas 1600×913）；C 段用 `--force-device-scale-factor=2`（canvas 2938×1724）
- **顯示器環境**：內建 Liquid Retina XDR（DPR2）+ Dell S2421HSX / Dell U2415（皆 DPR1，UI look-like = 原生解析度）——這是造成本輪 visibility/DPR 波折的根本原因

---

## 6. 重跑指令清單

```bash
PERF="/private/tmp/claude-501/-Users-migu-Desktop-----gen-ai-try-ichef-----GIS-plan-art/462595c7-9dc2-4b2e-ba1a-6e30c96b9dad/scratchpad/perf"
cd "$PERF"

# 0. 啟動 dev server + Chrome（加防遮擋 flag，避免 visibilityState 卡 hidden）
npm run dev -- --port 5199 --strictPort &   # repo 根目錄執行
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 --user-data-dir="$PERF/chrome-profile" \
  --no-first-run --no-default-browser-check --window-size=1600,1000 --window-position=100,100 \
  --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding --disable-background-timer-throttling \
  http://localhost:5199/ &

# 1. 釘死 DPR1 / canvas 1600x913（A/B 段用；C 段改用 --force-device-scale-factor=2 重開 Chrome，不做這步）
node reassert-dpr1.mjs

# 2. S2 差分開關（A）
node cdp-eval.mjs "window.__flightArcDebug.exitSetMode && window.__flightArcDebug.exitSetMode(); 1"
node scenario.mjs s2                       # 建 apac-hub 場景，等 stable
sh run-scenario.sh S2diff-base 6
node scenario.mjs terrain-off && sh run-scenario.sh S2diff-terrainoff 6 && node scenario.mjs terrain-on
node scenario.mjs glow0        && sh run-scenario.sh S2diff-glow0 6        && node scenario.mjs glow08
node scenario.mjs status       && sh run-scenario.sh S2diff-status 6       && node scenario.mjs trails
node scenario.mjs terrain-off && node scenario.mjs glow0 && node scenario.mjs status
sh run-scenario.sh S2diff-triple 6
node scenario.mjs terrain-on && node scenario.mjs glow08 && node scenario.mjs trails

# 3. S3 world（B）
node cdp-eval.mjs "window.__flightArcDebug.exitSetMode && window.__flightArcDebug.exitSetMode(); window.__flightArcDebug.setScope('region'); 1"
node cdp-eval.mjs "window.__flightArcDebug.setRegion('all'); 1"
# 手動輪詢 getFlights().length 直到停止增長 ≥10s 且 isStaticBuilding()=false
sh run-scenario.sh S3-all 6

# 4. DPR2（C）：先關 Chrome，加 --force-device-scale-factor=2 重開，不做步驟 1 的 override
node cdp-eval.mjs "window.__flightArcDebug.exitSetMode && window.__flightArcDebug.exitSetMode(); 1"
node scenario.mjs s2
sh run-scenario.sh S2-dpr2 6

# 收尾
kill <chrome.pid>; kill <dev-server pid on :5199>
```
