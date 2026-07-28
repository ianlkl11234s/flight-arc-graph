# Flight Arc — 資料抓取狀態與計劃

> **最後更新**: 2026-07-28
> **目的**: 追蹤每個目標機場的「時刻表 + 軌跡」抓取進度，避免重複規劃或忘記未完成項目。

## 🔖 下次接續（接力點 — 先讀這裡）

> **狀態快照 @ 2026-07-25**：✅ **月額度已重置**（用戶確認）。本日巴威颱風 session 花 ~135.5K（時刻表 ~11.4K + 軌跡 ~124.1K）→ 估餘 ~530K，**待跟 FR24 dashboard 對帳後更新 `campaign-top1000.json` 的 `budget.manual_remaining` / `as_of`**。戰役 P2 可續跑（Batch 1 待補段見下）。
> 全球前 1000 大機場 2/18 時刻表已全掃完；軌跡進度 7,163/65,421（10.9%，Batch 1 rank 1-16 抓了 68%）。開工先跑 `npx tsx scripts/campaign-status.ts`。
> ⚠️ **成本記牢**：時刻表 = **3 credits/筆**、軌跡 = 40 credits/筆。估算一律以 FR24 dashboard 為準。

### ⏸️ 待抓：Top-1000 軌跡分批（P2）— 從 Batch 1 開始

時刻表在 `scripts/flights/{ICAO}/2026-02-18.json`（1000 座）＋ `flight-list.json`（累計 161,722 筆）。掃到 2/18 不重複航班 74,651，其中 9,230 已有軌跡 → **還要抓 65,421 班 ≈ 2.62M credits ≈ 4 個月**（每月 666K 上限）。按 rank 分 5 批，每批 ~15,000 班：

| 批次 | rank 帶 | 待抓班次 | credits |
|------|---------|---------|---------|
| **Batch 1（先跑這批）** | 1–39 megahub | 15,158 | 606K |
| Batch 2 | 40–125 | 15,040 | 602K |
| Batch 3 | 126–395 | 15,003 | 600K |
| Batch 4 | 396–673 | 15,059 | 602K |
| Batch 5 | 674–1000 長尾 | 5,161 | 206K |

**每個 session 只要一個指令看全局**（現算：進度/目前批次/本週期額度/漂移警告/建議指令）：

```bash
npx tsx scripts/campaign-status.ts
# → 照它印的「建議指令」跑（--airports-file --rank --max-credits 都算好了；先加 --dry-run 確認）
#   完整迴圈（caffeinate / retry / split / S3 / commit）見 /track-round skill「Top-1000 P2 長期模式」
```

> 💡 因軌跡雙寫 dep+dest，先抓 Batch 1（39 座 megahub）就會順帶填滿大量輻條 → 網子最密的核心最先成形；只做前 1–2 批就已有極高視覺價值（長尾 Batch 5 邊際貢獻最低）。
> ⚠️ 抓完每批務必跑 `split-tracks.ts`（`NODE_OPTIONS=--max-old-space-size=12288`）重建 manifest，並同步 README 覆蓋表 + 本檔。campaign-status 會自動偵測「沒 split / 沒上 S3」漂移。
> 📒 額度帳：`scripts/fetch-sessions.ndjson`（fetch-tracks 自動寫、進 git）。月額度重置後更新 `scripts/campaign-top1000.json` 的 `budget.manual_remaining` / `as_of`（從 FR24 dashboard 讀）。
> ⚙️ 系統（2026-07-10 建）：fetch-tracks 加了 `--airports-file` / `--rank` / `--max-credits` + session 帳本；`campaign-top1000.json` 存批次指針與額度錨點；`campaign-status.ts` 一鍵簡報。

## 🆕 最近完成

### 2026-07-28: ✅ retry 壞記錄補抓完成 + no-ICAO 堵蟲

- **補抓完結**：昨日發現的壞時間戳記錄（3,603 份副本 = **1,803 班不重複**）已全數重抓，`scripts/oneoff/refetch-retry-broken.ts`，**1,803/1,803 成功、零失敗**，實花 **72,120 credits**（1,803 × 40；FR24 五個月前的歷史軌跡全部可得）。split-tracks dedupe 已汰換舊壞記錄。⚠️ 對帳注意：兩段執行被中斷未寫 session 帳，fetch-sessions.ndjson 的 refetch session 只涵蓋 528 班，**實際花費以 1,803 × 40 = 72,120 為準**，請與 FR24 dashboard 核對。
- **🐛 no-ICAO 靜默丟棄蟲（審計新發現，已堵）**：`fetch-tracks.ts` 對兩端 ICAO 皆空的航班（未申報公務機/直升機）會花錢抓、`writeFlightToJsonl` 一行都寫不出去、仍標記 done → **已沉沒 111 班 ≈ 4,440 credits**（無法回復，raw 備份上線前的抓取）。flight-list.json 還有 **3,568 筆同型航班**。現在 fetch-tracks / retry-failed-tracks 都會**抓取前跳過**並記入 `scripts/track-skipped-no-icao.ndjson`（0 credits），寫入零目標也改為 throw 防呆。

