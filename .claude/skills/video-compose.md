---
name: video-compose
description: Flight Arc 影片後製工具。轉檔、合成音樂、偵測停頓、裁切、批次處理 HQ 錄製的 WebM 影片。
user_invocable: true
---

# Video Compose Skill

Flight Arc 專案的影片後製流程。

## 使用情境

用戶說「幫我轉影片」「合成音樂」「檢查停頓」「做最終影片」時觸發。

## 標準流程

### 1. 影片分析

```bash
# 基本資訊（解析度、編碼、大小）
ffprobe -v quiet -select_streams v:0 \
  -show_entries stream=width,height,codec_name \
  -show_entries format=size \
  -print_format json INPUT.webm

# 計算幀數（→ 除以 30 = 秒數）
ffprobe -v quiet -count_frames -select_streams v:0 \
  -show_entries stream=nb_read_frames \
  -print_format default=noprint_wrappers=1:nokey=1 INPUT.webm
```

### 2. 停頓偵測

```bash
ffmpeg -r 30 -i INPUT.webm \
  -vf "freezedetect=n=-60dB:d=0.5" \
  -f null - 2>&1 | grep "freeze_start"
```

常見停頓位置：
- **開頭 0~15 秒**：HQ 匯出 tile 載入中（幾乎必定有，需裁掉）
- **Keyframe 轉場處**：sequence 切換瞬間，0.5~2 秒（通常可接受）
- **末尾**：匯出結束（裁掉即可）

### 3. 轉檔（WebM → MP4）

```bash
ffmpeg -y -r 30 -i INPUT.webm \
  -ss TRIM_SECONDS \
  -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -an -movflags +faststart \
  OUTPUT.mp4
```

重要參數：
- `-r 30`（在 `-i` 之前）：修正 HQ 匯出的 variable timestamp
- `-ss N`：裁掉開頭 N 秒的靜止畫面
- `pad=ceil(iw/2)*2:ceil(ih/2)*2`：確保偶數解析度（libx264 要求）
- `-crf 18`：高品質（越小越好，18 接近無損）

### 4. 音樂合成

```bash
# 多首音樂依序拼接
cat > /tmp/concat.txt << EOF
file '/absolute/path/to/music1.wav'
file '/absolute/path/to/music2.wav'
EOF

ffmpeg -y -f concat -safe 0 -i /tmp/concat.txt \
  -c:a pcm_s16le /tmp/merged.wav

# 影片 + 音樂合成（影片長度為主）
ffmpeg -y \
  -i VIDEO.mp4 \
  -i /tmp/merged.wav \
  -c:v copy \
  -c:a aac -b:a 256k \
  -af "afade=t=in:st=0:d=3,afade=t=out:st=END_MINUS_4:d=4" \
  -shortest \
  -movflags +faststart \
  OUTPUT_FINAL.mp4
```

淡入淡出：
- `afade=t=in:st=0:d=3` — 開頭 3 秒淡入
- `afade=t=out:st=X:d=4` — 結尾 4 秒淡出（X = 影片秒數 - 4）

### 5. 音樂段落安排（長影片）

一小時影片的典型段落：
```
0:00 ~ 8:00   → 開場（氛圍建立，2-3 首）
8:00 ~ 20:00  → 上升期（節奏漸強，3-4 首）
20:00 ~ 35:00 → 高峰期（節奏最快，3-4 首）
35:00 ~ 50:00 → 下降期（放鬆，3-4 首）
50:00 ~ END   → 收尾（餘韻，2-3 首）
```

### 6. 縮放解析度（可選）

```bash
# 強制 1080p
ffmpeg -i INPUT.mp4 -vf "scale=1920:1080" -c:v libx264 -crf 18 OUTPUT_1080p.mp4

# 強制 4K
ffmpeg -i INPUT.mp4 -vf "scale=3840:2160" -c:v libx264 -crf 18 OUTPUT_4k.mp4
```

## 專案路徑

- 素材：`video/` — HQ 匯出的 .webm
- 音樂：`music/` — WAV 檔案
- 成品：`output/` — 合成完的 MP4
- 腳本：`scripts/compose-video.sh` — 通用合成腳本

## 注意事項

- macOS 沒有 `shuf`，用 `awk 'BEGIN{srand()}{print rand()"\t"$0}' | sort -n | cut -f2` 替代
- ffmpeg concat 的檔案路徑必須用**絕對路徑**
- 中文檔名在 concat list 中需要用單引號包裹
- HQ WebM 的 `avg_frame_rate` 通常是 `0/0`（variable），`-r 30` 必須在 `-i` 之前
- 影片寬高必須是偶數（libx264），用 `pad` filter 修正
