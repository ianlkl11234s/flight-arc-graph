# 接續工作 — 新機場 tracks 抓取（2026-04-16）

## 已完成 ✅

- Commit `2764995`：track-progress 改 NDJSON + 廢除 aviation_data 中介
- 新增 7 座機場 AIRPORT_INFO + CAMERA_PRESETS + 大倫敦總覽
- Migration 完成（15,539 done + 23 failed，瘦身 322MB → 137KB）
- RCBS 小規模測試通過（2 筆真抓 + dry-run skip 驗證）

## Credits 現況

- 月額度：666,000
- 已用：~16 credits（RCBS 測試）
- 預估本次總消耗：~135,000（20%）

---

## 🚧 接下來要做：3 個 Batch

### Batch 1：倫敦群（4 座，台灣時間 2026-02-18）

**預估**：~36,000 credits，約 45 分鐘

```bash
# Step 1 — 抓 flight summary
npx tsx scripts/fetch-flights.ts \
  --from 2026-02-17T16:00:00Z --to 2026-02-18T15:59:59Z \
  --airports EGKK,EGLC,EGSS,EGGW

# Step 2 — 抓 tracks
npx tsx scripts/fetch-tracks.ts --airports EGKK,EGLC,EGSS,EGGW
```

### Batch 2：新加坡 WSSS（台灣時間 2026-02-18）

**預估**：~16,000 credits，約 25 分鐘

```bash
npx tsx scripts/fetch-flights.ts \
  --from 2026-02-17T16:00:00Z --to 2026-02-18T15:59:59Z \
  --airports WSSS

npx tsx scripts/fetch-tracks.ts --airports WSSS
```

### Batch 3：中東 OMDB + OMAA ×3 日期

**預估**：~83,000 credits，約 2 小時

- 戰前：台灣時間 **2026-02-25**（史詩怒吼行動 2/28 前 3 天）
- 戰當天：台灣時間 **2026-02-28**
- 戰後：台灣時間 **2026-04-05**

```bash
# 戰前
npx tsx scripts/fetch-flights.ts \
  --from 2026-02-24T16:00:00Z --to 2026-02-25T15:59:59Z \
  --airports OMDB,OMAA

# 戰當天
npx tsx scripts/fetch-flights.ts \
  --from 2026-02-27T16:00:00Z --to 2026-02-28T15:59:59Z \
  --airports OMDB,OMAA

# 戰後
npx tsx scripts/fetch-flights.ts \
  --from 2026-04-04T16:00:00Z --to 2026-04-05T15:59:59Z \
  --airports OMDB,OMAA

# 三日期一次抓完 tracks
npx tsx scripts/fetch-tracks.ts --airports OMDB,OMAA
```

---

## 3 個 Batch 全部跑完後

### 1. 重建 manifest + regions
```bash
npx tsx scripts/split-tracks.ts
```

### 2. 上傳到 S3（給 Zeabur 用）
```bash
npx tsx scripts/upload-split-to-s3.ts
```

### 3. 加「海灣總覽」camera preset
OMDB + OMAA + OTHH 一併入鏡，zoom ~7，見 `src/map/cameraPresets.ts`

### 4. Zeabur 端拉資料
```bash
bash scripts/pull-from-s3.sh
```

### 5. 觀察期結束後清理舊檔
確認新流程穩定後：
```bash
rm scripts/track-progress.json       # 原 322MB 檔（已 migrated）
rm scripts/track-progress.json.bak   # 備份
```

---

## 工具備忘

**小規模測試（不浪費 credits）**：
```bash
# 乾跑
npx tsx scripts/fetch-tracks.ts --airports EGKK --dry-run

# 只抓前 N 筆
npx tsx scripts/fetch-tracks.ts --airports EGKK --limit 5
```

**中斷後續接**：兩個 Step 都支援自動續接（`fr24_id` 去重）。

**Rate limit**：Essential 方案 30 req/min，`fetch-tracks.ts` 設 2.05s delay。

---

## 相關文件

- [track-progress 瘦身 migration](pitfalls/track-progress-migration.md)
- [專案 CLAUDE.md](../CLAUDE.md)
