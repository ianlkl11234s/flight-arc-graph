# 無人值守自動產片 — 可行性調查

> 2026-07-27 調查產出，**尚未動工**。三路平行調查（程式碼盤點 / 外部技術廣搜 / 架構意見）。
> 目標：把「開 Chrome → 手動設 keyframes → 按 HQ 按鈕 → 顧著它跑」變成可排程、可重現、無人值守的產片管線。
> 起因：手上有一台 Zeabur 專屬機（4 核 EPYC 7642 / 8GB，CPU 長期只用 5%），想問能不能拿來產片。

---

## TL;DR

1. **🔴 Mapbox 授權可能讓整件事不成立**，且影響的不只是未來自動化，是現在正在發布的影片。**動工前先解決這條。**
2. 技術上可行，但**現況「可被程式化驅動」的程度只有 2/10** — 渲染核心天生適合 headless，但整條鏈沒有留任何程式化入口。
3. 有兩個 bug 要先修，其中一個**現在就在影響人工流程的成片品質**。
4. 軟體渲染要用 **Mesa llvmpipe 不是 SwiftShader**（快 4×，且 SwiftShader 需 ~10 核，本機只有 4 核）。
5. 執行環境的意外選項：**GitHub Actions public repo = 4 核 / 16GB / 免費不限量 / 原生 cron**，記憶體是自有機可用量的 5 倍。

---

## 🔴 0. 前置阻斷項：Mapbox 授權

Mapbox Product Terms（2026-02-05 版）：

> **§1.7** Customer may not use any Licensed Map Content in any printed or **video media** except expressly as set forth in this Section.
> **§1.7.1** …to promote Customer's Licensed Applications **as long as the Licensed Map Content is shown only incidentally**…
> **§1.9** Customer shall (i) **only query the Services in response to human user queries and human application interactions**, (ii) **not perform bulk or automated queries**…

`src/components/StyleSelector.tsx:3-11` 七個 style 全為 `mapbox://styles/mapbox/*`。

- 一支「整個畫面就是地圖」的 YouTube 影片，難以主張符合 §1.7.1 的 *incidentally*
- 「排程無人值守渲染」按字面即 §1.9 的 automated queries

**兩條合法路徑**：
- (a) 購買 §1.7.4 的 Purchased Video Rights
- (b) **換 MapLibre GL JS + 自架 PMTiles**（推薦）

選 (b) 的附加理由：GIS 生態系已有 `base_map` PMTiles 基礎設施；換過去順帶解決 **token build-time 注入 / rate limit / tile 載入時序不確定** 三個 headless 痛點。Remotion 官方地圖指南用的也是 MapLibre 而非 Mapbox。

⚠️ 上述為條文轉述，實際決策前請自行覆讀原文。**在這條有結論之前，下面的技術工作不要投入。**

---

## 1. 現況盤點（2026-07-27 程式碼實況）

### 渲染引擎

Mapbox GL JS v3（實裝 3.18.1）+ Three.js r172，**共用同一個 WebGL context**。無 deck.gl / maplibre。

| 項目 | 位置 |
|---|---|
| Map 初始化（`antialias:true`, `preserveDrawingBuffer:true`） | `src/map/MapView.tsx:253-262` |
| Three 掛載（Mapbox CustomLayer, `renderingMode:"3d"`） | `src/map/customLayer.ts:74-77` |
| Three renderer（複用 Mapbox 的 gl, `autoClear=false`） | `src/three/FlightScene.ts:190-195` |
| 3D 地形（`setTerrain({exaggeration:1.5})`） | `src/map/MapView.tsx:164-174` |

全專案 grep 不到 `getExtension` / `OES_` / `EXT_` / `ANGLE_` — **無特殊 extension 依賴**，用到的都是標準特性（InstancedMesh / BatchedTrails / AdditiveBlending / 自訂 GLSL）。

> 對軟體渲染的意涵：`preserveDrawingBuffer:true` 已設好（readback 友善），但 **DEM terrain + globe 投影 + additive blending 光軌是軟渲染上最貴的三件事**。headless 專用配置可考慮關 terrain、globe 改 mercator、`antialias:false`。

### HQ 匯出迴圈 — 最大資產

`src/hooks/useCanvasRecorder.ts:307-353`：

```js
t = i * (1/fps)
cam = computeCameraAtTime(keyframes, seqTime)   // 純函式，零 side effect
map.jumpTo({center, zoom, pitch, bearing})       // 只驅動「相機」
await waitForRender(map)
ctx.drawImage(srcCanvas,0,0); drawOverlay(...)
track.requestFrame()                             // captureStream(0) 手動送幀
```

