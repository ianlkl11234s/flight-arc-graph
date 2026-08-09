# Flightradar24 API Reference

> 來源：`plat-test-test/CLAUDE.md`（live demo 驗證期整理搬入）。**已驗證可用，勿改端點。**
> 參考實作：`../scripts/fetch-flights.ts` 與 `../scripts/fetch-tracks.ts`，有疑義時以它為準。

- Base URL：`https://fr24api.flightradar24.com/api`
- Headers（兩個都必須）：
  - `Authorization: Bearer {FR24_API_TOKEN}`
  - `Accept-Version: v1`

## 1. 查機場單日航班清單

```
GET /flight-summary/light?flight_datetime_from={ISO}&flight_datetime_to={ISO}&airports[]={ICAO}&limit=300&sort=asc
```

- 時間格式：UTC ISO，如 `2026-06-02T16:00:00Z`（台灣時間 = UTC+8，台灣當日 00:00–24:00 → UTC 前一日 16:00 至當日 16:00）
- 澎湖馬公機場 ICAO：`RCQC`（IATA：MZG）
- 回應：`{ "data": [ { fr24_id, flight, callsign, type, reg, orig_icao, dest_icao, datetime_takeoff, datetime_landed, first_seen, last_seen, ... } ] }`
- 分頁：回傳筆數達 limit 時，用最後一筆的 `datetime_takeoff`（或 `first_seen`）當下一次的 `flight_datetime_from` 續查；小機場單日通常一頁就抓完

## 2. 抓單一航班軌跡

```
GET /flight-tracks?flight_id={fr24_id}
```

- 回應：`{ "data": [ { fr24_id, tracks: [ { timestamp, lat, lon, alt, gspeed, ... } ] } ] }`（外層結構可能略有差異，解析時容錯）
- `alt` 單位是 **feet**，轉公尺 ×0.3048；`timestamp` 是 ISO 字串
- 404 = 該航班無軌跡，跳過即可
- 每次呼叫間隔約 0.5 秒；429 時 exponential backoff（15s 起跳）重試
