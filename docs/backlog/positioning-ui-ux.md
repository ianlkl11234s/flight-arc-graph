# PlanArt 定位 × UI × UX 重整建議

> 2026-09-30 · 狀態：**部分拍板**（見下方決議）

## ✅ 決議（2026-09-30，使用者）

- **主題 = 機場起降軌跡 + 3D 動態**，不做航班追蹤；招牌就是軌跡本身（**不採用**「沒飛的那天」當招牌，事件作品可做為一般作品之一）
- **FR24 條款：暫不處理**，以網站為主
- **全球一日：已在進行中**（第 4–5 個月），§0-① 的成本疑慮不再是阻塞
- **OpenSky**：collector 已把點連成航跡（目前只收台灣周邊）；是否擴大另議
- **「工作室頁」= 現在的網站主體** → **優先做**：統一配色／字體，骨架參考 Pulse 但視覺要有 PlanArt 自己的差異。規劃見 [studio-design-system.md](studio-design-system.md)
- **作品頁（`/p/:id`）**：記錄在案，**延後**
> 產出方式：盤點 plan-art 現況 + mini-taiwan-pulse design system → 網路案例研究 → 第一版論點 → Fable 5.1 對抗式挑戰 → 事實查證 → 收斂。
> 相關：[refactoring-roadmap.md](refactoring-roadmap.md)（執行面）、[airport-selection-ux.md](airport-selection-ux.md)、[ios-app-plan.md](ios-app-plan.md)、[data-fetching-status.md](data-fetching-status.md)

---

## 0. 先講兩個會卡住定位的事實

