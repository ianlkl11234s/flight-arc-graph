# Recording Overlay

> 錄影時的資訊 overlay（日期時間、相機角度、航班數）與 4K 錄製。原載於專案 CLAUDE.md，2026-07 外移至此。

## 動態 Overlay
- 左上角的日期時間 + 相機角度**每幀更新**（非靜態快照）
- `OverlayProvider` callback 模式，REC / HQ 模式都生效

## 右下角資訊
- 播放速度（`×60`，1x 時不顯示）
- 即時航班數量（`42 flights`）
- 資料來源（`Data: Flightradar24`）

## 4K 錄製
```bash
npm run video:chrome       # 1080p（原本）
npm run video:chrome:4k    # 4K（DPR=2 全螢幕）
```
