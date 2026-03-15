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

## Cinema Mode 開發規劃

### Phase 1（進行中）
1. **速度選項**：TimelineControls 加入 1x、15x 選項
2. **Orbit 鏡頭旋轉**：Capture 模式下的 Cinema Bar，支援環繞、方向、速度控制
3. **漸進式軌跡**：靜態軌跡支援 `progressive` 模式（飛過才顯示）

### Phase 2（待做）
4. **Keyframe 系統**：擷取相機位置 → 排列 → 自動播放序列
   - `useCinemaCamera` hook 管理 keyframe 陣列與插值播放
   - Cinema Bar UI：Add KF / 列表 / Preview / Play
   - Edit 模式 ↔ Play 模式切換
   - Keyframe 支援 hold（到達後停留/旋轉）
5. **Dolly/Drift 鏡頭動態**
6. **匯出/載入 JSON sequence**

### 新增檔案
- `src/hooks/useCinemaCamera.ts` — 鏡頭運動 hook（Orbit + Keyframe 播放）
- `src/components/CinemaBar.tsx` — Capture 模式下的鏡頭控制 UI