### 2026-07-27: 🔧 高度單位全量遷移（非抓取，資料修復）

- **根因**：fetch-tracks 舊碼 `alt > 1000 ? 轉公尺 : 保留`，≤1000 ft 的點以生英呎落地；前端 `fixAltitudeUnits()` heuristic 在 LOD 稀疏路徑上雙重轉換 → region/World scope 軌跡壓扁 ~10.8 倍。
- **修復**：`scripts/oneoff/migrate-alt-units.ts` 確定性反解（25 ft 倍數判別式）全量 1,594 檔 / 108,094 筆 / 轉換 3.43M 點；fetch-tracks / retry-failed-tracks 源頭修正；前端 heuristic 移除；regions LOD 重建（54,533 不重複航班數不變）。
- **部署注意**：Zeabur pull 對已存在 airport 檔會跳過，這次要用 `sh /app/scripts/pull-from-s3.sh --force-airports` 全檔重拉。

### 2026-07-25: 🌀 巴威颱風資料集 — 台灣 7/9–7/12 全機場起降軌跡（完結，無接力點）

**目標**：重現巴威颱風（2026/7/10 晚–7/11 侵台，中心未登陸、掠過北部海面）期間台灣機場「停飛 → 疏散出國 → 回歸」的完整故事。

- **範圍**：`--group TW` 22 座機場，台北時間 7/9 00:00 ~ 7/12 24:00（UTC `07-08T16:00Z ~ 07-12T16:00Z`）
- **時刻表**：雙向（`--direction both`，要抓到回台航班），觸及 3,798、去重 3,143 筆，~11.4K credits
- **軌跡**：3,111 待抓 → **3,103 成功（99.7%）**，8 筆真 404（無軌跡點，疑似表定未飛），~124.1K credits
- **結果**：TW region 9,110 → **12,213**；RCTP 5,807 → 7,678；track-done 51,541 → **54,644**
- **颱風訊號（UTC 日分桶）**：7/09Z 1,218 → 7/10Z 570 → **7/11Z 210** → 7/12Z 964，「空白日」與回歸潮清晰可見
- **背景事實**（查證過，可用於 app 標示）：7/9 14:30 海警、7/10 05:30 陸警、華航+長榮 7/10 18:00–7/12 04:00 完全停飛、7/11 桃機 760 架次全取消/出入境 0 人（史上首見）、7/12 放大機型+加班機疏運；媒體證實有「調機外站避風」但未點名航司/目的地 → 可用本批資料反查 7/10 傍晚 TPE 起飛的不定期航班
- 花費合計 **~135.5K credits**（待 dashboard 對帳）

### 2026-07-11: 抓取工具重構 + 台灣時刻表延伸 + 💥 成本大校正

**⚠️ 成本模型大校正（最重要）**：發現 `flight-summary/light`（時刻表）**實際 ≈ 3 credits/筆**（per flight returned），不是舊估的 38.7/page，也不是中途誤判的 227/page。三次帳單皆吻合 3.0/筆（seg1 10,246→30,750、seg2-3 12,220→~36,800、dashboard 254,821÷84,897=3.0）。**後果：當初 top1000 掃描實際花 ~224K（非報告的「~40K」）**。已修 fetch-flights/build-top1000 常數。**教訓：成本一律以 FR24 dashboard 為準，別信程式估算。**

**抓取工具重構**（修「fetch-tracks 讀不到台灣」bug）：
- fetch-tracks 改**聯集讀取** `scripts/flights ∪ flight-list.json`（不做倉庫遷移，避免污染 campaign-status）
- `--group TW` + `scripts/airport-groups.json`；`flights-inventory.ts`（通用庫存視圖）；`--max-credits` 安全網（沒帶就自動 dry-run）；fetch-flights merge-write；dry-run 按 UTC 日分桶

