# 全球空域資料規劃（Global Airspace Plan）

> 建立：2026-09-04
> 起因：空域圖層貼球修好後（PR #12），用戶問「抓下全世界的限制空域會很多嗎？這會是效能瓶頸嗎？」
> 方法：先量現況（本機實測，非估算），再推估全球規模，再決定要不要先做優化。
> 相關：[`render-performance-plan.md`](./render-performance-plan.md)（軌跡側的同類問題，LOD 分層手法可直接複用）

---

## 結論先講

**現況已經是瓶頸，而且瓶頸不在「資料多」，在「環點冗餘」。**

現有 12 國 15.66 MB 的 geojson 產生 **162.8 MB GPU buffer**。用自適應 Douglas-Peucker 簡化，可以砍到 **37.3 MB（保留 22.9%）**，面積誤差中位 0.006%、p95 1.44% —— 肉眼不可辨。

做完簡化之後，**全球資料反而比現在還小**（推估 93–149 MB）。所以順序是：**先簡化，再抓全球**。反過來做會直接撞牆。

🔴 **但技術不是最大的阻力 —— 授權才是。** 現有 11 國空域資料來自 OpenAIP，授權為 **CC BY-NC-SA 4.0**（非商業 + 姓名標示 + 相同方式分享）。目前 app 的 `Data Source` 面板**完全沒有標註 OpenAIP，也沒有標註台灣民航局 eAIP** —— 這是已經上線的合規缺口，與抓不抓全球無關，現在就該補（見 §零）。

---

## 零、授權（先於一切技術工作）

| 來源 | 涵蓋 | 授權 | 狀態 |
|---|---|---|---|
| **OpenAIP** | 11 國對照（cn/de/es/fr/gb/it/jp/nl/th/tr/us） | **CC BY-NC-SA 4.0**<br>（repo 文件記載；官網現行條款可能是 CC BY-NC 4.0，**擴案前務必上官網核實**） | 🔴 未署名 |
| **台灣民航局 eAIP** | 台灣本體 | **未結案** —— 入口頁無著作權聲明也無開放資料授權文字，非 data.gov.tw 平台資料，不確定是否適用 OGDL-Taiwan-1.0 | 🔴 未署名 |

證據：`taipei-gis-analytics/docs/data-catalog/aviation/airspace_openaip.md:9`、`airspace.md:32,40`

### 三件事

1. **補署名（Z1，現在就做）**：`src/components/InfoModal.tsx:241` 的 `sources` 陣列加上 OpenAIP 與民航局 eAIP 兩筆。CC BY 的 BY 就是這個要求，現在缺著。
2. **確認 plan-art 是不是「非商業」**：NC 條款是硬限制。如果這站未來有任何商業意圖（付費、公司產品、廣告），CC BY-NC-SA / CC BY-NC 都構成障礙，要另洽 OpenAIP 商業授權。**這題只有你能回答。**
3. **SA（相同方式分享）的傳染性**：如果現行條款真的含 SA，那「基於這批資料產生的衍生作品」也要以相同條款釋出 —— 簡化後的 geojson 屬於衍生作品。需要確認這對 repo 的授權安排有沒有影響。

台灣 eAIP 那條建議照 repo 文件的結論走：引用/散布前洽民航局飛航服務總台確認。

---

## 一、現況量測

量測環境：M 系列 Mac、Chrome headed、dev server localhost、13 份 geojson 全載。

### 1. 資料 → GPU 的膨脹

| 指標 | 數字 |
|---|---:|
| geojson 原始 / gzip | 15.66 MB / **4.19 MB** |
| 外環數 / 環點數 | 6,029 / **474,100** |
| 展開後頂點數 | **4,741,000** |
| **GPU buffer** | **162.8 MB** |
| 開啟時主執行緒阻塞 | **272 ms**（long task 142 + 130 ms） |
| fetch 13 檔（本機） | 69 ms |

膨脹倍率 10.4 倍的來源：每個環點展開成 10 個頂點（側壁 quad 6 + 頂邊線 2 + 底邊線 2），每頂點 9 個 float = 36 bytes。

```
環點 → wall 6 頂點 + top 2 + bottom 2 = 10 頂點 × 36 B = 360 B/環點
474,100 × 360 B = 162.8 MB
```

