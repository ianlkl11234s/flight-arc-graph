# 批次 2026-06_jp-lax

台北(桃園 RCTP / 松山 RCSS) ↔ 東京羽田(RJTT)・成田(RJAA)・福岡(RJFF)・洛杉磯(KLAX)，**來回**。

- **收集區間**：2026-05-27 ～ 2026-06-10（UTC，往前推兩週）
- **收集日**：2026-06-11
- **用途**：跨航司／跨機型油耗比較 + 近期雷雨對軌跡影響分析
- **目標航班數**：約 1,282 班
- **來源腳本**：`plan-art/scripts/fetch-japan-lax-batch.ts`（官方 FR24 API：flight-summary/light + flight-tracks）

## 與 2/18 舊批次的隔離（重要）

舊批次（2026-02-18～05-06）在 `public/tracks/regions/` 與 `airports/`，本批次**完全獨立**放在這個 `batches/2026-06_jp-lax/` 子目錄，互不污染：

- 每筆記錄多了 `batch: "2026-06_jp-lax"` 與 `collected_at`(unix) 欄位 → 可直接辨識來源。
- progress 檔（`track-done.ndjson` / `track-failed.ndjson`）獨立，不碰全域進度。
- fr24_id 為每次飛行唯一，6 月航班與 2 月不會撞號。
- 即使日後合併，仍可用 `batch` 欄位或 `first_seen`(5/27~6/10) 乾淨切分。

## 在 plan-analyts 讀取

```bash
FLIGHTFUEL_TRACKS_DIR="../plan-art/public/tracks/batches/2026-06_jp-lax/regions" \
  .venv/bin/python your_script.py
```

```python
from flightfuel.io.loader import iter_flights
# 桃園-成田 來回（自動含反向）
for f in iter_flights(city_pair=("RCTP", "RJAA")):
    ...
# 跨航司比較用 operating_as（CAL/EVA/SJX/...），不要用 painted_as
```

## 續接

中斷後重跑即可續接（已完成的 fr24_id 會跳過）：
```bash
npx tsx scripts/fetch-japan-lax-batch.ts --mode tracks
```
