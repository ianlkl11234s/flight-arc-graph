# Data Scope

**最後更新**：2026-04-23

盤點目前專案持有的資料範圍。更新時機：每次 `fetch-tracks` + `split-tracks` 跑完後。

## 總量快照

| 指標 | 數量 |
|---|---:|
| 時刻表（flight-list.json 累計） | 58,849 筆 |
| 軌跡（不重複 fr24_id） | 22,536 筆 |
| 機場 JSONL 檔 | 900 座 |
| 機場邊界（airports.geojson） | 107 座 |
| Region JSONL | 6 個 |
| 空域日快照 | 6 天 |

## 軌跡 — 主力機場群（有明確 campaign）

| 群組 | 目標日期（TW） | ICAO | 航班數 |
|---|---|---|---:|
| 台灣 | 多日累計 | RCTP / RCSS / RCKH / RCNN / RCBS / RCFG / RCMT / RCQC / RCWA / RCCM / RCGI / RCLY / RCKW / RCMQ / RCYU / RCFN / RCKU / RCDC / RCAY / RCPO / RCSQ / RCQS | 22 座（6 座 = 0） |
| 倫敦 10 座 | 2026-02-18 | EGLL（1,195）/ EGKK（531）/ EGSS（384）/ EGGW（285）/ EGLC（150）/ EGTK（196）/ EGKB（140）/ EGLF（112）/ EGMC（71）/ EGMD（19） | 3,083 |
| 新加坡 | 2026-02-18 | WSSS | 1 座 |
| 中東 | 2026-02-25（戰前）/ 2026-02-28（戰當天）/ 2026-04-05（戰後） | OMDB / OMAA | 2 座 × 3 日 |

> EGLL 2/18 API 報 1,216 筆，實際入庫 1,195 筆 → 差 21 筆在 UTC 邊界（BACKLOG B003）

## 軌跡 — Region 彙整

| Region | Flights | Gzip size |
|---|---:|---:|
| TW | 7,585 | 3.46 MB |
| JP | 4,683 | 2.19 MB |
| US | 3,411 | 1.79 MB |
| UK | 3,358 | 1.88 MB |
| HK | 1,359 | 0.79 MB |
| other | 12,791 | 7.66 MB |

## 空域（airspace/days）

6 個日期：`2026-03-05` ~ `2026-03-10`

## 其他機場（~850 座）

自然產生，為上述主力航班的 dest/orig 端點。不單獨 campaign。

## 機場邊界（public/airports.geojson）

107 座機場有 OSM polygon 邊界：
- **倫敦群 10 座**：EGLL（611 pts）/ EGKK（733）/ EGSS（377）/ EGGW（155）/ EGLC（108）/ EGLF（173）/ EGMC（140）/ EGTK（85）/ EGKB（73）/ **EGMD（5 pts，runway-buffer fallback）**
- 其餘 97 座：台灣、日本、香港、美國、中東等（先前批次抓取）
- 尚未補邊界：約 793 座（BACKLOG B008）

## S3 對應路徑

`s3://migu-gis-data-collector/flight-arc/`（ap-southeast-2）
- `tracks/airports/*.jsonl`
- `tracks/regions/*.jsonl`（TW / JP / HK / US / UK / other）
- `tracks/manifest.json`
- `airspace/days/*.jsonl`
- `airspace/manifest.json`