其中 12 bytes/頂點（54 MB）是 PR #12 新增的 `aDir`（貼球用的 ECEF 單位外法線）。

### 2. 幀時間影響（單次量測，僅供參考）

| 場景（歐洲 z5.2 pitch 55，播放中） | median | p95 |
|---|---:|---:|
| airspace ON | 8.4 ms | **17.0 ms** |
| airspace OFF | 8.3 ms | 9.3 ms |

median 沒差，**p95 幾乎翻倍** —— 這台機器夠強所以吃得下，但已經看得到偶發長幀。低階裝置會更明顯。

### 3. 按分類拆開：有 24% 是白花的

| 分類 | 預設 | 外環 | 環點 | 佔比 | GPU |
|---|---|---:|---:|---:|---:|
| prohibited (RCP/RCD) | ON | 2,552 | 230,957 | 48.7% | 79.3 MB |
| restricted (RCR) | ON | 1,898 | 127,985 | 27.0% | 43.9 MB |
| **control (TMA/CTR)** | **off** | 1,518 | **112,382** | **23.7%** | **38.6 MB** |
| fir | off | 38 | 2,601 | 0.5% | 0.9 MB |
| training / adiz | ON | 23 | 175 | 0.0% | 0.1 MB |

`control` + `fir` **預設是關的，卻照樣建進 buffer、上傳 GPU**。目前只在 fragment shader 用 `if (enabled < 0.5) discard` 擋（`src/three/shaders/airspaceAurora.frag:39`），vertex shader 仍跑滿全部頂點。

### 4. 資料精細度極不均

| 檔案 | 外環 | 環點 | 點/環 |
|---|---:|---:|---:|
| us_airspace | 1,986 | 190,889 | 96 |
| fr_airspace | 1,302 | 106,912 | **82** |
| it_airspace | 816 | 85,408 | **105** |
| de_airspace | 381 | 13,492 | 35 |
| gb_airspace | 302 | 18,194 | 60 |

FR + IT 兩國就佔全部環點的 **41%**，但外環數只佔 35%。這是取樣密度差異，不是空域數量差異 —— 也就是簡化的空間。

---

## 二、關鍵發現：簡化能砍掉 77%

對全部 6,029 個環跑 Douglas-Peucker（公尺平面座標，逐環以環心緯度換算）：

### 固定 epsilon（有問題）

| eps | 保留環點 | 保留率 | GPU | 小環(<50 km²)面積誤差 >5% |
|---:|---:|---:|---:|---:|
| 原始 | 474,100 | 100% | 162.8 MB | — |
| 100 m | 94,805 | 20.0% | 32.5 MB | **383 / 1,601** |
| 250 m | 72,347 | 15.3% | 24.8 MB | **796 / 1,601** |

壓縮率很好，但**固定 epsilon 會壓垮小型管制區** —— 半徑 4 km 的 CTR 用 100 m 容差會被砍成多邊形碎片。

### 自適應 epsilon（採用這個）

`eps = clamp(sqrt(環面積) × k, 下限, 上限)` —— 容差隨環的特徵尺寸縮放。

全部加上「簡化後點數 < 4 就回退原始環」的保護（7 個環觸發）：

| 參數 | 保留環點 | 保留率 | GPU | 面積誤差 中位/p95/最大 | 小環誤差 >5% |
|---|---:|---:|---:|---|---:|
| **k=0.01, 15–100 m** | **108,599** | **22.9%** | **37.3 MB** | **0.006% / 1.44% / 36.3%** | **6 / 1,601** |
| k=0.01, 15–150 m | 102,865 | 21.7% | 35.3 MB | 0.016% / 1.44% / 36.3% | 6 / 1,601 |
| k=0.01, 15–400 m | 94,440 | 19.9% | 32.4 MB | 0.045% / 1.44% / 36.3% | 6 / 1,601 |

**採用 k=0.01、下限 15 m、上限 100 m。**

上限之所以不取 400 m：z10.4（`s1-rctp-dark` 場景的 zoom）約 52 m/px，400 m 容差 ≈ **8 px**；z12 更是 24 px —— TMA/CTR 的圓弧邊界會在機場視角變成看得出來的多邊形。上限壓到 100 m 只多花 3 個百分點（22.9% vs 19.9%），換到「任何 zoom 都不會看到折角」，**C2（空域 LOD 兩層）因此可以直接砍掉**。

