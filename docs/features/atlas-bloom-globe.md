# 機場 Bloom 星圖（Atlas Bloom · Globe-Hugging）

> 機場總覽改成「夜空中發光的星點」：Three.js additive 偽 bloom + 貼合 Mapbox 球體。
> 大小＝航班流量、顏色＝流量色階(白→橘→紅) 或 資料完整度(可切換)。2026-07-10 新增。
>
> 此技術可跨專案移植（原型來自 `mini-taiwan-pulse` 的「發電廠 Bloom 測試」；本文含把它貼到 globe 的完整做法，反向也適用）。

---

## 成果

- 暗色底圖上，每座機場是一顆發光星點；密集區（歐洲、東亞）光暈自然疊加爆白，像城市燈火。
- 越大＝流量越高；顏色：**流量模式** 白(低)→橘(中)→紅(高流量樞紐)，或切成 **完整度模式** 4 級離散色。
- **貼合球體**：世界視角看整顆地球時，星點貼在球面上；地球背面的點自動淡出；拉近（z5–6）平滑退回平面。

---

## 新增檔案

| 檔案 | 角色 |
|---|---|
| `src/three/GlowPointsScene.ts` | **核心**。通用 bloom 場景，只吃 `{lon, lat, colorHex, sizeNorm}[]`，不綁業務資料。含 shader + globe 貼球。 |
| `src/map/atlasGlowLayer.ts` | Mapbox `CustomLayerInterface`；自 fetch `airport-points.geojson`，把機場轉成 `GlowPoint[]`，餵 globe 參數。 |
| `src/components/IconRailSidebar.tsx`（AtlasPanel） | UI：Bloom 開關（與原生 circle 版並存）+ 星點大小滑桿 + 顏色維度切換 + 動態圖例。 |
| `src/App.tsx` | 狀態 `atlasGlowVisible / atlasColorMode / atlasGlowSize`；layer 在 `handleMapReady` 掛載（每次 `style.load` 重掛）。 |

---

## 兩大關鍵技術

### 1. 偽 bloom（不是 UnrealBloomPass）

一支 `THREE.Points` draw call + 自訂 `ShaderMaterial`，**零新依賴**。三件事疊出光暈：

- **Fragment 三段徑向 halo**：`core`(smoothstep 0.18→0) + `mid`(0.55→0.18 ×0.55) + `far`(1.0→0.55 ×0.22)。
- **`THREE.AdditiveBlending` + `depthWrite/depthTest:false`**：重疊處顏色相加 → 密集區爆白（這就是 bloom 感）。
- **白心**：`col = mix(vColor, white, core * uCoreBoost)`，`coreBoost≈0.7`，中心白熱、邊緣本色。

大小：`sizeNorm = sqrt(值/max)`（sqrt 壓縮右偏分布）→ `minSizePx..maxSizePx`，再乘 `uPixelRatio * uZoomScale * uSizeMul`。
顏色：在餵資料時算好 `colorHex`（連續 ramp 或分類色），shader 不管語意。

### 2. 貼合 Mapbox globe（關鍵！custom layer 預設不貼球）

> **重要事實**：Mapbox GL v3 未設 projection 時，低 zoom 預設是 **globe**。而**所有 Three.js custom layer 預設都渲染成平面、不貼球**（只用 Mapbox 傳的平面 mercator matrix）。只有原生 circle/line/fill/symbol/heatmap 自動貼球。
> （`defaultProjectionData` / `CustomRenderMethodInput` 是 **MapLibre** 的 API，mapbox-gl 沒有，別往那找。）

**正解**：Mapbox 的 `CustomLayerRenderMethod` 其實每幀傳 **7 個參數**（`mapbox-gl.d.ts` 有 typed）：

```ts
render(gl, matrix,
       projection?,                     // globe 時 projection.name === "globe"
       projectionToMercatorMatrix?,     // ★ ECEF → mercator world 的 mat4
       projectionToMercatorTransition?, // ★ 0=球體、1=平面（z5-6 過渡，免費送）
       centerInMercator?, pixelsPerMeterRatio?)
```

做法（改動封在 vertex shader + 一個 attribute）：

