# Status

**最後更新**：2026-04-23（session：倫敦 10 座補抓）

## 本次 session 完成
- 倫敦缺的 5 座（EGTK / EGKB / EGLF / EGMC / EGMD）TW 2/18 資料補抓
  - Schedule：526 筆航班
  - Tracks：471 筆成功 / 2 無資料 / 0 失敗
- `split-tracks` → UK region 更新為 3,358 flights
- S3 上傳完成（6 regions + 900 airport JSONL + manifest）
- Bug fix：`scripts/pull-from-s3.sh` 補上 UK region（commit `066ed96` 已 push）

## 等用戶執行
- [ ] Zeabur 終端機跑 `sh scripts/pull-from-s3.sh` 拉新資料

## 下一步候選
見 [BACKLOG.md](BACKLOG.md)。優先：
- B001 Phase 3 深度分析（P1）
- B005 `scripts/count-london.mjs` 去留決策（P3，30 秒的事）

## 累計狀態快照
- 時刻表：58,849 筆航班
- 軌跡：22,536 筆不重複 / 900 座機場 JSONL
- 空域：6 個日期（2026-03-05 ~ 03-10）
- 詳細盤點：[DATA_SCOPE.md](DATA_SCOPE.md)