小環失真也一併解決：固定 100 m 是 383 個，自適應 + 回退保護後是 **6 個**。

---

## 三、全球規模推估

⚠️ **以下是外推，不是查證數字。** 現有 12 國已涵蓋航空最發達的一大塊（US/FR/IT/DE/GB/ES/NL/TR/JP/CN/TW/TH），缺的主要是加拿大、澳洲、俄羅斯、巴西、印度、韓國、北歐、東歐、中東、非洲、東南亞其他。新增國家的資料精細度多半低於 FR/IT，所以環點倍率會低於國家數倍率。

⚠️ **而且「全球」可能根本沒有全球那麼多** —— OpenAIP 是社群眾包資料庫，自稱 worldwide，但沒有任何 API 端點可以列出「哪些國家有資料」（官方在 Google Groups 自承，建議逐一試 ISO 代碼）。已知一個空集案例：`kr_airspace_3d.geojson` 只有 45 bytes、0 features，成因未查明。非洲、南美、多數南亞/東南亞國家的覆蓋率**完全沒有證據**。

所以下面這張表的「2.5–4 倍」是上界推估。真實倍率要靠 §四.B1 的探測才知道，而探測成本極低（一國一次 API 呼叫）。

| 情境 | 環點 | GPU buffer | vs 現況 |
|---|---:|---:|---|
| 現況（12 國，未簡化） | 474 K | **162.8 MB** | 基準 |
| 全球（未簡化，2.5–4×） | 1.2–1.9 M | **410–650 MB** | 撞牆 |
| **全球（簡化後 22.9%）** | **272–435 K** | **93–149 MB** | **與現在相當或更少** |

410–650 MB 是會出事的量級 —— 整合顯卡筆電、以及 Chrome 對單一 tab 的 GPU 記憶體上限都會撞到。而簡化後的 93–149 MB 完全在現有預算內。

另外兩個非 GPU 的成本也要一起看：

| 成本 | 現況 | 全球未簡化 | 全球簡化後 |
|---|---:|---:|---:|
| gzip 傳輸 | 4.19 MB | 10–17 MB | **2.4–3.8 MB** |
| 主執行緒阻塞 | 272 ms | 700 ms–1.1 s | **156–249 ms** |
| **git repo / Docker image** | **15.66 MB** | 39–63 MB | **9–14 MB** |

（傳輸量簡化後反而下降，是因為 geojson 座標字串本身就是大宗。）

⚠️ **這批 geojson 是進 git 的**（`git ls-files public/airspace/` 全部命中，沒被 gitignore），所以也一起進 Docker image。不像軌跡走 S3 + `pull-from-s3.sh`（那支腳本處理的 `airspace/days/*.jsonl` 是**空域快照**，跟這裡的管制區多邊形是兩回事）。

意思是：**全球資料未簡化的話，repo 與 image 會各背 39–63 MB，而且上游每次重跑都是一個大 diff。** 簡化後 9–14 MB 還在可接受範圍，但如果之後要保留原始精度版本，就得考慮改走 S3 —— 那會多出第三處 region 硬編碼（`pull-from-s3.sh`，CLAUDE.md 已經警告過這種分散清單漏加的坑）。

---

## 四、任務分級

### A. 抓全球資料之前必做

| # | 任務 | 省下 | 風險 | 備註 |
|---|---|---|---|---|
| **A1** | 環點簡化（自適應 DP，k=0.01／15–100 m，含 <4 點回退保護） | **77%** GPU + 傳輸 | 低 | 在上游 pipeline 產出時做，或在 plan-art 加一支 build 腳本 |
| **A2** | 按 category 拆 geometry，關閉的分類不建 buffer | 24%（**僅在預設關閉狀態；使用者打開 TMA 就是 0**） | 極低 | 見 §一.3；純前端改動 |
| **A3** | `buildGeometry` 分批 yield 或移進 worker | 消除 272 ms 阻塞 | 中 | 全球規模下會變 1 s 級，屆時必做 |
| **A4** | 改用 indexed geometry | **2.4×**（零資料損失） | 中 | 見下方說明。渲染改動，須過 CLAUDE.md 的 visual-check 三關 |

