# Reflections（append-only）

每次 `/wrap-up` 追加一篇。格式：What worked / What didn't / Next-time rules / Memory 產出。

---

## 2026-04-23 倫敦 10 座補抓 + 建立 memory 系統

### What worked ✅

- 開頭先寫 `count-london.mjs` 實測 API 數字，讓 credit 估算有實證根據（不是單純憑空猜）
- `fetch-flights.ts` 的 `--airports --from --to` 設計可直接切片子集，不必改主程式
- `split-tracks` 自動按 region 重編，UK region 自然浮現
- 發現 `pull-from-s3.sh` 漏 UK 後立刻 atomic fix commit（不拖延）

### What didn't ❌

- **未驗證就信 memory**：以為 EGLL 沒抓，讓用戶質疑才發現誤判
- **Shell 指令推薦錯誤**：第一版回 `bash` 而非 `sh`，沒想到 Alpine 容器限制
- **Region 下游漏檢查**：split-tracks 產出 UK 後沒同步檢查 pull 腳本

### Next-time rules 🎯

1. 回答「某資料是否已存在」→ 一律先 `Read` / `Grep` 驗證，不單信 memory
2. 部署指令 → Zeabur / Alpine 一律 `sh`（不是 bash）
3. 改資料 pipeline 上游 → `grep -r` 下游所有消費端再改
4. 成本估算要標示「實測」vs「估算」

### Memory 產出

- INCIDENTS：+3 條（EGLL 誤判 / bash-not-found / UK 漏加）
- PRINCIPLES：+ 行為原則（不盲信 memory、部署用 sh、pipeline 下游全查）
- DATA_SCOPE：倫敦群 10 座完整 + UK region 3,358 flights
- BACKLOG：+3 項（B003 EGLL 21 筆邊界、B005 count-london.mjs 去留、B006 pull 腳本動態解析 region）
- PLAYBOOKS：PB-01（新增機場群）/ PB-02（新增 region）/ PB-03（deploy）確立

---

<!-- /wrap-up 之後追加新反省 -->
