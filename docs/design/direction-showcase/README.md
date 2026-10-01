# 視覺方向展示頁（2026-10-01）

- 線上版：https://claude.ai/artifact/Cc4NH4jcBT7ppKkWZUtbyR （第 3 版：A/F 延伸 8 方向 × 各 3 組強調色）
- **2026-10-02 決議：採用 A 塔台儀表 · 琥珀**；其餘方向（F／G 夜航跑道燈／H 抬頭顯示／I 平流層／J 航向顯示／K 紅眼航班／L 晨昏線）保留備選，日後可能改
- 每個方向的 token 在 `directions.tpl.html` 的 `.dir-*` CSS 區塊；方向說明與強調色在 script 的 `DIRS`
- 軌跡渲染（夜空光軌、6 組 COLOR_THEMES、起降染色）**不屬於本次 UI 改版範圍**，展示頁只是模擬

重建：`python3 docs/design/direction-showcase/build.py` → `out/`（out 與注入的軌跡資料不進 git）