**A4 補充**：§一.1 的「膨脹 10.4 倍」是 non-indexed geometry 的結果，不是資料本質。每個環點其實只需要 **3 個唯一頂點**（wall 底 `ef=0`、wall 頂 `ef=1,hr=1`、底邊線 `ef=1,hr=0`；頂邊線可與 wall 頂共用），三個 draw 各自用 index buffer 引用同一份 attribute：

```
現在：10 頂點 × 36 B                        = 360 B/環點
A4：   3 頂點 × 36 B + 10 index × 4 B(u32) = 148 B/環點   → 2.4×
```

與 A1 正交，兩者疊加後現有 12 國約 **15 MB**。

A1 + A2 疊加後（預設分類），現有 12 國的 GPU 佔用從 162.8 MB 降到約 **28 MB**。

### B. 抓資料

| # | 任務 | 成本 | 說明 |
|---|---|---|---|
| **B1** | **全球覆蓋探測**：對 ~193 個 ISO 國碼各跑一次 `00_fetch_openaip.py --country XX`，記錄 features 數 | 低（純 API 呼叫，可能受 rate limit） | **這步先做，做完才知道真實規模。** 產出一張「國碼 → features 數 / 環點數」的表，取代 §三 的推估。⚠️ 這是資料源調研，照 GIS 路由表要 append 回 `taipei-gis-analytics/docs/data-catalog/aviation/airspace_openaip.md`，不能只留在 plan-art |
| B2 | 依 B1 結果挑國家實抓 | 低 | 建議先做有資料且航空發達的：CA/AU/KR/BR/IN/RU/北歐/東歐 |
| B3 | 補下游兩處硬編碼 | 極低 | `scripts/sync-airspace-from-gis.sh:21-33` 的 `MAPPINGS`、`src/data/airspaceLoader.ts:35-49` 的 `DEFAULT_SOURCES`，各加一行 |
| B4 | 查 KR 空集的成因 | 低 | 已知案例，可能是 ISO 代碼寫法或 OpenAIP 真的沒資料。查清楚才知道其他空集是同類問題還是真的沒覆蓋 |

### C. 之後視情況

| # | 任務 | 說明 |
|---|---|---|
| C1 | 按 viewport / region 懶載入 | A1+A2 做完可能就不需要；現在是 13 檔一次全載 |
| ~~C2~~ | ~~空域 LOD 兩層~~ | **已砍**。A1 的上限取 100 m 之後任何 zoom 都不會看到折角，不需要分層 |
| C3 | 拿掉 `aDir`，改在 shader 用 exp/atan 反推 | 省 12 B/頂點（現況 54 MB），代價是每頂點多幾個超越函數。**簡化做完後不值得**，記在這裡是為了留下取捨紀錄 |
| C4 | 大多邊形 densify | ADIZ 這類環點稀疏的多邊形貼球後邊仍是直線弦，最長邊（~500 km）中段約沉 5 km。相對 36 km 牆高不明顯，優先度低。⚠️ 與 A1 方向相反，若做需在簡化後才補點 |

---

## 五、資料來源與新增國家的成本

### 上游 pipeline

```
OpenAIP REST API                     交通部民航局 eAIP
/api/airspaces?country=XX            ais.caa.gov.tw（ENR 2.1/5.1/5.3/5.5）
        │                                     │
        └──── 00_fetch_openaip.py ────┐  ┌── 03_merge_airspace.py
                                      ▼  ▼
             taipei-gis-analytics/data/processed/aviation/airspace/
                        {cc}_airspace_3d.geojson
                                      │
                    sync-airspace-from-gis.sh（MAPPINGS 硬編碼）
                                      ▼
                        plan-art/public/airspace/{cc}_airspace.geojson
                                      │
                       airspaceLoader.ts（DEFAULT_SOURCES 硬編碼）
```

