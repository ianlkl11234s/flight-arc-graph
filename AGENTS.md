# Plan Art agent entry

本 repo 的詳細規則以 [`CLAUDE.md`](CLAUDE.md) 為準；只按需讀取與當前任務相關的記憶、文件與 skills，不要全文載入。

- 航跡資料、前端渲染、typecheck、視覺驗收與部署沿用既有 scope 與使用者授權；不因 agent 指示自行擴大變更或發布。
- 可獨立的盤點、搜尋、格式整理交由 Luna；有明確邊界的實作、測試或 review 交由 Terra。主 agent 負責整合、scope、測試與最終驗收。
- Claude commands/hooks 不代表 Codex 會自動執行；以可用工具與已驗證 runtime evidence 為準。