**台灣時刻表延伸**（`--group TW-CIVIL`，schedule 非 track）：
- 抓了 3 段：3/29–4/11 + 4/12–4/25 + 4/26–5/09，共 **~22,466 筆新時刻表**，花 **~67K credits**
- 台灣時刻表現況：**2/17 → 5/09**（原 2/17–3/28）
- ⚠️ **FR24 資料缺口**：~4/13–4/25 這兩週 FR24 幾乎沒台灣資料（RCTP 那些天 0 航班），花錢也填不了 → 台灣時刻表這段有個補不起來的洞
- ⚠️ 台灣**軌跡**缺口仍 34,031 筆（~1.36M credits，用 `flights-inventory --group TW` 看）；本次只補「名單」不含軌跡

**額度**：本 session 大量消耗（掃描 ~224K + 戰役軌跡 ~287K + 台灣時刻表 ~67K）→ **FR24 餘額剩 ~8,000**，戰役與抓取暫停待額度回補。

### 2026-07-10: 戰役系統上線 + Batch 1 首批（rank 1-16）進行中 68%

**戰役系統**（見上方接力點）：`campaign-status.ts` 一鍵簡報、`fetch-tracks` 加 `--airports-file`/`--rank`/`--max-credits`、帳本 `fetch-sessions.ndjson`（track-done 差值自癒）、`/track-round` 加「Top-1000 P2」專章。

**Batch 1 首批 rank 1-16 抓了 7,163 條**（16 座 megahub：馬尼拉/芝加哥/吉隆坡/西貢/波士頓/拉斯維加斯/廣州/達拉斯/河內/丹佛/澳門/深圳/鳳凰城/奧蘭多…）：
- 本月花 **~286,520 credits**（核准 30 萬內，剩 ~13.5K）
- totalFlights 44,267 → **51,430**（track-done 51,541）；機場檔 1,416 → **1,594**（+178 新目的地）
- region 成長：US 11,639→15,356、CN 5,483→7,346、other 20,312→22,628（新機場落入既有 region，無新 region → pull-from-s3.sh 不用改）
- Top 15 新進榜：ZGGG 廣州 #13
- **戰役總進度 7,163 / 65,421（10.9%）**
- ⚠️ **時間窗 bug（已修）**：首跑誤用 `--date 2026-02-18`，只抓到 UTC 2/18 段，漏掉 UTC 2/17 16:00~24:00（= 台北 2/18 凌晨~上午）。台北整日跨兩個 UTC 日，**必須用 `--from-time 2026-02-17T16:00:00Z --to-time 2026-02-18T16:00:00Z`**（與既有 core 機場一致）。rank 1-16 全窗共 12,293 條，已抓 8,420（68%），**待補 3,849（~154K credits）** → 下月背景補。campaign-status/campaign-top1000.json/skill 已改用 window。
- ⚠️ 環境教訓：(1) Mac 對 `~/Desktop` 的 TCC 存取權中途被系統收回（全目錄 EPERM），需重授「完整磁碟取用權」+ 重啟終端機 App；(2) 背景長工約 30-70 分被環境回收，靠 track-done 續跑零損失、帳本自癒免手補

### 2026-07-09: 全球前 1000 機場 2/18 時刻表掃描 + 帳目對帳

**目標**：把全球運量前 1000 大機場在 2/18（台北整日）的所有起降織成一張全球網。

**Step 0 對帳**：6/19 已抓的西雅圖 + 北京軌跡（KSEA/ZBAA/ZBAD，2,609 筆）先前沒重跑 split-tracks，manifest/README 落後。本次補跑 `split-tracks.ts` 入帳：
- 不重複航班 41,655 → **44,267**（track-done 44,378）
- CN region 3,638 → 5,483（北京入 region）、US 10,868 → 11,639（西雅圖入 region）
- 舊接力點（KSEA/ZBAA/ZBAD 待抓軌跡）已於 6/19 完成，本次確認並移除

**Step 1 掃時刻表**：`fetch-flights --airports-file scripts/top1000-airports.json --from 2026-02-17T16:00:00Z --to 2026-02-18T16:00:00Z --direction outbound`
- **1000/1000 座完成，0 錯誤**（中途曾於 885 被外部中止，續跑自動跳過已完成、補完剩餘 115 座）
- flight-list 不重複航班 97,944 → **161,722**（本輪淨增 63,778）
- 掃到 2/18 不重複航班 **74,651**，其中 9,230 已有軌跡 → **待抓 65,421 班**
- 產出新格式 `scripts/flights/{ICAO}/2026-02-18.json`（首次大規模啟用）
- 清單來源：`scripts/top1000-airports.json`（`build-top1000-airports.ts` 產，已排除 160 座既有 core）

**下一步**：P2 軌跡分批（見上方接力點，Batch 1 = rank 1–39）。

### 2026-06-04: 西雅圖 + 上海 + 北京 5 座主動化（台北時間 2/18）

範圍：UTC `2026-02-17T16:00:00Z ~ 2026-02-18T16:00:00Z`（精確時間）

