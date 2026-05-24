# 軌跡幾何分析 — 進度 Status

**更新**：2026-05-24
**規劃**：[`trajectory-geometry-analysis-plan.md`](trajectory-geometry-analysis-plan.md)
**探索區**：`exploration/`（gitignored，Python）→ 驗證 OK 的演算法畢業成 `src/analysis/*.ts`（進 git）

> 兩欄狀態：**探索**=Python 在 exploration/ 驗證過；**畢業**=翻成正式 TS 進 git。

## 總覽

| 階段 | 內容 | 探索 (Py) | 畢業 (TS) |
|---|---|:---:|:---:|
| P0 | 運動學基礎層 | ✅ | ⬜ |
| P1 | 跑道 + 進場方向（含 L/R + 每日時序） | ✅ | ⬜ |
| P2 | 進場拓撲分類（5 體系） | ✅* | ⬜ |
| P3 | 垂直剖面 / 平台高度 / 巡航層 | ✅ | ⬜ |
| P4 | 視覺化 | ⬜ | ⬜ |

\* P2 分類器可跑，但 base_to_final↔trombone 門檻待人工校準。

---

## P0 運動學基礎層　✅ 探索完成

`exploration/lib/kinematics.py`：`haversine_km`/`bearing_deg`/`angle_diff`、`compute_kinematics`、`approach_window`、`fix_altitude_units`（移植 flightLoader.ts）。
- [ ] 畢業 → `src/analysis/trajectoryKinematics.ts`（介面已一對一對齊）

## P1 跑道 + 進場方向　✅ 探索完成

`exploration/lib/runways.py` + `scripts/01_explore_tpe.py` + `scripts/03_runway_advanced_tpe.py`
- [x] 接 OurAirports `runways.csv`、`runway_directions`、`match_direction`
- [x] 落地航向直方圖 + 跑道號標註
- [x] **平行跑道 L/R 區分** `assign_runway`（用進場段對各跑道中心線的垂直偏移）
- [x] **每日用哪頭時序**（風向換邊）
- [ ] 推到其他機場（HKG/HND/DXB…）
- [ ] 畢業 → `src/analysis/runwayDetection.ts` + `src/data/runwayDatabase.ts`

## P2 進場拓撲分類　✅* 探索完成（門檻待校準）

`exploration/lib/topology.py` + `scripts/02_topology_tpe.py`
- [x] 特徵抽取（雙窗口：30nm 判型態、80nm 判 holding；2km 等里程重採樣 + 8° deadband 去噪）
- [x] 啟發式分類：straight_in / base_to_final / long_final / trombone / holding / other
- [x] 型態比例 + 各型態代表軌跡平面圖
- [ ] **人工校準 base_to_final↔trombone 界線**（RCTP 乾淨 90° base 少，多連續到~180°）
- [ ] 畢業 → `src/analysis/approachTopology.ts`

## P3 垂直剖面　✅ 探索完成

`exploration/lib/vertical.py` + `scripts/04_vertical_tpe.py`
- [x] 高度單位修正 `fix_altitude_units`（驗證 `tpe_altfix_compare.png`）
- [x] `detect_level_segments` 平台高度偵測（過濾 <300ft 地面點）
- [x] `cruise_level` 巡航層、`classify_descent` CDA/step_down/mixed
- [ ] 畢業 → `src/analysis/verticalProfile.ts`

## P4 視覺化　⬜ 待辦

- [ ] 離線 Chart.js 報告（仿 docs/analysis/）
- [ ] Sidebar「🔬 深度分析」面板
- [ ] 3D 地圖同拓撲/同跑道同色疊圖

---

## 已驗證發現（TPE / RCTP，2849 班降落 / 40 天 2026-02-18~04-05）

### 方向與跑道（P1）
- 05 方向 **81.8%** vs 23 方向 **18.2%**（冬末春初東北季風期）
- L/R 分配：**05L 51.4% / 05R 30.5% / 23L 5.4% / 23R 12.7%**
- 反向日（23 為主）6 天：02-23/24/27、03-02/17/18 → 對應西南風換邊
- L/R 判定意外可靠（RCTP 跑道間距 1.5km ≫ GPS 誤差）；**窄距平行跑道機場會失準**

### 進場拓撲（P2）
- **trombone 下風折返 53.9%**（最多）、other 20.3%、straight_in 15.9%、long_final 5.6%、base_to_final 3.9%、holding 0.4%
- TPE 本質是**大角度轉向型**（跑道 05/23 東北-西南向 + 航班多從北/南方來）
- holding 極少 → 高效率機場，這批日期幾乎不繞等待圈
- 「未匹配跑道」66 班 94% 落在 other（末端未對齊的異常進場）

### 垂直剖面（P3）
- 進場平台高度密集帶 **1000–4000ft**（4000ft 最高峰）+ **9000ft 初期平台**；5000ft 以上稀疏
- 巡航層**雙峰**：FL360 主峰（長程）+ FL110 次峰（短程/區域）；中位 FL350
- 下降型態：**CDA 43.7% / step_down 32.0% / mixed 24.3%**（CDA 實際應略高，緩降誤判成平台）

## 重要 caveat（統計代表性）
- **每日班數不均**：02-18~25 每天 200+ 班（主動抓滿），其餘 30~40 班/天 → 「每日」統計權重不均，反向日比例要小心解讀
- 方向偏好 = 這 40 天（冬末春初）的風向，非全年
- 30s 採樣：拓撲只能分型態、平台長度量化偏粗、緩降可能誤判平台

## 產出檔案（`exploration/output/`）
- P1：`tpe_landing_headings.png`、`tpe_runway_by_day.png`、`tpe_runway_lr.png`
- P2：`tpe_topology_counts.png`、`tpe_topology_examples.png`
- P3：`tpe_altfix_compare.png`、`tpe_platform_altitudes.png`、`tpe_cruise_levels.png`、`tpe_descent_types.png`

## 下一步（建議順序）
1. **P2 人工校準** base_to_final↔trombone 門檻（疊圖逐班檢視）
2. **推到其他機場**：HKG（底邊匯入）、HND（長 final）、DXB（trombone）驗證分類器泛化
3. **P4 視覺化**：先做離線 Chart.js 報告彙整四模組
4. **畢業到 TS**：P0 kinematics 先翻（其他都依賴它）
