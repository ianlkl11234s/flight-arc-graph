# Glossary — Flight Arc 術語表

> 來源：舊記憶系統 GLOSSARY.md（2026-04-23 建立，2026-07-08 搬移至此；原系統歸檔於 `docs/archive/claude-memory-2026-04/`）。
> 數量類敘述（region 清單、機場邊界座數等）為當時快照，現況以 README 覆蓋表與 `public/tracks/manifest.json` 為準。

## FR24 (Flightradar24)

| 術語 | 說明 |
|---|---|
| Essential 方案 | 300 筆/次、30 req/分鐘、666,000 credits/月、歷史 2 年 |
| `flight-summary/light` | 查詢航班清單，≈ 38.7 credits/次 |
| `flight-tracks` | 單航班軌跡，實測 ≈ 40 credits/次 |
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
| VT | 泰國 |
| Z | 中國 |
| K（單字母） | 美國本土 |

## 專案術語

| 術語 | 說明 |
|---|---|
| Region | 軌跡 split 後的地區分類（TW / JP / HK / KR / TH / CN / US / UK / other，以 manifest 為準） |
| JSONL / NDJSON | 每行一個 JSON，append-only 友善 |
| Camera Preset | `src/map/cameraPresets.ts` 的機場鏡頭配置 |
| Cinema Mode | Capture 模式的鏡頭控制（Orbit + Keyframe 序列） |
| HQ 匯出 | `captureStream(0)` 手動幀模式的離線逐幀匯出 |
| `track-done.ndjson` | fetch-tracks 成功 fr24_id（append-only） |
| `track-failed.ndjson` | fetch-tracks 失敗 fr24_id（append-only） |
| Dynamic Viewshed | Track Single 模式的飛機視域分析（Three.js 扇形 mesh） |
| Color Theme | 可自訂的 3D / 2D 渲染配色（6 組 preset） |
| 主動機場 (active) | 曾用 fetch-flights 主動抓過時刻表的機場 |
| 被動機場 (passive) | 沒主動抓，但因航班另一端落地此處而生成 JSONL（資料片面） |

## OSM / 機場邊界

| 術語 | 說明 |
|---|---|
| Overpass API | OSM 查詢 API，endpoint：`https://overpass-api.de/api/interpreter` |
| `aerodrome` | OSM `aeroway` tag 值之一，標記機場主體（way / relation / node） |
| `runway` | OSM `aeroway` tag，跑道 way（通常是 LineString 兩端點） |
| Runway-buffer fallback | 機場僅有 aerodrome node 時的邊界 fallback：以 node 為錨點搜尋 2km 內最長 runway，端點延伸 200m + 側緩衝 150m 產生矩形 |
| `public/airports.geojson` | 機場邊界 FeatureCollection（2026-04-23 快照：107 座） |

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