**Step 1 fetch-flights ✅ 全 5 座完成**（Schedule ~774 credits / 20 pages）：

| 機場 | 總班次 | 新增(待抓軌跡) | 軌跡狀態 |
|------|------|------|------|
| ZSPD 上海浦東 | 1,488 | 1,176 | ✅ 軌跡完成（manifest 477→1,656）|
| ZSSS 上海虹橋 | 735 | 712 | ✅ 軌跡完成（manifest 66→779）|
| ZBAA 北京首都 | 1,112 | 916 | ⏸️ 待抓（見接力點）|
| ZBAD 北京大興 | 1,045 | 987 | ⏸️ 待抓（見接力點）|
| KSEA 西雅圖 | 987 | 789 | ⏸️ 待抓（見接力點）|

- 不重複航班累計：93,364 → **97,944**
- **Step 2 fetch-tracks（上海兩場）**：成功 1,891 / 無軌跡 6 / 失敗 1；done 39,875 → **41,766**；split 後不重複航班 **41,655**
- 北京 2 場 + 西雅圖延後（見上方接力點）
- ⚠️ 教訓 1：主動查詢的班次遠多於被動觸及（浦東被動只看到 330，主動 1,488）→ Track 額度估算要用主動結果
- ⚠️ 教訓 2：**split-tracks 會 OOM**（資料長大，預設 4GB heap 不夠）。改用：
  `NODE_OPTIONS="--max-old-space-size=12288" npx tsx scripts/split-tracks.ts`

### 2026-05-23 晚: Camera Presets + 禁航區大擴張

#### Camera Presets — 新增 10 座美國機場
- 紐約三場（KJFK/KEWR/KLGA）+ LA 都會（KLAX/KBUR/KSNA/KONT）+ SF 灣區（KSFO/KOAK/KSJC）
- 對應上午剛抓完軌跡的 10 座
- 美國場景：3 座 → **13 座**

#### 禁航區 — 從 3 國擴張到 **12 國**

| 國家 | Features | 大小 | 主要類型 |
|------|---------|------|---------|
| 🇺🇸 US | 1,986 | 5.3 MB | RCD 1432 / RCR 542 / RCP 12 |
| 🇫🇷 FR | 1,302 | 2.8 MB | RCR 663 / TMA 357 / RCP 108 |
| 🇮🇹 IT | 816 | 3.6 MB | RCR 274 / RCP 264 / RCD 124 / CTR 115 |
| 🇪🇸 ES | 450 | 552 KB | TMA 201 / RCD 104 / CTR/RCR/RCP |
| 🇩🇪 DE | 381 | 593 KB | TMA 158 / RCR 142 / CTR 63 |
| 🇯🇵 JP | 280 | 440 KB | RCR 107 / RCD 89 / CTR 84 |
| 🇹🇷 TR | 207 | 965 KB | CTR 83 / TMA 41 / RCD 44 |
| 🇳🇱 NL | 110 | 279 KB | TMA 31 / RCR 23 / RCD/CTR/FIR |
| 🇹🇭 TH | 13 | 100 KB | TMA 7 / CTR 5 / RCD 1 |
| 既有 🇹🇼 TW | 81 | 266 KB | eAIP 解析 |
| 既有 🇬🇧 UK | (已抓)| 752 KB | OpenAIP |
| 既有 🇨🇳 CN | (已抓)| 82 KB | OpenAIP |

**Repo 大小增加**: ~14.5 MB（geojson 進 git）

⚠️ **OpenAIP 限制**：
- 🇰🇷 韓國 — **0 筆**（OpenAIP 不收）
- 對亞洲覆蓋差（TH 也只有 13 筆）
- 美國沒有 TMA/CTR（FAA 自有體系）
- 授權 **CC BY-NC-SA 4.0**（非商業）

**修補的 bug**: `taipei-gis-analytics/pipelines/aviation/airspace_openaip/00_fetch_openaip.py` 對 JP/FR 失敗（activity 欄位有 int 沒 cast str），已修。

### 2026-05-23: 美國紐約三場 + LA/SF 都會區（台灣時間 2/18 整天）

範圍：UTC `2026-02-17T16:00:00Z ~ 2026-02-18T16:00:00Z`

| 區 | 機場 | Step 1 班次 | 結果 |
|----|------|------------|------|
| 🗽 紐約 | KJFK / KEWR / KLGA | 1,137 / 1,026 / 970 | 主動 100% |
| ☀️ 洛杉磯都會 | KLAX / KBUR / KSNA / KONT | 1,292 / 280 / 474 / 281 | 主動 100% |
| 🌉 灣區 | KSFO / KOAK / KSJC | 920 / 339 / 314 | 主動 100% |

