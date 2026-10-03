# 分支與發布規則

## 分支

| 分支 | 用途 |
|---|---|
| `master` | 正式站。Zeabur 自動部署，只收 `develop` 的發布合併或 `hotfix/*` |
| `develop` | 日常整合與驗收。日常開發都在這裡，不直接 commit master |
| `feat/*`、`fix/*` | 從 `develop` 開，完成後合回 `develop` |
| `hotfix/*` | 從 `master` 開，修完合回 `master` 與 `develop` |

## 版號（SemVer）

- MAJOR：介面或資料格式的大改版（例如 v3.0.0 設計系統改版）
- MINOR：新功能、新資料批次上線
- PATCH：修正，不新增功能
- 版號寫在 `package.json` 與 `package-lock.json`，tag 為 `vX.Y.Z`（annotated）

## 發布步驟

1. 在 `develop` 完成驗收（`npm run typecheck`、`npm run design:guard && npm run design:test`；影響畫面時另跑 `scripts/perf/` 視覺回歸）
2. 把 `develop` 合進 `master`
3. 在 `master` 做發布 commit：改 `package.json`／`package-lock.json` 版本、更新 `docs/changelog.md`（版本總覽表＋該版詳細段落），commit message 為 `chore(release): vX.Y.Z`
4. 在發布 commit 打 annotated tag：`git tag -a vX.Y.Z -m "<標題>\n\n<重點>"`
5. 推送 master 與 tag：`git push origin master vX.Y.Z`（逐一列名，不用 `--tags`）
6. 建 GitHub Release：`gh release create vX.Y.Z --title "vX.Y.Z — <標題>" --notes "<重點>"`
7. Zeabur 自動 build 部署；若有資料變動，再於 Zeabur 執行 `sh /app/scripts/pull-from-s3.sh`
8. 把 master 合回 `develop`，使兩邊版號與 changelog 一致