1. **每點算 ECEF 球面座標**（`GLOBE_RADIUS = 8192 / 2π ≈ 1303.8`，注意 y 為負）：
   ```
   x = cosφ·sinλ·R;   y = −sinφ·R;   z = cosφ·cosλ·R      (φ=lat, λ=lng, 弧度)
   ```
2. **Vertex shader 混合**：
   ```glsl
   vec3 mercFromGlobe = (uGlobeToMerc * vec4(aEcef, 1.0)).xyz;
   vec3 world = mix(mercFromGlobe, position, uTransition);   // position = 既有平面 mercator 座標
   ```
   `uGlobeToMerc` = `projectionToMercatorMatrix`、`uTransition` = `projectionToMercatorTransition`。
   → transition=0 貼球、=1 退回原本平面行為，z5–6 之間 Mapbox 自動過渡。
3. **背面剔除（必做）**：additive + `depthTest:false` 下，地球背面的點會透出來像「地心鬼火」。用球面法線 vs 相機方向淡出：
   ```glsl
   vec3 nrm   = normalize(mat3(uGlobeToMerc) * aEcef);
   vec3 toCam = normalize(uCameraMerc - mercFromGlobe);
   float vis  = mix(smoothstep(-0.25, 0.05, dot(nrm, toCam)), 1.0, uTransition);
   ```
   相機位置 `uCameraMerc` 每幀取 `map.getFreeCameraOptions().position`（mercator 座標）。
4. **Mercator fallback**：render 只收到 2 個參數時，`uGlobeToMerc = identity`、`uTransition = 1`。

---

## 移植到其他專案（例：mini-taiwan-pulse 的發電廠加貼球）

1. **搬** `src/three/GlowPointsScene.ts`（含 globe shader）過去，它只依賴 `three` + 一個 `toMercator(lat,lng,alt)`。
2. **寫一個 `xxxToGlow()`**：把你的資料轉成 `{ lon, lat, colorHex, sizeNorm }[]`。
   - `sizeNorm = sqrt(值 / max)`；`colorHex` 要連續數值漸層就自己插 ramp、要分類色就查表。
3. **照 `atlasGlowLayer.ts` 骨架** 包一個 `CustomLayerInterface`：`onAdd` 抓資料、`render(gl, matrix, projection, projToMerc, transition)` 把 globe 參數 + 相機餵給 scene。
4. 底圖用暗色（`dark-v11` 或純黑 `applyPureBlackTheme`）。
5. **若原本沒貼球問題**（例如只在單一小區域、低 zoom 也不看球）→ 可略過 globe 那段，`GlowPointsScene` 在 mercator 下 `uTransition=1` 一切照舊。

---

## 參數速查（可調旋鈕）

| 旋鈕 | 位置 | 預設 | 說明 |
|---|---|---|---|
| `minSizePx / maxSizePx` | `atlasGlowLayer` 建構 `GlowPointsScene` | 12 / 110 | 星點像素大小範圍 |
| `coreBoost` | 同上 | 0.7 | 中心推白力道（越大越爆光） |
| `uSizeMul` | 面板「星點大小」滑桿 | 1.6（範圍 0.3–4） | 使用者即時放大/縮小 |
| `uZoomScale` | `setZoom()`，`pow(1.5, zoom-10)` clamp 0.15–3.5 | — | 隨地圖 zoom 縮放光暈 |
| 流量 ramp | `atlasGlowLayer.flowRamp()` | 白 `#fff` → 橘 `#ff8c1a` → 紅 `#ff1e1e` | 顏色維度=流量時 |
| 完整度色 | `atlasGlowLayer.STATUS_COLORS` | complete/core/partial/planned | 顏色維度=完整度時（與 circle 版同步） |
| 背面淡出門檻 | shader `smoothstep(-0.25, 0.05, …)` | — | 太多/太少 = 調這裡 |

---

## 航跡貼球（Flight Trails on Globe）

同一套 globe 手法也套到了「航跡弧線」（FlightScene 的 Three.js custom layer）。以前拉遠看 globe 時，3D 航跡是**平面飄在球旁**（所有 Three custom layer 的通病）；現在弧線貼合球面、環繞地球。

