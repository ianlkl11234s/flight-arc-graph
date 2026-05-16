# Flight Arc — 資料抓取狀態與計劃

> **最後更新**: 2026-05-16
> **目的**: 追蹤每個目標機場的「時刻表 + 軌跡」抓取進度，避免重複規劃或忘記未完成項目。

## 🆕 最近完成

### 2026-05-16: 巴黎 + 曼谷 + 仁川（台灣時間 2/18 整天）

範圍：UTC `2026-02-17T16:00:00Z ~ 2026-02-18T16:00:00Z`

| 區 | 機場 | 結果 |
|----|------|------|
| 🇫🇷 巴黎 | LFPG / LFPO / LFPB / LFOB | 100% (1,807 筆) |
| 🇹🇭 泰國 | VTBS / VTBD / VTCC / VTSP / VTSG / VTSM / VTBU / VTSS / VTSB | 100% (2,656 筆) |
| 🇰🇷 韓國 | RKSI / RKPK / RKPC / RKSS / RKTU / RKTN | 100% (2,501 筆) |

**Schedule credits**: ~1,122 / **Track credits**: ~162K / 總計 ~24% 月額度
**新增軌跡**: 4,039 筆成功 / 4 無軌跡 / 0 失敗
**累計 done**: 28,688 → 32,727
**機場 JSONL**: 1,049 → 1,137 座（+88 個新目的地）

新增 fetch-tracks 參數：`--from-time` / `--to-time`（精準 ISO 時區過濾）。

## 名詞定義

| 名詞 | 意義 |
|------|------|
| **時刻表 (schedule)** | `scripts/flight-list.json` — fetch-flights.ts 主動 query 該機場後 append 的航班清單 |
| **軌跡 (track)** | `public/tracks/airports/{ICAO}.jsonl` — fetch-tracks.ts 拉回的飛行軌跡 |
| **主動機場 (active)** | 在 `flight-list.json.completed` 裡，曾用 fetch-flights 主動抓過該機場 |
| **被動機場 (passive)** | 沒主動抓，但因航班另一端落地此處而生成 JSONL（會有資料但片面） |

## 全域進度（2026-05-15 快照）

```
flight-list.json: 83,649 筆航班（265 個 sessionKey）
track-done:       28,688 筆
track-failed:        47 筆
todo:             54,914 筆
JSONL 機場數:      1,049 座
```

---

## 🎯 目前目標清單（按優先順序）

### 🔥 P1 — 補抓主場：歐美亞重點機場

#### 🇫🇷 巴黎完整化
| 機場 | 狀態 | 計劃 |
|------|------|------|
| LFPG 戴高樂 | ✅ 主動 54 天（含 2/18），88% 完成 | 補軌跡 (~170 筆) |
| LFPO 奧利 | ✅ 2/18 已抓 100% | 後續可擴大日期範圍 |
| LFPB 布爾歇 | ✅ 2/18 已抓 100% | 後續可擴大日期範圍 |
| LFOB 博韋 | ✅ 2/18 已抓 100% | 後續可擴大日期範圍 |

```bash
# 補 LFPO 14 天時刻表（2/17~3/02）
npx tsx scripts/fetch-flights.ts --from 2026-02-17 --to 2026-03-02 --airports LFPO,LFPB,LFOB
# 然後抓軌跡
npx tsx scripts/fetch-tracks.ts --airports LFPO,LFPB,LFOB,LFPG
```

#### 🇰🇷 韓國（2/18 ✅ 完成，可擴大日期）
| 機場 | 2/18 已抓 | 後續計劃 |
|------|---------|---------|
| RKSI 仁川 | 1,157 (100%) | 擴大到 14 天 |
| RKPK 釜山 | 312 (100%) | 一起 |
| RKPC 濟州 | 487 (100%) | 一起 |
| RKSS 金浦 | 372 (100%) | 一起 |
| RKTU 清州 | 100 (100%) | 一起 |
| RKTN 大邱 | 73 (100%) | 一起 |

```bash
# 韓國 5 大主力 14 天時刻表
npx tsx scripts/fetch-flights.ts --from 2026-02-17 --to 2026-03-02 \
  --airports RKSI,RKPK,RKPC,RKSS,RKTU,RKTN
npx tsx scripts/fetch-tracks.ts --airports RKSI,RKPK,RKPC,RKSS,RKTU,RKTN
```

#### 🇹🇭 泰國（2/18 ✅ 完成，可擴大日期）
| 機場 | 2/18 已抓 | 後續計劃 |
|------|---------|---------|
| VTBS 曼谷蘇凡那布 | 1,093 (100%) | 擴大到 14 天 |
| VTBD 曼谷廊曼 | 677 (100%) | 一起 |
| VTCC 清邁 | 206 (100%) | 一起 |
| VTSP 普吉 | 365 (100%) | 一起 |
| VTSG 喀比 | 83 (100%) | 一起 |
| VTSM 蘇梅島 | 119 (100%) | 一起 |
| VTSS 合艾 | 64 (100%) | 一起 |
| VTBU 烏塔堡 | 19 (100%) | 一起 |
| VTSB 素叻他尼 | 30 (100%) | 一起 |

```bash
# 泰國主要機場 14 天
npx tsx scripts/fetch-flights.ts --from 2026-02-17 --to 2026-03-02 \
  --airports VTBS,VTBD,VTCC,VTSP,VTSG,VTSM,VTBU,VTSS,VTSB
npx tsx scripts/fetch-tracks.ts \
  --airports VTBS,VTBD,VTCC,VTSP,VTSG,VTSM,VTBU,VTSS,VTSB
```

