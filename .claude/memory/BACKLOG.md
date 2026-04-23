# Backlog

優先級：**P0** = 阻塞中 / **P1** = 規劃期內 / **P2** = 穩定後再做 / **P3** = nice-to-have

## 進行中 / 待辦

| ID | 優先級 | 項目 | 狀態 | Blocker / 備註 |
|---|---|---|---|---|
| B001 | P1 | Phase 3 深度分析（準點率、Chord Diagram、甘特圖整合） | open | 詳見全域 memory `project_phase3_backlog.md` |
| B002 | P2 | [BUG] Stn slider `setPaintProperty` 對 circle 圖層不生效 | open | Mapbox terrain 模式限制？需要實驗切換 source 或改 symbol |
| B003 | P3 | 補抓 EGLL 2/18 TW 邊界時段差異 21 筆 | open | 佔比 1.7%，可先忽略 |
| B004 | P3 | `PRINCIPLES.md` 拆出 `DECISIONS.md`（ADR 格式） | open | PRINCIPLES 條目多到難讀時再拆 |
| B005 | P3 | `scripts/count-london.mjs` 去留決策 | open | 保留 / 刪除 / 重構成 `count-flights.ts` 通用版？ |
| B006 | P3 | `pull-from-s3.sh` region 清單改從 manifest 動態解析 | open | 避免每次加 region 都要改腳本（INCIDENT #3） |
| B007 | P3 | 刪除 `scripts/track-progress.json` + `.bak`（migration 已穩定） | open | 322MB + 備份，節省空間 |

## 已完成（近期 10 筆）

- 2026-04-23 ✅ 倫敦 10 座 TW 2/18 全完整（EGTK/EGKB/EGLF/EGMC/EGMD 補抓）
- 2026-04-23 ✅ UK region 加入 `pull-from-s3.sh`（commit `066ed96`）
- 2026-04-17 ✅ 中東 OMDB + OMAA 3 日期（戰前 2/25 / 戰當天 2/28 / 戰後 4/05）
- 2026-04-17 ✅ 新加坡 WSSS TW 2/18
- 2026-04-17 ✅ 倫敦 4 座主力 EGKK/EGSS/EGGW/EGLC TW 2/18
- 2026-04-16 ✅ `track-progress.json` 322MB → NDJSON migration（瘦身 99.96%）

> 更久遠的完成項目已過期，不再追蹤。
