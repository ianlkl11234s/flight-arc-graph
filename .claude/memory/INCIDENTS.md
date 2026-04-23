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

## 2026-02 track-progress.json 322MB RangeError（歷史）

**現象**：`JSON.stringify` 累積 progress 觸發 v8 RangeError。

**根因**：所有進度存在單一 JSON 物件，定期完整 re-serialize；累積到 322MB（接近 v8 max string limit）。

**對策**：Migrate 到 `track-done.ndjson` + `track-failed.ndjson`（append-only，不再 re-serialize）。

**Long-form**：[pitfalls/track-progress-migration.md](../pitfalls/track-progress-migration.md)