#### 🇺🇸 紐約
| 機場 | 被動筆數 | done | 計劃 |
|------|---------|------|------|
| KJFK 甘迺迪 | 373 | 161 | 主動抓 7 天 |
| KEWR 紐華克 | 129 | 102 | 一起 |
| KLGA 拉瓜地亞 | 77 | 77 | 一起（量小） |

```bash
npx tsx scripts/fetch-flights.ts --from 2026-02-17 --to 2026-02-23 \
  --airports KJFK,KEWR,KLGA
npx tsx scripts/fetch-tracks.ts --airports KJFK,KEWR,KLGA
```

#### 🇦🇺 澳洲 + 🇳🇿 紐西蘭
| 機場 | 被動筆數 | done | 計劃 |
|------|---------|------|------|
| YSSY 雪梨 | 172 | 63 | 主動抓 7 天 |
| YMML 墨爾本 | 163 | 53 | 一起 |
| YBBN 布里斯班 | 123 | 37 | 一起 |
| YPPH 伯斯 | 53 | 25 | 一起 |
| YPAD 阿德萊德 | 7 | 4 | 一起 |
| NZAA 奧克蘭 | 67 | 22 | 一起 |
| NZCH 基督城 | 3 | 2 | 一起 |

```bash
npx tsx scripts/fetch-flights.ts --from 2026-02-17 --to 2026-02-23 \
  --airports YSSY,YMML,YBBN,YPPH,YPAD,NZAA,NZCH
npx tsx scripts/fetch-tracks.ts \
  --airports YSSY,YMML,YBBN,YPPH,YPAD,NZAA,NZCH
```

---

### 🟡 P2 — 已主動抓但軌跡完成度低（補 fetch-tracks 即可）

完成度 < 60% 且時刻表已抓，只缺 fetch-tracks 額度。直接跑 fetch-tracks 即可：

| 機場 | 待抓 | 累積天數 |
|------|------|---------|
| OMDB 杜拜 | 10,053 | 53 天 |
| RCTP 桃園 | 21,395 | 48 天 |
| RCKH 高雄 | 5,561 | 40 天 |
| RCSS 松山 | 4,311 | 40 天 |
| OMAA 阿布達比 | 4,179 | 41 天 |
| VHHH 香港 | 3,561 | 54 天 |
| RJAA 成田 | 2,039 | 54 天 |
| RJBB 關西 | 1,550 | 46 天 |
| ROAH 那霸 | 1,139 | 40 天 |
| LEBL 巴塞隆納 | 641 | 32 天 |
| LIMC 米蘭 | 590 | 52 天 |
| LPPT 里斯本 | 562 | 36 天 |
| ...歐洲二線約 4,000 筆 | | |

```bash
# 不指定 airports = 全部 todo（54,914 筆，約 32 小時）
# 或按優先批次
npx tsx scripts/fetch-tracks.ts  # 從頭照清單跑
```

---

### 🟢 P3 — 待規劃

- [ ] 中國大陸主場（ZSPD 上海/ZBAA 北京/ZGSZ 深圳）— 目前完全被動
- [ ] 中東其他主場（OTHH 卡達/OERK 利雅德/OEJN 吉達）— 被動但有資料
- [ ] 美國西岸（KLAX/KSFO/KSEA）— 被動
- [ ] 印度主場（VABB 孟買/VIDP 德里）— 被動
- [ ] 加拿大（CYYZ 多倫多/CYVR 溫哥華）— 完全空白

---

## ⚙️ 操作流程備忘

### Step 1: fetch-flights（抓時刻表）
```bash
# Essential 方案上限：每 page 38.7 credits
npx tsx scripts/fetch-flights.ts \
  --from 2026-02-17 --to 2026-03-02 \
  --airports VTBS,VTBD
```
- 結果 append 到 `scripts/flight-list.json` 的 `flights`
- 機場標記在 `completed` 為 `{ICAO}:{from}:{to}`

### Step 2: fetch-tracks（抓軌跡）
```bash
# 每 track ~40 credits，~2 秒/筆（rate limit）
npx tsx scripts/fetch-tracks.ts --airports VTBS,VTBD
```
- 結果 append 到 `public/tracks/airports/{ICAO}.jsonl`（dep + dest 各一份）
- 已 done 的 fr24_id 寫進 `scripts/track-done.ndjson`

### Step 3: split + 上傳
```bash
# 重建 manifest + dedupe
npx tsx scripts/split-tracks.ts
# 上傳 S3
bash scripts/sync-airspace-from-gis.sh  # 或 upload-split-to-s3.ts
```

---

## 📝 更新此檔案的時機

- ✅ 新增目標機場群時 → 加到 P1/P2/P3
- ✅ 完成一輪抓取後 → 更新「狀態」欄、刪掉已完成項
- ✅ 發現新的主動 vs 被動誤判時 → 修正描述
- ✅ API 月額度重置時 → 重新規劃 P1 順序

## 💡 重要觀念

1. **主動機場 ≠ 該機場有資料**：純被動的機場 JSONL 只涵蓋「連到主動機場的航線」，不是該機場的完整流量
2. **要看完整主場流量**：必須對該機場執行 fetch-flights（主動）
3. **軌跡抓取會雙寫**：每筆 flight 的軌跡會 append 到 dep + dest 兩個 ICAO.jsonl
4. **track-done.ndjson 是全域**：跨多次 fetch-flights session 的 fr24_id 都會被記住，不會重抓
