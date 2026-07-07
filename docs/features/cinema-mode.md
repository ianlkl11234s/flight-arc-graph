# Cinema Mode

> Capture 模式下的電影運鏡系統：速度控制、Orbit 旋轉、Keyframe 序列。原載於專案 CLAUDE.md，2026-07 外移至此。

## 功能清單
1. **速度選項**：1x、15x、30x、60x、120x、300x、600x
2. **Orbit 鏡頭旋轉**：Capture 模式下的 Cinema Bar，速度 0.2~8°/s，CW/CCW
3. **漸進式軌跡**：靜態軌跡 `progressive` 模式（飛過才顯示）
4. **Keyframe 系統**：擷取 → 排列 → 自動播放序列
   - Hold 階段（still / orbit with speed/direction）
   - Easing（ease-in-out / linear / ease-out）
   - Recapture、Loop、總時長顯示
   - Duration 輸入支援分:秒格式（m:ss），上限 99m59s
5. **儲存/載入**：localStorage 自動保存 + JSON 匯出/匯入
6. **收合式 CinemaBar**：▼ 收合 / Cinema ▲ 展開

## 新增檔案
- `src/hooks/useCinemaCamera.ts` — 鏡頭運動 hook（Orbit + Keyframe + Save/Load）
- `src/components/CinemaBar.tsx` — Capture 模式下的鏡頭控制 UI
