#!/bin/sh
# pull-from-s3.sh
# 從 S3 拉取分拆後的 tracks/airspace 資料到 /data volume
# 在 Zeabur 終端機上執行：sh /app/scripts/pull-from-s3.sh
#
# Alpine 相容（BusyBox wget，不依賴 curl/bash）
# - 可重複執行（已下載的非空檔案會跳過）
# - 單檔失敗不會中斷整個腳本（會 echo 警告）
# - wget 加上 retry + timeout

# 注意：不用 set -e，個別檔案失敗時要繼續

S3_BASE="https://migu-gis-data-collector.s3.ap-southeast-2.amazonaws.com/flight-arc"
DATA_DIR="/data"
WGET_OPTS="-q -t 5 -T 30"  # 5 次 retry、30 秒 timeout

# 下載單檔，如已存在且非空則跳過
fetch() {
  src="$1"
  dst="$2"
  if [ -s "$dst" ]; then
    return 0  # 已存在且非空
  fi
  if ! wget $WGET_OPTS "$src" -O "$dst" 2>/dev/null; then
    rm -f "$dst"  # 半成品移除，下次可重抓
    echo "  ⚠️  fail: $(basename "$dst")"
    return 1
  fi
  return 0
}

echo "=== Pull Flight Arc data from S3 ==="
echo "Target: ${DATA_DIR}"
echo ""

# 建立目錄結構
mkdir -p "${DATA_DIR}/tracks/airports"
mkdir -p "${DATA_DIR}/tracks/regions"
mkdir -p "${DATA_DIR}/airspace/days"

# 1. 下載 tracks manifest（強制重抓，因為清單可能變了）
echo "[1/4] Tracks manifest..."
rm -f "${DATA_DIR}/tracks/manifest.json"
fetch "${S3_BASE}/tracks/manifest.json" "${DATA_DIR}/tracks/manifest.json"
echo "  done"

# 2. 從 manifest 解析機場列表，逐一下載（跳過已存在）
echo ""
echo "[2/4] Tracks airports..."
AIRPORTS=$(grep -o '"[A-Z][A-Z0-9]\{3\}": {' "${DATA_DIR}/tracks/manifest.json" | sed 's/": {//' | sed 's/"//' | sort)

COUNT=0
SKIPPED=0
FETCHED=0
FAILED=0
TOTAL=$(echo "$AIRPORTS" | wc -l | tr -d ' ')
for ICAO in $AIRPORTS; do
  COUNT=$((COUNT + 1))
  DST="${DATA_DIR}/tracks/airports/${ICAO}.jsonl"
  if [ -s "$DST" ]; then
    SKIPPED=$((SKIPPED + 1))
  else
    if fetch "${S3_BASE}/tracks/airports/${ICAO}.jsonl" "$DST"; then
      FETCHED=$((FETCHED + 1))
    else
      FAILED=$((FAILED + 1))
    fi
  fi
  if [ $((COUNT % 100)) -eq 0 ]; then
    echo "  ... ${COUNT}/${TOTAL} (fetched=${FETCHED} skipped=${SKIPPED} failed=${FAILED})"
  fi
done
echo "  done: total=${COUNT} fetched=${FETCHED} skipped=${SKIPPED} failed=${FAILED}"

# 3. 下載 regions（LOD 檔，含 KR / TH / all）
echo ""
echo "[3/4] Tracks regions..."
# regions 強制重抓（容量小、且常變動）。all = 全球 union LOD（world/all scope 用）
for R in TW JP HK KR TH US UK CN other all; do
  DST="${DATA_DIR}/tracks/regions/${R}.jsonl"
  rm -f "$DST"
  if fetch "${S3_BASE}/tracks/regions/${R}.jsonl" "$DST"; then
    echo "  ✓ ${R}.jsonl"
  else
    echo "  ⚠️  ${R}.jsonl missing"
  fi
done

# 4. 下載 airspace
echo ""
echo "[4/4] Airspace..."
rm -f "${DATA_DIR}/airspace/manifest.json"
fetch "${S3_BASE}/airspace/manifest.json" "${DATA_DIR}/airspace/manifest.json"

DATES=$(grep -o '"date": "[0-9-]*"' "${DATA_DIR}/airspace/manifest.json" 2>/dev/null | sed 's/"date": "//' | sed 's/"//' | sort)
for DATE in $DATES; do
  DST="${DATA_DIR}/airspace/days/${DATE}.jsonl"
  if [ -s "$DST" ]; then
    echo "  - ${DATE}.jsonl (skipped)"
  else
    if fetch "${S3_BASE}/airspace/days/${DATE}.jsonl" "$DST"; then
      echo "  ✓ ${DATE}.jsonl"
    fi
  fi
done

echo ""
echo "=== Done! ==="
echo "Tracks: $(ls ${DATA_DIR}/tracks/airports/*.jsonl 2>/dev/null | wc -l | tr -d ' ') airports"
echo "Regions: $(ls ${DATA_DIR}/tracks/regions/*.jsonl 2>/dev/null | wc -l | tr -d ' ') files"
echo "Airspace: $(ls ${DATA_DIR}/airspace/days/*.jsonl 2>/dev/null | wc -l | tr -d ' ') days"
echo ""
if [ "$FAILED" -gt 0 ]; then
  echo "⚠️  ${FAILED} files failed — 重新跑一次即可續傳"
fi