**Schedule credits**: ~4,295（含 1 次誤跑 3,173） / **Track credits**: ~214K + retry ~72K = **~286K**
**新增軌跡**（首次 + retry 合計）: **7,148 筆成功** / 10 真 404 / 0 仍失敗 🎉
**累計 done**: 32,727 → **39,875**
**累計 failed**: 51 → **56**（只剩 5 筆是真的 404 + 既有 51 筆）
**機場 JSONL**: 1,137 → **1,276** 座
**US region**: 新誕生 **10,855 flights**（gzip 6.21 MB）

### Retry 階段（同日下午）

第一次 fetch-tracks 因網路 blip 失敗 1,803 筆。寫了 `scripts/retry-failed-tracks.ts` 帶 3 次網路 retry：
- **救回 1,803 / 1,808 = 99.7%** ✅
- 真 404: 5 筆
- 耗時 90.7 分鐘 / API 1,808 次

### 🛡️ 同步改進

- **Circuit breaker**：fetch-tracks.ts + retry-failed-tracks.ts 都加上連續 15 筆失敗或最近 50 筆 >50% 失敗自動停止，避免 batch 全跑完才發現系統性問題

⚠️ **教訓**：
1. fetch-flights 用 `--from` / `--to`（支援 ISO 格式），**不是** `--from-time` / `--to-time`（那是 fetch-tracks 專用）。誤用會 fallback 預設「今天往前 3 天」。
2. fetch-tracks 原本只 retry HTTP 429，不 retry 網路層 `fetch failed` → 已修補。

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

## 全域進度（2026-07-10 快照）

```
flight-list.json:       161,722 筆航班
track-done:              51,541 筆
track-failed:               140 筆
JSONL 機場數:             1,594 座
不重複軌跡(manifest):     51,430 筆
Top-1000 戰役:           7,163 / 65,421 已抓（10.9%）｜Batch 1 rank 1-16 完成
本月額度:                核准 30 萬，已花 ~286,520（剩 ~13.5K）
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

#### 🇺🇸 紐約三場（2/18 ✅ 完成，可擴大日期）
| 機場 | 2/18 已抓 | 後續計劃 |
|------|---------|---------|
| KJFK 甘迺迪 | 1,137 (100%) | 擴大到 7 天 |
| KEWR 紐華克 | 1,026 (100%) | 一起 |
| KLGA 拉瓜地亞 | 970 (100%) | 一起 |

#### 🇺🇸 西岸都會區（2/18 ✅ 完成）
| 機場 | 2/18 已抓 |
|------|---------|
| KLAX 洛杉磯 | 1,292 (100%) |
| KBUR Burbank | 280 (100%) |
| KSNA Orange County | 474 (100%) |
| KONT Ontario | 281 (100%) |
| KSFO 舊金山 | 920 (100%) |
| KOAK 奧克蘭 | 339 (100%) |
| KSJC 聖荷西 | 314 (100%) |

```bash
# 擴大 7 天範圍時用這條
npx tsx scripts/fetch-flights.ts --from 2026-02-17 --to 2026-02-23 \
  --airports KJFK,KEWR,KLGA,KLAX,KSFO,KBUR,KSNA,KOAK,KSJC,KONT
npx tsx scripts/fetch-tracks.ts \
  --airports KJFK,KEWR,KLGA,KLAX,KSFO,KBUR,KSNA,KOAK,KSJC,KONT
```

#### 🇺🇸 美國尚未補：中部 / 南部樞紐（Tier 2-3）
| 機場 | 被動2/18 | 計劃 |
|------|---------|------|
| KORD 芝加哥 | 123 | 主動抓 1 天 |
| KDFW 達拉斯 | 74 | 一起 |
| KMIA 邁阿密 | 86 | 一起 |
| KIAH 休士頓 | 57 | 一起 |
| KATL ✅ | 1,820 | 已主動 |
| KDCA ✅ | 881 | 已主動 |
| PANC 安克拉治（貨運樞紐） | 35 | 跨太平洋紐帶 |
| PHNL 檀香山 | 22 | 跨太平洋紐帶 |

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
- [ ] 機場 OSM 邊界補齊 — `public/airports.geojson` 目前 107 座 vs JSONL 1,400+ 座；用 `scripts/fetch-airport-boundaries.ts --icao ...` 批次補（找不到 aerodrome polygon 會自動 runway-buffer fallback），可考慮加 `--missing` 模式對所有 no-polygon 機場全面補（源自舊 memory BACKLOG B008/B009，2026-04-23）

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
