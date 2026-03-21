#!/bin/bash
# compose-video.sh — 合成 HQ 影片 + 音樂
#
# 用法：
#   bash scripts/compose-video.sh <video.webm> <music.mp3> <output_duration_seconds>
#
# 範例：
#   bash scripts/compose-video.sh video/flight-arc-hq.webm music/Lo-fi\ v3.mp3 600
#   → 輸出 10 分鐘 1080p 30fps MP4

set -euo pipefail

VIDEO="${1:?用法: compose-video.sh <video.webm> <music.mp3> <duration_seconds>}"
MUSIC="${2:?缺少音樂檔案}"
DURATION="${3:-600}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT="output/flight-arc-${DURATION}s-${TIMESTAMP}.mp4"

mkdir -p output

echo "=== Flight Arc Video Composer ==="
echo "影片: $VIDEO"
echo "音樂: $MUSIC"
echo "長度: ${DURATION}s ($(echo "scale=1; $DURATION/60" | bc) min)"
echo "輸出: $OUTPUT"
echo ""

# -r 30 (在 -i 之前) = 強制將輸入幀重新解讀為 30fps
#   → 修正 HQ 離線匯出的 variable timestamp 問題
#   → 每一幀內容正確，只是 timestamp 不對，-r 30 把它修正
ffmpeg -y \
  -r 30 -stream_loop -1 -i "$VIDEO" \
  -stream_loop -1 -i "$MUSIC" \
  -t "$DURATION" \
  -vf "scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  "$OUTPUT"

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo ""
echo "=== 完成 ==="
echo "檔案: $OUTPUT ($SIZE)"
echo "播放: open $OUTPUT"
