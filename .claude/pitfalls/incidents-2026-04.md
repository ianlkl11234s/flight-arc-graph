# Incidents 2026-04（自舊記憶系統 INCIDENTS.md 搶救）

> 來源：舊記憶系統 INCIDENTS.md（該系統已於 2026-07-08 歸檔至 `docs/archive/claude-memory-2026-04/`）。
> 以下保留原文（現象 / 根因 / 對策）。「track-progress.json 322MB RangeError」一條已有獨立長文 [track-progress-migration.md](track-progress-migration.md)，不重複收錄。

---

## 2026-04-23 Memory 記憶誤判 EGLL 未抓

**現象**：Claude 依賴全域 memory 斷言 EGLL 2/18 未抓，用戶質疑後實測 JSONL 才發現已有 1,195 筆。

**根因**：Memory 條目「倫敦群 (EGKK/EGLC/EGSS/EGGW)」漏列 EGLL，Claude 盲信 memory 未驗證。

**對策**：涉及「某資料是否存在」「某機場是否已抓」類判斷，一律先 Grep / Read 驗證現況，不靠記憶。

---

## 2026-04-23 Alpine 容器無 bash

**現象**：Zeabur 跑 `bash scripts/pull-from-s3.sh` → `sh: bash: not found`

**根因**：nginx:alpine 只有 busybox `sh`，沒有 bash。

**對策**：
- 部署腳本 shebang 一律 `#!/bin/sh`，執行用 `sh xxx.sh`
- `scripts/pull-from-s3.sh` 本就是 `#!/bin/sh`，只是執行命令寫錯

---

## 2026-04-23 UK region 漏加 pull-from-s3.sh

**現象**：新增 UK region 後，`pull-from-s3.sh` 的 `for R in TW JP HK US other` 沒跟著更新，Zeabur 拉不到 UK。

**根因**：Region 清單分散兩處（`split-tracks.ts` 產出 + `pull-from-s3.sh` 消費），改一邊忘改另一邊。

**對策**：
- Hot fix：`pull-from-s3.sh` 加 UK（commit `066ed96`）
- 長期：讓 pull 腳本從 manifest 動態解析 region（見 refactoring-roadmap「低成本順手做」）
- 改上游 pipeline → `grep -r` 下游全路徑檢查

> 後記（2026-07-08 盤點）：同型問題再度發生——manifest 已有 CN region，但 `pull-from-s3.sh` 清單仍缺 CN。

---

## 2026-04-23 Zeabur 容器 WORKDIR 不是 /app，腳本須用絕對路徑

**現象**：Zeabur 終端機跑 `sh scripts/pull-from-s3.sh` → `sh: can't open 'scripts/pull-from-s3.sh': No such file or directory`（提示符 `/ #` 顯示當前在根目錄）。

**根因**：`nginx:alpine` image 沒設 `WORKDIR`，預設 `/`；Dockerfile 把腳本 COPY 到 `/app/scripts/pull-from-s3.sh`，但 shell prompt 起點在 `/`。

**對策**：
- 執行指令改絕對路徑：`sh /app/scripts/pull-from-s3.sh`
- 或先 `cd /app && sh scripts/pull-from-s3.sh`

---

## 2026-04-23 Node fetch 對 Overpass ETIMEDOUT（curl 正常）

**現象**：`scripts/fetch-airport-boundaries.ts` 10 座倫敦機場全部 `fetch failed`，error 是 `TypeError: fetch failed / cause: ETIMEDOUT`。同一 query 用 curl 3 秒完成。

**根因**：Node 內建 fetch 走 undici，對 Overpass 的 IPv6 / TLS 路由有問題，即使 `dns.setDefaultResultOrder('ipv4first')` 也無解。最小 query 也 timeout。

**對策**：改用 `execFileSync('curl', [...])` 繞過（commit `c916fdd`）。Node fetch 對 GIS 類慢 API（Overpass / Nominatim / OpenSky）要預期可能 ETIMEDOUT，優先 curl。

---

## 2026-04-23 EGMD OSM 無 aerodrome polygon（只有 node）

**現象**：Overpass 查 EGMD 有回 `node 5329577269`（tags 完整含 icao/iata），但沒有 way 或 relation，腳本回報「找不到邊界」。

**根因**：小型通用航空機場常見現象——OSM mapper 只標了一個點，沒畫邊界多邊形。

**對策**：在 `fetch-airport-boundaries.ts` 加 **runway-buffer fallback**：找不到 aerodrome polygon 時，以 aerodrome node 為錨點，查 2km 內最長 runway，做端點延伸 200m + 寬度 150m 的矩形 buffer（commit `c916fdd`）。EGMD 因此得到 1,864 × 300m 矩形邊界。

**副產品**：未來其他「只有 runway 沒 aerodrome polygon」的小機場可共用此 fallback。
