# Playbooks

固定流程的 step-by-step runbook。新增流程的規則：同一個操作做過 **2 次以上**就寫進來。

---

## PB-01 新增機場群資料（某日 TW）

> ⚠ **三層同步原則**（參 PRINCIPLES）：資料 / UI / 邊界 缺一不可。

```bash
# 1. 預估航班數 + credit（沿用 scripts/oneoff/count-london.mjs 或改 airport list）
npx tsx scripts/oneoff/count-london.mjs

# 2. 抓 schedule（--from/--to 是 UTC 日期；TW 2/18 涵蓋 UTC 2/17 + 2/18）
npx tsx scripts/fetch-flights.ts \
  --airports EGTK,EGKB,EGLF,EGMC,EGMD \
  --from 2026-02-17 --to 2026-02-18

# 3. 抓 tracks（也可加 --date 2026-02-18 只抓單一 UTC 日）
npx tsx scripts/fetch-tracks.ts --airports EGTK,EGKB,EGLF,EGMC,EGMD

# 4. Split + dedupe + manifest
npx tsx scripts/split-tracks.ts

# 5. 上傳 S3
npx tsx scripts/upload-split-to-s3.ts

# 6. ⭐ UI 層：加入 cameraPresets.ts
#    - AIRPORT_INFO（icao → name/iata 對照）
#    - CAMERA_PRESETS（center / zoom / pitch / bearing）
#    - 若是新地區，記得更新 overview preset 航站數與 zoom

# 7. ⭐ 邊界層：抓 OSM aerodrome polygon
npx tsx scripts/fetch-airport-boundaries.ts \
  --icao EGTK,EGKB,EGLF,EGMC,EGMD
#   （找不到 aerodrome polygon 會自動 fallback 到 runway buffer）

# 8. npm run typecheck → commit（三層各一 commit） → push
#    Zeabur 自動 build（UI + geojson 會更新）

# 9. Zeabur 拉 tracks 資料（絕對路徑！容器 WORKDIR=/）
sh /app/scripts/pull-from-s3.sh

# 10. 更新 .claude/memory/DATA_SCOPE.md
```

**小規模測試**（不浪費 credits）：

```bash
npx tsx scripts/fetch-tracks.ts --airports EGKK --dry-run
npx tsx scripts/fetch-tracks.ts --airports EGKK --limit 5
```

---

## PB-02 新增 Region 分類

1. 改 `scripts/split-tracks.ts` 加入新 region 的判斷邏輯
2. 跑 `npx tsx scripts/split-tracks.ts` 重新產生 regions
3. **關鍵**：改 `scripts/pull-from-s3.sh` 的 `for R in ...` 加入新 region
4. `grep -r "TW JP HK"` 檢查是否還有別處 hardcode 的 region 清單
5. Commit + push（Zeabur 自動 build）
6. Zeabur 終端機跑 `sh scripts/pull-from-s3.sh`

> Long-term：考慮讓 `pull-from-s3.sh` 從 manifest 動態解析（BACKLOG B006）

---

## PB-03 Deploy 完整流程

```bash
# 本地
npm run typecheck    # 必跑，漏了 CI 會壞
git add <files>
git commit -m "..."
git push             # Zeabur auto-build

# Build 完後，Zeabur 終端機（注意：WORKDIR=/ 須用絕對路徑）
sh /app/scripts/pull-from-s3.sh
```

---

## PB-04 YouTube 影片製作（HQ）

```bash
# 開專用 Chrome（1920x1080 無 Retina）
npm run video:chrome       # 或 video:chrome:4k

# Chrome 內：Capture Mode → 設 Keyframes → 按 HQ → .webm 下載到 video/

# 後製合成
npm run video:compose video/HQ檔.webm "music/xxx.mp3" 600
#                                                        秒數（600 = 10 分鐘）
```

詳細 ffmpeg 指令見 `.claude/skills/video-compose.md`。

---

## PB-05 Session 結束

1. 喊 `/wrap-up` → skill 自動跑 5 階段
2. Review diff → 確認 / 修改 / skip
3. 執行 atomic commits
4. 手動 `git push origin master`
