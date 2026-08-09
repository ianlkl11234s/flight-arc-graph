# Zeabur exec 長工被 524 掐斷（2026-08-09）

> 收尾大批資料部署時踩到。同型問題會在**任何**「exec 跑超過幾分鐘的容器內任務」重演，不限 flight-arc。

## 現象

抓完 11,545 筆軌跡、S3 上傳 2,306 MB 後，用 CLI 在容器內拉資料：

```bash
zeabur service exec --id <svc> --env-id <env> -i=false -- sh /app/scripts/pull-from-s3.sh --force-airports
```

跑了幾分鐘後死掉，log 只有一行：

```
ERROR	execute command failed: Message: 524 , Locations: [], Extensions: map[code:request_error], Path: []
```

524 = Cloudflare origin timeout。**exec 的連線有上限，長工必死。**

## 為什麼危險：留下 manifest 與資料檔不一致的中間狀態

`pull-from-s3.sh` 的順序是「先拉 manifest → 再逐檔拉 1,845 個機場」。524 掐在中間 →

| | 線上狀態 |
|---|---|
| `manifest.json` | ✅ 新的（66,078 筆 / 1,845 座）|
| `airports/ZUTF.jsonl` | ❌ 舊的（233 行，本地已是 994）|

站台**不會壞**（各機場檔是 lazy load，manifest 只是索引），所以肉眼看不出來 —— 但那 761 筆新軌跡線上根本不存在。**光看站台有沒有 200 無法發現這種失敗。**

## 對策：讓長工在容器內背景跑，exec 只負責啟動

```bash
zeabur service exec --id <svc> --env-id <env> -i=false -- \
  sh -c "nohup sh /app/scripts/pull-from-s3.sh --force-airports > /tmp/pull.log 2>&1 & sleep 3; echo STARTED"
```

exec 幾秒就返回，背景任務不受連線超時影響。之後用短 exec 查進度（每次都是秒級，不會再 524）：

```bash
zeabur service exec ... -- sh -c "tail -4 /tmp/pull.log; ls /data/tracks/airports | wc -l"
```

## 附帶踩到的兩個小坑

**1. `pgrep -f pull-from-s3` 會匹配到自己** —— 用它判斷「還在跑嗎」永遠回報 RUNNING，因為執行這條檢查命令的 `sh -c` 命令字串本身就含 `pull-from-s3`。監控迴圈因此永遠不會結束。改判 log 尾端的完成統計行（`done: total=...`）。

**2. CLI 的 environment ID 只能從全域 context 取得**，而 `zeabur context set project` 會把 environment/service 一併清成 `<not set>`。工作區有平行 session 時這會踩到別人。做法：
- 用 `zeabur deployment list --service-id <svc> --json` 讀 `environmentID`（**不必碰 context**）
- 之後一律用 `--id` + `--env-id` 明確指定
- 真的動了 context，記得三個都還原（project / env / svc）

## 驗證方式（別只看 HTTP 200）

```bash
# 容器內行數 vs 本地 manifest flights，抽幾座比對
zeabur service exec ... -- sh -c "for A in ZUTF KORD CYYZ; do wc -l < /data/tracks/airports/\$A.jsonl; done"

# 公開 URL 也驗一次（真實使用者路徑）
curl -s https://flight-arc.itsmigu.com/data/tracks/regions/CN.jsonl | wc -l   # 應等於 manifest 的 region 數
```

本次最終結果：1,845/1,845 檔到位（第一輪 1,844 成功、`EPMO.jsonl` 失敗 1 檔，**不帶 `--force-airports` 重跑一次即補上**，`fetched=1 skipped=1844 failed=0`）。

## 相關

- `--force-airports` 的必要性（skip-if-exists 導致更新拉不到）→ [altitude-units-incident-2026-07.md](altitude-units-incident-2026-07.md)
- Alpine 無 bash / region 清單兩處 hardcode → [incidents-2026-04.md](incidents-2026-04.md)
