#!/bin/sh
# pull-from-s3.sh
# 從 S3 拉取分拆後的 tracks/airspace 資料到 /data volume
# 在 Zeabur 終端機上執行：sh /app/scripts/pull-from-s3.sh
#
# Alpine 相容（用 wget，不依賴 curl/bash）

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
wget -q "${S3_BASE}/tracks/manifest.json" -O "${DATA_DIR}/tracks/manifest.json"
echo "  done"

# 2. 從 manifest 解析機場列表，逐一下載
echo ""
echo "[2/4] Tracks airports..."
AIRPORTS=$(grep -o '"[A-Z][A-Z0-9]\{3\}": {' "${DATA_DIR}/tracks/manifest.json" | sed 's/": {//' | sed 's/"//' | sort)

COUNT=0
TOTAL=$(echo "$AIRPORTS" | wc -l | tr -d ' ')
for ICAO in $AIRPORTS; do
  COUNT=$((COUNT + 1))
  wget -q "${S3_BASE}/tracks/airports/${ICAO}.jsonl" -O "${DATA_DIR}/tracks/airports/${ICAO}.jsonl"
  if [ $((COUNT % 50)) -eq 0 ]; then
    echo "  ... ${COUNT}/${TOTAL}"
  fi
done
echo "  done: ${COUNT} airport files"

# 3. 下載 regions
echo ""
echo "[3/4] Tracks regions..."
for R in TW JP HK US UK other; do
  wget -q "${S3_BASE}/tracks/regions/${R}.jsonl" -O "${DATA_DIR}/tracks/regions/${R}.jsonl" 2>/dev/null || true
  echo "  ${R}.jsonl"
done

# 4. 下載 airspace
echo ""
echo "[4/4] Airspace..."
wget -q "${S3_BASE}/airspace/manifest.json" -O "${DATA_DIR}/airspace/manifest.json" 2>/dev/null || true

# 從 airspace manifest 取得日期
DATES=$(grep -o '"date": "[0-9-]*"' "${DATA_DIR}/airspace/manifest.json" 2>/dev/null | sed 's/"date": "//' | sed 's/"//' | sort)

for DATE in $DATES; do
  wget -q "${S3_BASE}/airspace/days/${DATE}.jsonl" -O "${DATA_DIR}/airspace/days/${DATE}.jsonl" 2>/dev/null || true
  echo "  ${DATE}.jsonl"
done

echo ""
echo "=== Done! ==="
echo "Tracks: $(ls ${DATA_DIR}/tracks/airports/*.jsonl 2>/dev/null | wc -l | tr -d ' ') airports"
echo "Regions: $(ls ${DATA_DIR}/tracks/regions/*.jsonl 2>/dev/null | wc -l | tr -d ' ') files"
echo "Airspace: $(ls ${DATA_DIR}/airspace/days/*.jsonl 2>/dev/null | wc -l | tr -d ' ') days"