**這已經是 seek-based 確定性逐幀渲染器**，正是 Remotion / HyperFrames 的核心模型。且用 async/await 而非 `requestAnimationFrame` 推進 → **不會被 headless 的 rAF throttle 卡死**。

相機數學已抽成純函式，外部驅動器可直接 import：
- `computeCameraAtTime(keyframes, elapsed)` — `src/hooks/useCinemaCamera.ts:140-200`
- `getSequenceDuration(kfs)` — `src/hooks/useCinemaCamera.ts:105-114`
- `resolvePingpongTime(elapsed, seqDuration)` — `src/hooks/useCinemaCamera.ts:123-127`

### ⭐ 關鍵發現：10 分鐘影片只渲染 30–190 秒

`scripts/compose-video.sh:34-44`：

```bash
ffmpeg -y -r 30 -stream_loop -1 -i "$VIDEO" -stream_loop -1 -i "$MUSIC" -t "$DURATION" ...
```

`-stream_loop -1` 套在**影片輸入**上 → 「10 分鐘」是短片無限循環後在 600 秒切斷（`output/flight-arc-190s-*.mp4` 印證）。

**真實渲染預算 = 900–5,400 unique frames，不是 18,000。** 工作量差 3–20 倍，這讓軟體渲染從「不可能」變成「可接受」。

### 資料來源

**無 Supabase、無即時 API**，運行時只讀靜態 NDJSON。

| 路徑 | 大小 |
|---|---|
| `public/tracks/` 總計 | 3.1 GB |
| `airports/RCTP.jsonl` | 220 MB（7,678 航班） |
| `regions/all.jsonl`（LOD ≤40 點/航班） | 56 MB（54,533 航班） |
| `public/airspace/` | 54 MB |

單支影片只需**一個 scope 的量**（最壞 RCTP 220MB）。載入走 `src/data/flightLoader.ts:199-200, 410-413, 428-431` 三段 fallback（Zeabur volume → local public → S3）。影片長度與資料量無關（由 `-stream_loop` 決定）。

### 既有自動化嘗試：零

跨 `docs/` `.claude/` `scripts/` `src/` grep `headless` / `puppeteer` / `playwright` / `xvfb` / `swiftshader` / `無人值守` — **完全零命中**。git log 相關 commit 全是加 UI 功能與寫人工 SOP。

---

## 2. 必修的兩個 bug（與渲染在哪無關）

### 🔴 B1 — 模擬時鐘與牆鐘耦合（成片不可重現）

HQ 匯出迴圈**只驅動相機**，飛機動畫的模擬時鐘不在迴圈裡：

- `src/hooks/useTimeline.ts:124-148` — RAF + 牆鐘：`setCurrentTime(prev => prev + dt * speed)`
- `src/App.tsx:806 / 828 / 937` — `timeRef` 餵給 custom layer
- HQ 匯出期間 timeline **不會暫停**（`isExporting` 只用來隱藏 UI，見 `App.tsx:1191/1204/1279/1342/1383`）

**後果：鏡頭是 frame-accurate 的，飛機不是。機器渲染越慢，成片裡飛機飛得越快。** 同一組 keyframes 在不同機器、甚至同機不同負載下匯出，飛機運動都不一致。

在慢 20 倍的軟體渲染上，飛機會飛快約 20 倍 → **這是 headless 的硬阻斷項**。

**修法**：`useTimeline` 加 `externalClock?: () => number`，HQ 迴圈改 `timeline.seek(startT + i/fps * speed)`。`timeline.seek()` 已存在（`useTimeline.ts:154-160`），只是沒暴露到 hook 外。
**注意：修完對現行人工流程也是淨收益**（成片終於可重現）。

### 🟡 B2 — `waitForRender` 200ms 逾時

`src/hooks/useCanvasRecorder.ts:129-142`：

```js
map.once("render", done);
map.triggerRepaint();
setTimeout(done, 200);   // ⚠️ 200ms 就放棄
```

第一個 `render` 事件或 200ms 逾時就往下走。Mac GPU 上剛好夠（但 `video-production/SKILL.md` 記的「開頭 0–15 秒必凍」就是它的症狀）；軟體渲染上 **200ms 連一幀都畫不完 → 5,700 張半成品/空白瓦片**。

