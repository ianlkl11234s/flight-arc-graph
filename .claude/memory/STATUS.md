# Status

**最後更新**：2026-04-23（session：倫敦 10 座完整三層）

## 本次 session 完成

### 第一段：資料補抓 + 建立 memory 系統
- 倫敦缺的 5 座（EGTK / EGKB / EGLF / EGMC / EGMD）TW 2/18 資料抓完
- UK region 更新為 3,358 flights，S3 上傳完成
- ⭐ 建立 `.claude/memory/` 記憶系統（9 檔）+ `/wrap-up` skill

### 第二段：倫敦 UI + 機場邊界補齊
- `src/map/cameraPresets.ts`：5 座新 `AIRPORT_INFO` + 5 座 `CAMERA_PRESETS` + overview 改 10 座
- `public/airports.geojson`：97 → **107 座**（倫敦 10 座完整，EGMD 用 runway-buffer fallback）
- `scripts/fetch-airport-boundaries.ts`：Node fetch → curl 修復 + runway-buffer fallback

## 本次 session 已 push 的 commits（8 個）

```
3b78d3d memory: append REFLECTIONS (倫敦 UI + boundary 補齊反省)
afcb88a memory: update DATA_SCOPE (+機場邊界區段，107 座 polygon)
1a4a3ef memory: update BACKLOG (+B008 / +B009 / 已完成 +2)
dac66e8 memory: append GLOSSARY (OSM / Overpass / runway-buffer)
bc96fd7 memory: update PLAYBOOKS (PB-01 三層同步 + PB-03 絕對路徑)
6322e68 memory: append PRINCIPLES (機場三層同步 + Overpass curl + Zeabur 絕對路徑)
8054077 memory: append INCIDENTS (Zeabur WORKDIR / Overpass fetch / EGMD fallback)
b87bb9b data: add OSM boundaries for 10 London airports
64fe0fd feat: add 5 London airports to UI (EGTK/EGKB/EGLF/EGMC/EGMD)
c916fdd fix: fetch-airport-boundaries uses curl + runway-buffer fallback
c11cd80 memory: update STATUS (memory 系統上線 + 3 commits 明列)
94e4916 memory: append REFLECTIONS (首次 /wrap-up 測試)
1e86af5 feat: add /wrap-up skill for atomic memory updates
b1d8de0 memory: scaffold .claude/memory/ system (9 files)
066ed96 fix: add UK region to pull-from-s3
```

（本輪 memory 7 個 commit 尚未 push。）

## 等用戶執行

- [ ] `git push origin master`（送出本輪 memory commits）
- [ ] Zeabur 重 build 完成後，終端機跑 `sh /app/scripts/pull-from-s3.sh`（⚠ WORKDIR=/ 須絕對路徑）

## 下一步候選

見 [BACKLOG.md](BACKLOG.md)。優先：
- B001 Phase 3 深度分析（P1）
- ~~B005 `scripts/count-london.mjs` 去留決策~~（已搬到 `scripts/oneoff/`，2026-04-23）
- B008 其他 793 座機場補 OSM boundary（可等）

## 累計狀態快照

- 時刻表：58,849 筆航班
- 軌跡：22,536 筆不重複 / 900 座機場 JSONL
- **機場邊界：107 座**（倫敦 10 座完整）
- 空域：6 個日期（2026-03-05 ~ 03-10）
- 詳細盤點：[DATA_SCOPE.md](DATA_SCOPE.md)
