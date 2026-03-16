# Flight Arc — 專案規則

## Build 檢查（必做）

**每次 commit 前，必須執行 `npm run typecheck`（即 `tsc -b`）確認無錯誤。**

這是 CI/CD 使用的同一個指令。常見的 build 失敗原因：
- 解構變數後未使用（`noUnusedLocals: true`）
- 函式參數未使用（`noUnusedParameters: true`）
- `tsc --noEmit` 通過但 `tsc -b` 失敗（行為不同）

```bash
# ✅ 正確：用 tsc -b（跟 CI 一致）
npm run typecheck

# ❌ 錯誤：tsc --noEmit 可能漏檢
npx tsc --noEmit
```

## 程式碼慣例

- 使用 inline styles（非 CSS 檔案）
- 所有 UI 元件需支援 `isDarkTheme`（Light / Dark 主題）
- 機場資料統一放在 `src/map/cameraPresets.ts`
- 資料載入統一走 `src/data/flightLoader.ts`
- 路徑 fallback 順序：`/data/` (Zeabur volume) → `/` (local public/) → S3
- 即時動畫渲染用 Three.js（非 Mapbox GeoJSON source），避免 setData 瓶頸

## 資料架構

- 航線軌跡：`tracks/airports/{ICAO}.jsonl`（NDJSON 格式，per-airport lazy loading）
- 空域快照：`airspace/days/{YYYY-MM-DD}.jsonl`（按天分檔）
- 索引：`tracks/manifest.json`、`airspace/manifest.json`
- 原始資料：`scripts/track-progress.json`、`scripts/flight-list.json`（gitignored）

## 部署流程

```bash
# 1. 確認 build
npm run typecheck

# 2. Push 後 Zeabur 自動 build

# 3. Zeabur 終端機拉資料
bash scripts/pull-from-s3.sh
```

## 時區

- 所有 UI 時間顯示為台灣時間（UTC+8）
- `timeToUnixTW()` 接受台灣時間字串
- 場景預設的 `time` 欄位為台灣時間
- FR24 API 的 session key 為 UTC/ISO 格式

## Cinema Mode（已完成）

### 功能清單
1. **速度選項**：1x、15x、30x、60x、120x、300x、600x
2. **Orbit 鏡頭旋轉**：Capture 模式下的 Cinema Bar，速度 0.2~8°/s，CW/CCW
3. **漸進式軌跡**：靜態軌跡 `progressive` 模式（飛過才顯示）
4. **Keyframe 系統**：擷取 → 排列 → 自動播放序列
   - Hold 階段（still / orbit with speed/direction）
   - Easing（ease-in-out / linear / ease-out）
   - Recapture、Loop、總時長顯示
5. **儲存/載入**：localStorage 自動保存 + JSON 匯出/匯入
6. **收合式 CinemaBar**：▼ 收合 / Cinema ▲ 展開

### 新增檔案
- `src/hooks/useCinemaCamera.ts` — 鏡頭運動 hook（Orbit + Keyframe + Save/Load）
- `src/components/CinemaBar.tsx` — Capture 模式下的鏡頭控制 UI

## Dynamic Viewshed（已完成）

Track Single 模式下的動態視域分析：

### 功能
- **3D 扇形 mesh**（Three.js）：左右舷各 50° FOV，per-vertex alpha 漸層
- **3D 掃描線**（Three.js LineSegments）：從飛機射向地面弧線
- **動態半徑**：根據高度 20→60→120→150km（大氣衰減上限）
- **主題色**：Dark=白、Light=橘、Satellite=金黃
- **可調參數**：View（不透明度 0~2）、Edge（邊緣銳利度 0~1）

### 技術決策
- **用 Three.js 而非 Mapbox GeoJSON**：`source.setData()` 每幀 2-3ms（瓶頸），改用 Float32Array buffer update = 0.01ms
- **depthTest: false**：避免 Mapbox 3D terrain 遮擋扇形

### 新增檔案
- `src/map/viewshedOverlay.ts` — 純計算工具（幾何、半徑、航向，無 Mapbox 依賴）