**修法**：改等 `map.once('idle')`，逾時放大到 10–30 秒，配合 `map.areTilesLoaded()` 守門 + 首幀前 tile 預熱。
參考：[mapbox-gl-js#7721](https://github.com/mapbox/mapbox-gl-js/issues/7721)

---

## 3. 程式化入口改造（約 1 個工作天）

現況 **`src/` 內 `URLSearchParams` 零命中、無 window 全域、無 CLI**。可被程式化驅動程度 **2/10**；完成下列三項後為 **8/10**。

| # | 改造 | 現況位置 |
|---|---|---|
| 1 | **注入時鐘**（見 B1） | `useTimeline.ts:124-148` |
| 2 | **URL 驅動** `?seq=/seqs/x.json&capture=1&hq=1&fps=30` — mount 時 fetch keyframes、自動進 Capture、自動開跑 | `App.tsx:208` captureMode 只能點 UI 進入；`useCinemaCamera.ts:458-478` `importSequenceJSON` 走 `<input type=file>`，換成 `fetch(url)` 即可 |
| 3 | **輸出改 PNG 序列**（可選）`composite.toBlob()` → ffmpeg `-framerate 30 -i frame_%06d.png`，順帶消滅 variable-timestamp 問題、`-r 30` hack 可退休 | `useCanvasRecorder.ts:186-194` 現走 `<a download>` blob，路徑不可控，headless 需 CDP `Page.setDownloadBehavior` |

**Keyframes 現況**：只能人工「飛到定位 → 按 + Add KF」（`useCinemaCamera.ts:257-270`），存 localStorage key `flight-arc-cinema-sequences`。
**注意**：配色主題**刻意不持久化**（`App.tsx:617-620` 主動 `removeItem`），無法用 seed 方式指定，每次回預設。

---

## 4. 軟體渲染：用 llvmpipe 不要用 SwiftShader

兩份 2026-06 獨立實測：

| 後端 | CPU 佔用（25s Canvas2D+WebGL2） | 重 3D 場景單頁 | WebGL2 |
|---|---|---|---|
| SwiftShader | ~999%（**需 ~10 核**） | 24 秒 | ✅ |
| **Mesa llvmpipe** | **~513%（省 49%）** | **6 秒（快 4×）** | ✅ |
| Mesa lavapipe | ~153% | — | ❌ 壞掉 |

來源：[botbrowser.io 2026-06](https://botbrowser.io/en/blog/mesa-llvmpipe-vs-swiftshader-chromium-linux/)、[Microlink 2026-06-29](https://microlink.io/blog/webgl-without-a-gpu)
llvmpipe 用 LLVM JIT 把 shader 編成原生 AVX2 + tiled 多執行緒；SwiftShader 是保守的可攜式解譯。

**4 核機的推論**：SwiftShader 要 ~10 核才餵得飽 → 它自己會是瓶頸。llvmpipe 的 ~5 核需求雖也超過 4，但差距小得多。

### 啟動配方

```bash
apt install libgl1-mesa-dri libglx-mesa0 libegl-mesa0 libvulkan1 fonts-noto-cjk
export LIBGL_ALWAYS_SOFTWARE=1
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99
```

Chrome 旗標：`--use-angle=gl --no-sandbox --disable-dev-shm-usage --mute-audio --font-render-hinting=none`

**必須拿掉**：`--disable-gpu`（會靜默強制回 SwiftShader）、`--in-process-gpu`（破壞 GL surface binding）、`--use-angle=swiftshader`

**Xvfb 不能省**：沒有 X display 時 WebGL 會**靜默降級成平面 2D** — 畫面錯了但零錯誤訊息。

⚠️ **Chrome 137 起自動 SwiftShader fallback 已正式移除** — 不加旗標時 WebGL context 是**直接建立失敗**，不是變慢（[blink-dev Intent to Remove](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM)）。備援組合需顯式 `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`。

### 擷取方式：保留頁內 MediaRecorder

| 方式 | 吞吐 | 判定 |
|---|---|---|
| **頁內 MediaRecorder + `captureStream(0)`** | 零 per-frame IPC | ⭐ **已在用，直接留著** |
| `page.screenshot({type:'jpeg'})` | 複雜 WebGL 頁 **~1 張/秒** → 5,700 幀 = **1.6 小時純截圖開銷** | 次選 |
| `HeadlessExperimental.beginFrame` | — | ⚠️ **Chromium 147+ 已移除** |
| `Page.startScreencast` | wall-clock 驅動、會掉幀 | ❌ 不可重現 |

### 容器化雜項

- `chunksRef` 全程累積在 JS heap（190s @12Mbps ≈ 285MB）→ `recorder.start(1000)` 已在切 timeslice，改成邊產邊寫出
- 加 `maxTileCacheSize` 壓低 tile cache 記憶體
- 地圖初始化加 `interactive:false`、`fadeDuration:0`
- `/dev/shm` 在 k3s 預設 64MB → 掛 `emptyDir{medium:Memory, sizeLimit:1Gi}` 或 `--disable-dev-shm-usage`
- 裝 `fonts-noto-cjk`，否則 overlay 中文全變豆腐框
- 用 `tini` 收殭屍 Chrome 子行程

---

## 5. 執行環境選項

| 方案 | 規格 | 成本 | 判定 |
|---|---|---|---|
| **GitHub Actions（public repo）** | **4 核 / 16GB / 14GB SSD**，原生 cron，單 job 上限 6hr | **$0 不限量** | ⭐ 首選，記憶體是自有機的 5 倍 |
| GitHub Actions（private repo） | 2 核 / 8GB，吃 2,000 分鐘/月額度 | $0 但額度緊 | ❌ 每天 4.5hr = 8,100 分鐘/月，直接爆 |
| 自有 Zeabur 機 | 4 核 EPYC 7642 / 可用 3.3GB | 已付 $40/月 | ⚠️ 備援；能過但一路貼上限 |
| Mac（本機 GPU） | proven、視覺零走樣 | $0 | ⚠️ 筆電會跟著你出門，不算穩定節點 |
| GCP Cloud Run Jobs + L4 | GPU，快 2–10× | ~$8–10/月 | 一天多支才值得 |
| GCP T4 spot | GPU | ~$0.8/月 | 搶佔處理複雜度 |

**public repo 的真實代價**：Mapbox token 是 build-time 注入（`Dockerfile` ARG `VITE_MAPBOX_TOKEN`）、track 資料 3.1GB。要公開必須先處理這兩件。

⛔ **Fly.io GPU 官方公告 2026-08-01 起停止提供**，別選。

### 自有機現況（2026-07-27 實測）

```
CPU     AMD EPYC 7642 (Zen 2), 4 vCPU, AVX2 但無 AVX-512
        四核平行效率 3.58x（20.7s CPU time → 5.78s 牆鐘），無超賣無節流
記憶體  5.0G/7.8G，可用 3.3G，swap 已用 114M，PSI full avg10=1.84（有 stall）
磁碟    86G/157G，其中 /var/lib/rancher 74G + /var/log 8.7G（146 天累積垃圾）
```

大戶：`habermas-hermes` 1.27G（幾乎 0 CPU）、`gis-data-collectors` 1.15G、`osrm-taiwan` 834M（0 CPU）。
**若要用自有機渲染，先清掉前述閒置服務 → 可用記憶體 3.3G ⇒ 5.4G。**

---

## 6. 出局清單（省未來的時間）

**因功能出局（換再大的機器也沒用）：**

| 方案 | 死因 |
|---|---|
| **MapLibre Native / mbgl-renderer** | **不支援 custom layer** → three.js 弧線畫不出來。[FFI 文件](https://maplibre.org/maplibre-native-ffi/)明講 custom layers *not yet included*；舊 [mapbox-gl-native#16526](https://github.com/mapbox/mapbox-gl-native/issues/16526) 開到 repo 封存都沒解 |
| headless-gl (`gl`) / Node WebGPU (Dawn) | WebGL2 仍標 Experimental / 無 Canvas/DOM |
| deck.gl 官方 SSR | 不存在（maintainer 2026-03-22 [issue #4828](https://github.com/visgl/deck.gl/issues/4828) 正式回覆「沒有」） |
| Google Earth Studio | 無 API、要求分頁保持前景、不可商用 |
| Python 重做（cartopy/manim/PyVista） | 15–20 小時+，且做不出 glow arc |
| Blender headless CPU | 25–50 小時，4 核不現實 |

**框架層評估：**

- **Remotion** — 授權對本專案**免費**（個人/≤3 人公司，含商用；超過為 Creators $25/月/席、Automators $0.01/render 最低 $100/月）。但要用 React 重寫 composition，而現有 seek 迴圈已經對了 → **不值得換**。另有 2026 地雷：`docs/gl-options` 叫用 `swangle`、`docs/maps` 卻用 `--gl=angle`，官方自相矛盾；修 Chrome 137+ 斷鏈的 PR #9536 鎖在未發布的 v5.0 後面。
- **HyperFrames**（HeyGen, Apache-2.0，完全免費）— 架構與現有 HQ exporter 幾乎一樣（`seek(t)` → 截圖）。官方明列支援 three.js，且是**唯一有官方明文記憶體數字**的框架：**每 worker ≈ 256MB**，worker 數 = 核數 − 2，**≤4GB 機器用 1 worker**。若自幹 Puppeteer 遇到瓶頸，這是第一備案。

---

## 7. 建議路徑

| Step | 內容 | 前置 |
|---|---|---|
| **0** | 決定 Mapbox 怎麼處理（建議換 MapLibre + 自架 PMTiles） | — |
| **1** | 修 B1 注入時鐘 + B2 `waitForRender` 改等 `idle` | 無（對人工流程也是淨收益，可先做） |
| **2** | 加 URL 驅動程式化入口（約 1 天） | Step 1 |
| **3** | **跑 300 幀 pilot 用 llvmpipe 量 ms/frame** | Step 1-2 |
| **4** | 排程落地（GitHub Actions 優先） | Step 3 的數字 |
| **5** | 導演層（見下） | Step 4 跑穩 |

### ⚠️ Step 3 為什麼是決策點

**全網沒有任何 mapbox-gl + three.js + 軟體渲染的公開 benchmark**（三個獨立 agent 都確認這個缺口）。目前估算 5,700 幀 = **50 分鐘 – 4.5 小時**，跨度太大不能拿來做決策。最接近的 proxy 是 Shadertoy 類頁面，跟地圖負載差很多。

**若 pilot 顯示太慢，最大的兩個省力槓桿是**：降到 1280×720 再 ffmpeg lanczos 放大、縮短 keyframe 序列（反正結尾是 `-stream_loop`）—— **而不是換框架**。

---

## 8. 導演層設計（尚未動工，架構意見）

真正的難點不在渲染，在「鏡頭運鏡怎麼自動決定」。建議**拆成兩層，絕不混做**：

**選題（what to film）** — 對前一天資料算「戲劇性分數」：復飛（跑道附近高度 V 型再爬升）、盤旋等待圈、稀有機型、颱風日改降、深夜貨機潮、當日最忙一小時。
**外加一個永遠可用的保底格式**（如「RCTP 24 小時 time-lapse」）。
→ **variety 來自資料，reliability 來自保底庫，兩者分開負責。**

**運鏡（how to film）** — 不要生成自由相機曲線，做 **shot grammar**：5–6 個參數化鏡頭模板（establishing wide / orbit / chase-follow / push-in / top-down），導演腳本只是把 shot list「編譯」成現有的 `CameraKeyframe[]` 格式。
**防暈是真工程**：軌跡先 spline 平滑、heading 低通濾波、限制相機角速度與 jerk。自動運鏡讓人想吐的原因永遠是加速度突變，不是路徑不夠聰明。
**LLM 的正確位置**：從候選事件裡挑主角、寫標題描述。**不要讓 LLM 吐相機數字**。

**上線順序**：先讓保底格式全自動出片（date 當 seed 輪換 3–4 組固定運鏡），跑穩了再加事件導演。不要卡在最難的 20%。

### 穩定性設計

- **Chunk 化**：500–1,000 幀（約 30 秒）為原子單位，**每 chunk 重啟 Chrome**（歸零記憶體攀升）。因為 HQ 匯出已是確定性逐幀，frame index 本身就是 checkpoint
- **每 chunk 立即 encode 成 segment 然後刪幀**（磁碟使用有上界），最後 ffmpeg concat demuxer 拼接 → 已完成的工作永不重編碼
- **chunk 驗收**：幀數齊 + 抽樣亮度檢查（抓黑幀/破圖）+ 檔案大小 sanity；重試上限 3
- **根治 tile 非確定性**：basemap 改吃本機 PMTiles，渲染完全離線化；渲染前把當日航跡 freeze 成靜態快照

---

## 9. 勸退清單

- **重寫成不需瀏覽器的 renderer** — MapLibre Native 無 custom layer 已判死，自製 GL 是幾個月的工且會失去調校好的視覺
- **Day 1 就做 AI 導演** — 最大的過度工程風險，shot template 編譯器就是 90% 的價值
- **追 4K** — DPR=2 在軟體渲染上像素量 ×4，時間可能拉到數小時。鎖 1080p30，這是隨時能加回來的決定
- **現在上雲 GPU** — image / driver / 搶佔處理 / egress 的運維複雜度，對「一天一支」的節奏不成比例

---

## 附錄：數字誠實度

**實測（有出處）**：llvmpipe vs SwiftShader 的 999%/513% CPU 與 24s/6s；screenshot ~1 張/秒；HyperFrames 256MB/worker；Remotion 各級授權價；GitHub runner 規格；Mapbox 條款逐字；自有機 CPU/記憶體/磁碟/平行效率（2026-07-27 SSH 實測）。

**估算（務必自己 POC）**：5,700 幀在 4 核 llvmpipe 的總時間 50 分–4.5 小時（**本文最軟的數字**）；Blender 25–50 小時；cartopy 15–20 小時；雲端月成本。
