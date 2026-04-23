# Glossary

## FR24 (Flightradar24)

| 術語 | 說明 |
|---|---|
| Essential 方案 | 300 筆/次、30 req/分鐘、666,000 credits/月、歷史 2 年 |
| `flight-summary/light` | 查詢航班清單，≈ 38.7 credits/次 |
| `flight-tracks` | 單航班軌跡，≈ 12 credits/次（估計） |
| `fr24_id` | 航班唯一 ID（hex） |
| `datetime_takeoff` / `first_seen` | UTC ISO 時間戳字串 |

## ICAO 代碼前綴

| 前綴 | 地區 |
|---|---|
| RC | 台灣 |
| EG | 英國 |
| RJ | 日本 |
| VH | 香港 / 澳門 |
| WS | 新加坡 |
| OM | 阿聯 |
| RK | 韓國 |
| K（單字母） | 美國本土 |

## 專案術語

| 術語 | 說明 |
|---|---|
| Region | 軌跡 split 後的地區分類：TW / JP / HK / US / UK / other |
| JSONL / NDJSON | 每行一個 JSON，append-only 友善 |
| Camera Preset | `src/map/cameraPresets.ts` 的機場鏡頭配置 |
| Cinema Mode | Capture 模式的鏡頭控制（Orbit + Keyframe 序列） |
| HQ 匯出 | `captureStream(0)` 手動幀模式的離線逐幀匯出 |
| `track-done.ndjson` | fetch-tracks 成功 fr24_id（append-only） |
| `track-failed.ndjson` | fetch-tracks 失敗 fr24_id（append-only） |
| Dynamic Viewshed | Track Single 模式的飛機視域分析（Three.js 扇形 mesh） |
| Color Theme | 可自訂的 3D / 2D 渲染配色（6 組 preset） |

## 時區換算

- **TW = UTC+8**
- **TW 2/18 全日** = UTC 2/17 16:00 ~ 2/18 16:00
- `fetch-tracks.ts --date YYYY-MM-DD` 是 **UTC 日期**（不是 TW）
- UI 顯示一律 TW

## 部署 / 基礎設施

| 術語 | 說明 |
|---|---|
| Zeabur | Target platform，nginx:alpine 容器，port 3721 |
| `/data` volume | Zeabur persistent volume 掛載點 |
| S3 bucket | `migu-gis-data-collector`（ap-southeast-2） |
| S3 prefix | `flight-arc/`（與其他 youbike / weather 資料隔離） |

## 記憶系統

| 術語 | 說明 |
|---|---|
| Atomic commit | 一個檔案變動 = 一個 commit，訊息 prefix `memory:` |
| Session SOP | 開頭讀 STATUS/BACKLOG/PRINCIPLES；結束用 `/wrap-up` |
| Pitfall archive | `.claude/pitfalls/` 的 long-form 紀錄，`INCIDENTS` 放短摘要 + link |
