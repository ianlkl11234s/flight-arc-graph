# design-tools/

做設計決定、調參數時用的 HTML 頁面都放這裡，**不進正式 build**（`vite build` 只打包根目錄的 `index.html`）。

開法：`npm run dev -- --port 5199 --strictPort`，再開下表網址；用完記得 Ctrl+C 關掉 dev server。

| 頁面 | 網址 | 用途 |
|---|---|---|
| `design-system.html` | http://localhost:5199/design-tools/design-system.html | 活元件頁：`src/ui/` 所有元件暗／淡並排（規格見 `docs/design-system/spec.md`） |
| `boot-tuner.html` | http://localhost:5199/design-tools/boot-tuner.html | 開場雷達調整頁：調好按「複製設定」貼回 `src/components/boot/bootLayout.ts` |
| `color-preview.html` | 直接用瀏覽器開檔案即可 | 2026-02 早期的軌跡配色預覽（靜態頁，歷史參考） |

## 規則

- 之後新增的「調參數」「選方案」「預覽元件」用的 HTML，一律放這個資料夾，不要放 repo 根目錄。
- 需要 import `src/` 程式的頁面：`<script type="module" src="/src/...">` 用絕對路徑，dev server 下可直接運作。
- 已經拍板、只作為紀錄的方案比較頁（含當時的選擇與理由）放 `docs/design/<主題>/`，例如 `direction-showcase/`、`ux-decisions/`、`boot-and-list/`。