**做法（shader-compute，不動 buffer/快取）**：
- 共用 `src/three/shaders/globeProject.ts`：GLSL `globeWorldPosition()`（prepend 到 `staticTrail.vert` / `trail.vert`）+ JS `mercatorToGlobe()`（給 `InstancedOrbs` 光球 CPU 端算 instance matrix）。頂點在 shader 裡反推 lat/lng → ECEF → 徑向高度 → `mix(globeMerc, mercPos, uTransition)`。
- 每幀由 `customLayer.render` 收 Mapbox 7 參數，`FlightScene.setGlobe()` 更新共用 uniform（`uGlobeToMerc` / `uTransition` / `uCameraEcef`）分發給靜態/發光/所有動畫軌跡材質 + 光球。
- 高度 → 徑向：`hEcef = mercZ · 8192 · cosLat`（等價 Mapbox `globeMetersToEcef`）。
- 效能：`if (uTransition >= 1.0) return mercPos;` early-out → 拉近（mercator）零額外成本。

### ⚠️ 兩個血淚教訓（debug 花最久的地方）

1. **Mapbox globe 底圖會寫 depth buffer** —— `drawTerrainForGlobe` 用 `DepthMode(LEQUAL, ReadWrite)` 把實心球畫進主 framebuffer，**在 custom layer 之前**。所以 Three 的 3D 線材質只要 depthTest 開著（THREE 預設 true），**貼球的線會被實心球遮掉、整片消失**（連正面都被遮，因為球面用 `far=∞` 的矩陣畫、線用有限 far，同點深度有 ~0.005 NDC 差）。**解法：globe 下所有 Three 材質一律 `depthTest: false`**（背面靠 ECEF cull 藏）。（當時光球因前緣凸出暫時逃過、只有線消失，被當成鑑別線索——但 2026-07-25 Far View 事件證明光球在跨 z6 進 globe 時同樣整批被 depth 殺掉，「光球還在」不可靠；InstancedOrbs 材質已補 `depthTest: false`。）
2. **背面剔除在 ECEF 真球面空間做**，別在 mercator 空間憑感覺。相機取 `map.getFreeCameraOptions().position`（globe 模式可用、與投影同空間），CPU 端用 `inverse(uGlobeToMerc)·camMerc` 轉回 ECEF 存 `uCameraEcef`；shader `smoothstep(-0.08, 0.02, dot(dir, toCam))`。因為 depthTest:false，背面**完全靠這個 cull 藏**。**時序陷阱**：一定先 `fromArray(matrix)` 再 `invert()`；若忘了設相機 uniform → `uCameraEcef=(0,0,0)`=球心 → `dot≡−1` → **cull 全 0、整片消失**（跟 depth 遮擋長得一樣，容易誤判）。

（Mapbox 自家 symbol shader 的做法：`u_camera_forward` + 球心平面二值剔除，比真地平線寬鬆；我們用 ECEF 點積 + 柔邊，更嚴格。）

**附帶移除**：以前為了避開「3D 航跡拉遠變平面」，`MapView.calc2dTrailOpacity` 會在 3D 模式拉遠時淡入原生 2D flat 線。3D 貼球後不需要了 → 該函式改回傳 0（3D 模式全程隱藏 2D 線）。手動「2D Flat」按鈕不受影響。

## 陷阱

- **改 GlowPointsScene / atlasGlowLayer / FlightScene / globeProject 後，Vite HMR 不熱替換** Mapbox 掛載的模組單例 → 須**硬重整頁面**才生效。
- `MAX_POINT_COUNT = 4096`（單 buffer 上限）；機場 2050 點在範圍內。超過要調。
- popup 點擊走**原生 circle layer**（`ATLAS_LAYER`）的 `queryRenderedFeatures`；bloom 是純視覺 custom layer，不參與 hit-test。要 popup 就同時開 circle 版（兩者本來就設計成並存）。
- ECEF 軸向 sign 若跟 Mapbox 內部不一致 → 星點會鏡像/旋轉；本專案已用源碼驗證過的 `y = −sinφ·R` 版本。