腳本：`taipei-gis-analytics/pipelines/aviation/airspace_openaip/00_fetch_openaip.py`（該目錄下唯一檔案）
- 高度：有做 FL/FT/M → 公尺換算（`to_meters()` 第 71-82 行），並保留原始文字
- 分類：`TYPE_MAP`（0-31 整數→字串，第 41-50 行）+ `KEEP_TYPES = {1,2,3,4,7,8,11,12}`（只留 R/D/P/CTR/TMA/FIR/ATZ/MATZ）
- **座標：完全不做簡化** —— geometry 從 API 原封不動塞進 GeoJSON（第 162-163、183 行）。整個 `pipelines/aviation/` 下 `grep -rn "simplify|tolerance"` **零命中**

這證實了 §二 的發現：環點冗餘是上游沒做簡化，不是資料本身需要那個精度。**A1 最自然的落點就是這支腳本**。

### 新增一個國家要動三處

| 位置 | 改什麼 | 成本 |
|---|---|---|
| 上游抓取 | `python3 00_fetch_openaip.py --country XX` | **零程式碼改動**（`--country` 是自由文字參數，第 189 行，**沒有硬編碼國家清單**） |
| `sync-airspace-from-gis.sh:21-33` | `MAPPINGS` 加一行 | 一行 |
| `airspaceLoader.ts:35-49` | `DEFAULT_SOURCES` 加一行 | 一行 |

**不需要客製 parser。** `parseFeatures()`（`airspaceLoader.ts:54`）吃的是統一 schema（`layer`/`code`/`floor_m`/`ceiling_m`/…），任何國家只要走過同一支 `00_fetch_openaip.py` 就自動相容。

所以**程式碼從來不是瓶頸，資料有沒有才是**（見 §四.B1）。

### 上游已有的調研

| 檔案（`taipei-gis-analytics/docs/`） | 重點 |
|---|---|
| `data-catalog/aviation/airspace.md` | 主資料集卡片：兩來源、schema、SOP、已知陷阱 |
| `data-catalog/aviation/airspace_openaip.md` | OpenAIP 專屬：授權、API 端點、SOP |
| `data-catalog/aviation/airspace_aip.md` | 台灣 eAIP 專屬 |
| `topic-research/aviation/HANDOFF_AIRSPACE.md` | 給 mini-taiwan-pulse 的交接：RPC contract、配色、9 種 layer 分布 |

**沒有**討論過「擴到全球」；`.gis-agent-system/journal/` 全部檔案 grep `openaip` 零命中。這是全新命題，沒有前人的坑可以繼承。

---

## 六、驗收

- **資料面**：簡化前後對每個 region 比對「外環數不變、退化環 0、面積誤差 p95 < 2%」
- **視覺面**：`scripts/perf/visual-check.mjs` 目前 6 個場景**空域全部關著**，不覆蓋這層。需要新增至少 2 個開啟空域的場景（一個 globe 遠景、一個 mercator 近景），否則簡化的視覺回歸沒有守門員
- **效能面**：`airspace ON/OFF` 的 p95 幀時間差（現況 17.0 vs 9.3 ms），目標是簡化後 ON 的 p95 回到 10 ms 以內

---

## 七、待拍板

1. 🔴 **plan-art 算不算「非商業」？** OpenAIP 是 NC 條款。這題只有你能回答，而且它決定整件事能不能做（見 §零）
2. **簡化在上游做還是下游做？** 上游（`00_fetch_openaip.py`）做的話所有消費者受益、也是最自然的落點，但要動別的 repo；下游（plan-art 加 build 腳本）改動範圍小，但原始精度只留在上游
3. **要不要先跑 B1 探測？** 成本極低（一國一次 API），但會把 §三 的推估換成真實數字，之後所有決策都建立在事實上。建議先做
4. **A2（按 category 拆 geometry）要不要現在就做？** 與抓全球無關，是現在就能拿到的 24%

---

## 建議執行順序

```
Z1 補署名（合規，10 分鐘）
  └─ 待拍板 1：確認 NC 條款 ← 這題沒答案就不要往下做
       └─ B1 全球覆蓋探測（半小時，得到真實規模）
            └─ A1 環點簡化（省 77%，上游或下游）
                 └─ A2 按 category 拆 geometry（省 24%）
                      └─ B2/B3 依探測結果實抓 + 接線
                           ├─ A3 buildGeometry 分批（規模上來才必要）
                           └─ A4 indexed geometry（再省 2.4×，須過 visual-check 三關）
```

Z1 與待拍板 1 是「不做就不該繼續」的關卡，其餘都可以按實際需要調整。
