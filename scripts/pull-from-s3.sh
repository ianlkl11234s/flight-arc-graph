#!/bin/sh
# pull-from-s3.sh
# 從 S3 拉取分拆後的 tracks/airspace 資料到 /data volume
# 在 Zeabur 終端機上執行
#
# Usage:
#   curl -sL <this-script-url> | bash
#   或手動：bash pull-from-s3.sh
#
# 需要環境變數：S3_BUCKET, S3_REGION (或用預設值)

set -e

S3_BASE="https://migu-gis-data-collector.s3.ap-southeast-2.amazonaws.com/flight-arc"
DATA_DIR="/data"

echo "=== Pull Flight Arc data from S3 ==="
echo "Target: ${DATA_DIR}"
echo ""

# 建立目錄結構
mkdir -p "${DATA_DIR}/tracks/airports"
mkdir -p "${DATA_DIR}/tracks/regions"
mkdir -p "${DATA_DIR}/airspace/days"

# 1. 下載 tracks manifest
echo "[1/4] Tracks manifest..."
curl -sL "${S3_BASE}/tracks/manifest.json" -o "${DATA_DIR}/tracks/manifest.json"
echo "  ✓ manifest.json"

# 2. 從 manifest 解析機場列表，逐一下載
echo ""
echo "[2/4] Tracks airports..."
AIRPORTS=$(cat "${DATA_DIR}/tracks/manifest.json" | python3 -c "
import json, sys
m = json.load(sys.stdin)
for k in sorted(m.get('airports', {}).keys()):
    print(k)
" 2>/dev/null || echo "")

if [ -z "$AIRPORTS" ]; then
  # fallback: 如果沒有 python3，用 node
  AIRPORTS=$(node -e "
    const m = require('${DATA_DIR}/tracks/manifest.json');
    Object.keys(m.airports).sort().forEach(k => console.log(k));
  " 2>/dev/null || echo "")
fi

COUNT=0
TOTAL=$(echo "$AIRPORTS" | wc -l | tr -d ' ')
for ICAO in $AIRPORTS; do
  COUNT=$((COUNT + 1))
  curl -sL "${S3_BASE}/tracks/airports/${ICAO}.jsonl" -o "${DATA_DIR}/tracks/airports/${ICAO}.jsonl"
  if [ $((COUNT % 50)) -eq 0 ]; then
    echo "  ... ${COUNT}/${TOTAL}"
  fi
done
echo "  ✓ ${COUNT} airport files"

# 3. 下載 regions
echo ""
echo "[3/4] Tracks regions..."
for R in TW JP HK other; do
  curl -sL "${S3_BASE}/tracks/regions/${R}.jsonl" -o "${DATA_DIR}/tracks/regions/${R}.jsonl" 2>/dev/null || true
  echo "  ✓ ${R}.jsonl"
done

# 4. 下載 airspace
echo ""
echo "[4/4] Airspace..."
curl -sL "${S3_BASE}/airspace/manifest.json" -o "${DATA_DIR}/airspace/manifest.json" 2>/dev/null || true

# 從 airspace manifest 取得日期
DATES=$(cat "${DATA_DIR}/airspace/manifest.json" 2>/dev/null | python3 -c "
import json, sys
m = json.load(sys.stdin)
for d in m.get('dates', []):
    print(d['date'])
" 2>/dev/null || node -e "
  const m = require('${DATA_DIR}/airspace/manifest.json');
  m.dates.forEach(d => console.log(d.date));
" 2>/dev/null || echo "")

for DATE in $DATES; do
  curl -sL "${S3_BASE}/airspace/days/${DATE}.jsonl" -o "${DATA_DIR}/airspace/days/${DATE}.jsonl" 2>/dev/null || true
  echo "  ✓ ${DATE}.jsonl"
done

echo ""
echo "=== Done! ==="
echo "Tracks: $(ls ${DATA_DIR}/tracks/airports/*.jsonl 2>/dev/null | wc -l | tr -d ' ') airports"
echo "Regions: $(ls ${DATA_DIR}/tracks/regions/*.jsonl 2>/dev/null | wc -l | tr -d ' ') files"
echo "Airspace: $(ls ${DATA_DIR}/airspace/days/*.jsonl 2>/dev/null | wc -l | tr -d ' ') days"