**① 「全世界某一天完整軌跡」的成本比想像高一個量級**
- 全球單日：2026-07-23 FR24 紀錄 **153,359 班商業**／287,364 班全類別（[FR24 blog](https://www.flightradar24.com/blog/inside-flightradar24/july-2026-a-record-setting-month-for-flight-tracking/)、[Airways](https://www.airwaysmag.com/new-post/flightradar24-record-commercial-flights-july-2026)）
- 粗估：flight-tracks 40/班 × 10–15 萬 ≈ 4–6M，加 flight-summary 3/筆 ≈ +0.3–0.45M → **約 7–10 個月額度**（未跑 dry-run，僅量級）
- 而且付的錢大多買到「越洋巡航段」，那段在 L2 LOD 本來就被抽掉。真正需要「同一天全部」的只有 globe 全景動畫；機場肖像只需要終端區（~60 km 內）。

**② FR24 條款可能不允許現在的公開方式**（⚠️ 只讀到搜尋摘要，未讀原文）
- 摘要顯示：禁止再散布原始資料；快取依 endpoint 規定期限後須刪除（[ToS](https://www.flightradar24.com/terms-of-service)、[API FAQ](https://fr24api.flightradar24.com/docs/faq)）
- 現況：raw JSONL 放在公開可讀的 S3（`flight-arc/*` 開 GetObject）
- → **在投入更多 UI 前，先發信請 FR24 書面確認**「歷史軌跡能否長期保存並在公開網站視覺化、可否公開下載原檔」。若答案不利，影響的是整個「公開作品」方向，不只一日計畫。最低限度的改法：S3 只給前端讀、不列目錄，或改存衍生幾何。

**③ 另兩個順帶查清的**
- **OpenSky 擴大不值得（對 PlanArt）**：全球 bbox 一次 4 credits，註冊帳號 4,000/天 → 約 86 秒一張快照，是點不是航跡；Trino 歷史庫限學術／政府（[REST 文件](https://openskynetwork.github.io/opensky-api/rest.html)、[Trino](https://opensky-network.org/data/trino)）。**保留給 Pulse 當台灣即時層就好。**
- **ADS-B Exchange 每月 1 號免費全日樣本**存在（[sample-data](https://www.adsbexchange.com/data-products/sample-data/)），但授權摘要為「個人非商業研究／教育、不面向客戶」，公開網站能否用**未確認**；且為地面接收站資料，**越洋覆蓋很可能缺**（未驗證）——正好是大圓航線那段。不能當作「免費全球層」的前提。

---

## 1. 現況診斷（一句話版）

| 面向 | 現況 | 問題 |
|---|---|---|
| 心智模型 vs 實作 | 你記得的流程是「選機場 → 交叉航線 → 整體軌跡」 | **code 裡沒有「交叉航線」這一步**；組合模式是「dep OR dest 在 set」的聯集篩選（`App.tsx:860-865`）。UX 卡卡的根源之一 |
| 資訊架構 | Rail：Explore / Selection / View / Analyze / Capture，每個打開同一個浮動面板再分頁 | 操作導向（設定參數），不是內容導向（看什麼） |
| 視覺 | 至少 6 套寫死配色、3 種字體、按鈕樣式複製貼上 | 就是你說的「東拼西湊」 |
| 分享 | 無 URL state，只有 localStorage | 任何一個好畫面都無法被轉發 |
| 資料 | 97,511 班 / 2,941 座 / 52 個日期、覆蓋不均 | 「一天」的敘事撐不起來；全景是拼貼 |

---

## 2. 定位（先定這個）

### 評估過的三個方向

| 方向 | Tagline | 誰會愛 | 評語 |
|---|---|---|---|
| A. 航班工具 | 另一個 flight tracker | — | ❌ FR24 / ADS-BX / FlightAware 有即時、有 App、有 90 天–3 年歷史，正面競爭無勝算 |
| B. 天空的一日標本館 | 世界某一天的全景 + 每座機場的肖像 | 設計圈、航空迷 | 我的第一版。弱點：資料是 52 天拼貼、「一天」是假的；3,000 座每座一幅＝零策展 |
| C1. **跑道的筆跡**（型態學） | 同比例尺、北朝上／跑道對齊，百座機場終端區排成網格 | 設計師、海報買家、想比 SFO 平行進場 vs LHR holding stack 的航空迷 | 公開網路找不到多機場進場小多圖比較——**真正的空白地帶**；資料不均反而變成誠實的「標本數」 |
| C2. **沒飛的那天**（事件敘事） | 颱風空白日、戰前／戰當天／戰後 | 記者、一般讀者 | 你手上已有獨家素材（巴威颱風、中東 3 日）、零新支出 |

### 建議：以 **C1 為骨幹、C2 為招牌作品**，B 的「全球一日」降為長期目標

> ⚠️ 已被決議覆蓋：招牌改為軌跡本身；全球一日持續進行中。以下保留原始推理供參考。

- **骨幹 = 機場肖像 + 比較**（C1）：這是可持續擴充的主體，每多抓一座機場就多一幅標本；也和 [ios-app-plan.md](ios-app-plan.md)「單機場軌跡播放器」一致，避免三套定位並存。
- **招牌 = 事件作品**（C2）：每一件是一個有標題、日期、來源、兩句圖說的 permalink。這是「會被轉發」的東西。
- **全球一日**：不追「完整」，改追「同時性」——等 FR24 條款確認後，用 dry-run 算「canonical day × Top-N 終端區」的成本再決定。

外部參照：SkyPath Studio 賣單機場長曝光畫、83 座、人工挑日子（[skypathstudio.com](https://skypathstudio.com/)）——證明「策展」而非「全部給你」才是作品感的來源。

---

## 3. 作品 vs 工具：用路由切開，不用開關

> 第一版想法是「移植 Pulse 骨架 + 加一個作品模式開關」。Fable 的反駁成立：那只是把工具換皮。Pulse 是 dashboard 系統，美術館牆上的標籤要的是排版與留白。

**解法：工具是作者的，不是觀眾的。**

| Route | 給誰 | 設計系統 |
|---|---|---|
| `/studio` | 你（和進階航空迷） | **直接移植 Pulse**：左 icon rail 互斥面板、右上工具列、左下膠囊時間軸、右下停靠資訊卡、token + guard test。順便解掉 6 套配色／3 種字體（= refactoring-roadmap 的配色統一 Phase） |
| `/p/:id` | 觀眾 | **另一份極簡排版 spec**：無 chrome，只有作品標題、日期、來源、兩句圖說（美術館 label）；三個動作：播放、旋轉、下一幅；「在 studio 開啟」 |
| `/` | 首頁 | 畫廊：精選作品 + 機場肖像索引（見 §4 Q3） |

「一幅作品」= 可序列化的狀態（機場、日期、篩選、鏡頭、主題）+ 標題 + 圖說。**Deep link 不是另一個功能，是這個模型的副產品。**
兩邊共用 token 的底層（色票、字體、間距），差在元件層：studio 用 Pulse 元件、gallery 只用字與留白。

---

## 4. 你的四個問題

### Q1 不同機場進／離場比較 → **比較不要放在地圖上**
- 固定 60 km 框、旋轉對齊主跑道方向後並排；剩下的差異就是程序差異（holding、trombone、直進）。
- 加一張「距跑道頭距離 × 高度」剖面，把 20 座機場疊在一起——連續下降 vs 階梯下降一眼可見。
- ⚠️ region path 有 ±10–18 km jitter（見記憶 track-path-jitter），比較視圖必須用 L0 全解析機場檔。

### Q2 以機場軌跡為主體、還缺什麼 → **跑道級歸屬**
- 用最終航向 + 門檻距離把每班分到跑道 → 就能偵測「配置翻轉」（風向一變整個扇形翻面），那是一座機場一天最有戲的時刻。
- 衍生：跑道使用率（參考 [AirNav Runway in Use](https://www.airnavradar.com/blog/airnav-radarbox-features-runway-in-use)）、holding 事件（演算法可參考 [traffic 的 holding_pattern / aligned_on_ils](https://traffic-viz.github.io/api_reference/traffic.core.flight.html)）。
- 其次：deep link（§3 已涵蓋）、同比例尺比較（Q1）。

### Q3 3,000 座機場怎麼引導 → **不給 3,000 個選項**
- 既有的 Bloom 星圖就是索引，但**亮度改成「資料完整度」而非流量**——誠實告訴觀眾哪裡有好標本（先完成 [airport-selection-ux.md](airport-selection-ux.md) ① 重建 completeness metadata）。
- 三個入口就夠：精選作品、搜尋、**「隨機一幅」**。點星圖光點直接進該機場肖像並跳到有資料的日期（= airport-selection-ux 的 ⑥）。
- 參考：[FlightConnections](https://www.flightconnections.com/) 的「點機場看網路」是探索型入口的原型。

### Q4 怎麼更美地呈現軌跡 → **不是畫線，是畫累積亮度**
- 加法混合：300 條重疊進場成亮核、一次復飛留淡痕——長曝光邏輯（Koblin [Flight Patterns](https://www.aaronkoblin.com/project/flight-patterns/)、SkyPath）。
- 高度用線寬／模糊表達，不用色相；**單色 + 一個強調色**；底圖幾乎全暗，讓海岸線由航跡自己浮現。
- 高空／低空分兩層、各自調亮度（[Bergillos, One Day of Global Air Traffic](https://cbergillos.com/blog/2022-11-11-24h-global-air-traffic/)）：低空 = 機場個性，高空 = 大圓網路。
- 敘事：先流動、後揭示結構（[NATS UK24](https://nats.aero/blog/2025/02/bringing-air-traffic-control-to-life-the-invisible-infrastructure-of-the-skies/)）——播完一天的光跡，再淡入跑道、扇形、holding 標註。
- 6 組 color preset 是症狀不是功能：gallery 只留 1–2 組策展過的，studio 保留微調。

---

## 5. 需要你拍板的三件事

1. **定位**：C1 骨幹 + C2 招牌（建議）／其他
2. **FR24 條款**：是否發信確認？（建議：UI 大改前先發）
3. **全球一日**：暫緩，等 ② 有答案後用 `fetch-tracks --dry-run` 估「canonical day × Top-N 終端區」；另需確認 FR24 Essential 的 flight-tracks 歷史可回溯多久，才能選 7/23 紀錄日這類日期

---

## 6. 建議執行順序

| 步 | 做什麼 | 新 credits | 依賴 |
|---|---|---|---|
| 0 | 發信 FR24 確認條款 | 0 | — |
| 1 | **第一件作品：桃機 7/10–7/11–7/12 三聯畫**（疏散潮／760 架次全取消的空白日／回歸潮），一個 permalink、一個標題、兩句圖說 | 0 | 資料已在手 |
| 2 | 作品狀態序列化 + `/p/:id` 路由（步 1 的副產品） | 0 | 1 |
| 3 | `/studio` 移植 Pulse design system（token + guard test），收斂 6 套配色 | 0 | 可與 1–2 平行 |
| 4 | 機場肖像比較視圖（跑道對齊小多圖 + 距離×高度剖面），先做 TW + 歐洲樞紐等完整度高的 | 0 | L0 資料 |
| 5 | 跑道歸屬 + 配置翻轉偵測 | 0 | 4 |
| 6 | Bloom 星圖改完整度亮度 + 點光點進肖像 + 隨機一幅 | 0 | airport-selection-ux ① |
| 7 | 全球一日（視步 0 結果與 dry-run） | 大 | 0 |

步 1 之所以排第一：它是「別人沒有的資料 × 零新支出 × 非航空迷也看得懂」的交集，而 deep link、作品模式、比較視圖都是做出這一幅的副產品——**先出作品，再出平台**。
