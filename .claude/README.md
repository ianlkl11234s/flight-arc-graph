# .claude/ — Flight Arc 協作目錄

## 結構

```
.claude/
├── README.md              # 本檔（目錄）
├── memory/                # ⭐ 專案記憶系統（Session 開頭必讀）
│   ├── README.md          # 記憶索引 + SOP
│   ├── STATUS.md          # 當前進度
│   ├── BACKLOG.md         # 待辦
│   ├── DATA_SCOPE.md      # 資料盤點
│   ├── PRINCIPLES.md      # 預設 / 原則
│   ├── PLAYBOOKS.md       # 固定流程
│   ├── GLOSSARY.md        # 術語表
│   ├── INCIDENTS.md       # 踩坑紀錄（append-only）
│   └── REFLECTIONS.md     # Session 反省（append-only）
├── skills/
│   ├── video-compose.md   # 影片後製（ffmpeg 流程）
│   └── wrap-up/
│       └── SKILL.md       # ⭐ Session 收尾 + memory atomic commit
└── pitfalls/              # Long-form 事件紀錄（INCIDENTS 的 archive）
    └── track-progress-migration.md
```

## 閱讀順序（新 session 開頭）

1. `memory/STATUS.md` → 知道上次結束在哪
2. `memory/BACKLOG.md` → 看優先級
3. `memory/PRINCIPLES.md` → 避免重開溝通
4. 必要時查 `memory/DATA_SCOPE` / `PLAYBOOKS` / `GLOSSARY`
5. **不變規則**在專案根 [../CLAUDE.md](../CLAUDE.md)

## Session 結束

喊 `/wrap-up` → skill 自動 5 階段更新 memory 並 atomic commit。

## 分層原則

| 層級 | 位置 | 性質 |
|---|---|---|
| 規則 | `CLAUDE.md`（專案根） | 不變規則（build 檢查、程式風格） |
| 狀態 | `.claude/memory/` | 變動狀態、待辦、反省 |
| 長文 | `.claude/pitfalls/` | 重大事件的詳細紀錄 |
| Skills | `.claude/skills/` | 可 user-invocable 的工作流程 |
