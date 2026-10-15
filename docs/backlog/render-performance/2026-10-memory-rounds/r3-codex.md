## 定案

- **Backing/restore**：generation 留 TrackPath/衍生座標；color、aTRel 上傳為 immutable GL buffer後丟 staging，不能清空 Three `attribute.array` 後靠它復原。registry 在 context loss 停畫、dispose Three；Mapbox restored 後，以當下 GL 重建三層；flight 由座標＋`TrackPath.t`＋配色還原，完成才顯示。
- **單一來源**：同意刪 `mercatorCache`，但用 generation-owned SoA：x/y Float64、z/ECEF Float32＝32 B/點，不直接吃靜態 Float32 position（提前量化約 2.4 m）。count pass 預配每班 bucket、point/index range；progressive 記 filled/uploaded，活躍班可先 `ensureRange`，靜態按原序上傳。2D 同 SoA；light 單桶、subset index 保序。
- 先 5° conservative bucket＋mercator frustum；light 合成單一保序 index；tile 過閘門才做。

## 路線圖

G＝visual-check 六景＋light/APAC-L0/z15（`pctOver8<0.15%`、不成塊）、summary 全同、ab-run S2/world 無退步 >5%。

- **P0（小／零視覺）**：擴 `scripts/perf`。乾淨開機後，world/APAC-L0 量冷載、播停、seek、style×10、資料/LOD×20；分取 renderer/GPU RSS、post-GC heap/retainers、live GL bytes/upload、GPU frame/hw%、script/long-task。style 斜率 <5 MB/次且資源不增→P1 降級；峰值 >1 GB 或 long-task P95>50 ms→worker 提前；GPU P95>33 ms且關 static 省 >8 ms→indexed/cull 提前；restore 失敗→禁丟 backing。
- **P1（中／零視覺）**：改 `App`、`FlightScene`、`src/map/{MapView,customLayer,airspaceAurora,atlasGlowLayer,repaintScheduler}`：style 前 teardown、dispose、listener 對稱、restore owner、丟 color/aTRel、停白算/rAF。world 每切避免至少 102+102 MB，另省 `2.33M×16≈37 MB`；APAC-L0（2M 點）避免 176+176 MB，另省 64 MB。測：ready→stable→GC 後切十次，RSS 斜率≤5 MB/次且 listener/live-buffer 不增；`WEBGL_lose_context` 後 G、錯誤 0、每 generation 重傳一次。
- **P2（大／零視覺目標）**：改 `FlightScene`、`BatchedTrails`、`customLayer`、`App`、`useFlightData`、`flightLoader`：indexed GL_LINES、base/visible API、SoA、generation 預算、日期前置＋worker/columnar。world GPU `102→64 MB`（`44×1.245M+8×1.163M`）、static vertex `2.33M→1.25M`；總頂點 −26%，39 ms 線性上限約 −10 ms；CPU 省 `110+56−40≈126 MB`。APAC GPU `176→104 MB`、CPU 約省 212 MB。測：filter/track/date 只 `indexSubData`、attribute `bufferData=0`；progressive 即 seek 未建班，head Float32 bit-equal、range 無洞；worker 全 id/path hash 同，舊 generation 不呈現。
- **P3（中→大）**：先改 `FlightScene` 細桶/視錐；可見 25% 時 APAC drawn `2M→0.5M`。僅在 drawn>2M 且 static GPU 差>8 ms，或 geometry>512 MB／峰值>1 GB，且 visible/resident<25%，才改 `split-tracks`、`flightLoader`、`useFlightData` 做 tile；`104→26 MB`。pan/zoom 100 次須零 seam/缺線、light 順序與 Summary 同、ready 後不補畫。

**未共識**：我反對直接讀靜態 Float32 position；多約 10 MB（world）換取精度、2D 與 restore 單一路徑。