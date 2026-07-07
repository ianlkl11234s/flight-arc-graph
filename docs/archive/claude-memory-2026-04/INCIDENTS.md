# Incidents（append-only）

遇到問題並解決後記錄。格式：`## YYYY-MM-DD 標題` → 現象 / 根因 / 對策。

> 只 append，不修改舊條目。長篇紀錄放到 `.claude/pitfalls/` 後這裡附 link。

---

## 2026-04-23 Memory 記憶誤判 EGLL 未抓

**現象**：Claude 依賴全域 memory 斷言 EGLL 2/18 未抓，用戶質疑後實測 JSONL 才發現已有 1,195 筆。

**根因**：Memory 條目「倫敦群 (EGKK/EGLC/EGSS/EGGW)」漏列 EGLL，Claude 盲信 memory 未驗證。

**對策**：
- PRINCIPLES：加入「不盲信 memory，涉及資料存否一律先 Grep / Read 驗證」
- 全域 memory：已更新為「倫敦群 10 座完整」

---

## 2026-04-23 Alpine 容器無 bash

**現象**：Zeabur 跑 `bash scripts/pull-from-s3.sh` → `sh: bash: not found`

**根因**：nginx:alpine 只有 busybox `sh`，沒有 bash。

**對策**：
- PRINCIPLES：部署腳本 shebang 一律 `#!/bin/sh`，執行用 `sh xxx.sh`
- `scripts/pull-from-s3.sh` 本就是 `#!/bin/sh`，只是執行命令寫錯

---

## 2026-04-23 UK region 漏加 pull-from-s3.sh

**現象**：新增 UK region 後，`pull-from-s3.sh` line 46 的 `for R in TW JP HK US other` 沒跟著更新，Zeabur 拉不到 UK。

**根因**：Region 清單分散兩處（`split-tracks.ts` 產出 + `pull-from-s3.sh` 消費），改一邊忘改另一邊。

**對策**：
- Hot fix：`pull-from-s3.sh` 加 UK（commit `066ed96`）
- 長期：讓 pull 腳本從 manifest 動態解析 region（BACKLOG B006）
- PRINCIPLES：改上游 pipeline → `grep -r` 下游全路徑檢查

---

## 2026-04-23 Zeabur 容器 WORKDIR 不是 /app，腳本須用絕對路徑

**現象**：Zeabur 終端機跑 `sh scripts/pull-from-s3.sh` → `sh: can't open 'scripts/pull-from-s3.sh': No such file or directory`（提示符 `/ #` 顯示當前在根目錄）。

**根因**：`nginx:alpine` image 沒設 `WORKDIR`，預設 `/`；Dockerfile 把腳本 COPY 到 `/app/scripts/pull-from-s3.sh`，但 shell prompt 起點在 `/`。

**對策**：
- 執行指令改絕對路徑：`sh /app/scripts/pull-from-s3.sh`
- 或先 `cd /app && sh scripts/pull-from-s3.sh`
- PRINCIPLES + PLAYBOOKS：Zeabur 容器腳本命令一律寫絕對路徑

---

## 2026-04-23 Node fetch 對 Overpass ETIMEDOUT（curl 正常）

**現象**：`scripts/fetch-airport-boundaries.ts` 10 座倫敦機場全部 `fetch failed`，error 是 `TypeError: fetch failed / cause: ETIMEDOUT`。同一 query 用 curl 3 秒完成。

**根因**：Node 內建 fetch 走 undici，對 Overpass 的 IPv6 / TLS 路由有問題，即使 `dns.setDefaultResultOrder('ipv4first')` 也無解。最小 query 也 timeout。

**對策**：改用 `execFileSync('curl', [...])` 繞過（commit `c916fdd`）。同一腳本的其他 fetch 若也遇到類似問題，比照處理。

---

## 2026-04-23 EGMD OSM 無 aerodrome polygon（只有 node）

**現象**：Overpass 查 EGMD 有回 `node 5329577269`（tags 完整含 icao/iata），但沒有 way 或 relation，腳本回報「找不到邊界」。

**根因**：小型通用航空機場常見現象——OSM mapper 只標了一個點，沒畫邊界多邊形。

**對策**：在 `fetch-airport-boundaries.ts` 加 **runway-buffer fallback**：找不到 aerodrome polygon 時，以 aerodrome node 為錨點，查 2km 內最長 runway，做端點延伸 200m + 寬度 150m 的矩形 buffer（commit `c916fdd`）。EGMD 因此得到 1,864 × 300m 矩形邊界（4 角 + 收口）。

**副產品**：未來其他「只有 runway 沒 aerodrome polygon」的小機場可共用此 fallback。

---

## 2026-02 track-progress.json 322MB RangeError（歷史）

**現象**：`JSON.stringify` 累積 progress 觸發 v8 RangeError。

**根因**：所有進度存在單一 JSON 物件，定期完整 re-serialize；累積到 322MB（接近 v8 max string limit）。

**對策**：Migrate 到 `track-done.ndjson` + `track-failed.ndjson`（append-only，不再 re-serialize）。

**Long-form**：[pitfalls/track-progress-migration.md](../pitfalls/track-progress-migration.md)
