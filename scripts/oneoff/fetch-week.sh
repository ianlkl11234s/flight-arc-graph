#!/bin/bash
# fetch-week.sh
# 抓取完整一週（2/18–2/24）的航班時刻表，分兩段跑以避免重複消耗 credits
#
# 分段說明：
#   Step A：原本 11 座機場，只補 2/21–2/24（2/18–2/20 已有資料）
#   Step B：新增 11 座機場，從 2/18 開始抓完整 7 天
#
# 使用方式：
#   chmod +x scripts/oneoff/fetch-week.sh
#   ./scripts/oneoff/fetch-week.sh

set -e
cd "$(dirname "$0")/../.."

# ── 原本 11 座機場（2/18–2/20 已抓過，只補剩下 4 天）────────────
ORIGINAL="RCTP,RCSS,RCKH,RCNN,RCBS,RCFG,RCQC,RCMQ,RCYU,RCFN,RCKU"

# ── 新增 11 座機場（全部都是第一次抓，完整 7 天）────────────────
NEW="RCMT,RCWA,RCCM,RCGI,RCLY,RCKW,RCDC,RCAY,RCPO,RCSQ,RCQS"

echo "========================================"
echo "  fetch-week.sh  |  2026-02-18 ~ 2/24"
echo "========================================"
echo ""

# ── Step A ──────────────────────────────────────────────────────
echo "[Step A] 原本 11 座機場：補齊 2/21–2/24"
echo "  機場：$ORIGINAL"
echo ""
npx tsx scripts/fetch-flights.ts \
  --from 2026-02-21 \
  --to   2026-02-24 \
  --airports "$ORIGINAL"

echo ""
echo "========================================"
echo ""

# ── Step B ──────────────────────────────────────────────────────
echo "[Step B] 新增 11 座機場：完整 2/18–2/24"
echo "  機場：$NEW"
echo ""
npx tsx scripts/fetch-flights.ts \
  --from 2026-02-18 \
  --to   2026-02-24 \
  --airports "$NEW"

echo ""
echo "========================================"
echo "  全部完成！"
echo "========================================"
