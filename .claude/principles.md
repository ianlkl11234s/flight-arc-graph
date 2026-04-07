# 專案運作原則 — Flight Arc (plan-art)

（必做的 build 檢查詳見 [CLAUDE.md](../CLAUDE.md)）

## 核心規則

### 每次 commit 前必跑
```bash
npm run typecheck   # 即 tsc -b，跟 CI 一致
```

**不要用** `npx tsc --noEmit`，行為不同會漏檢。

### 常見 build 失敗原因
- 解構變數後未使用（`noUnusedLocals: true`）
- 函式參數未使用（`noUnusedParameters: true`）
- `tsc --noEmit` 通過但 `tsc -b` 失敗（行為不同）

## 資料來源

| 資料 | 來源 | 備註 |
|------|------|------|
| 歷史航班軌跡 | FlightRadar24 API | 需 `FR24_API_TOKEN` |
| 即時空域快照 | OpenSky Network | 備援 |

## 相依專案
- **data-collectors** — 提供即時空域快照
- **gis-platform** — Supabase `realtime.flight_positions`
