#!/bin/sh
# pull-from-s3.sh
# 從 S3 拉取分拆後的 tracks/airspace 資料到 /data volume
# 在 Zeabur 終端機上執行：sh /app/scripts/pull-from-s3.sh
#   全檔重拉 airports（S3 端資料整批更新時用，如 2026-07 高度單位遷移）：
#   sh /app/scripts/pull-from-s3.sh --force-airports
#   跳過 LOD（L1/L2）下載，只拉全解析度（省 ~1.2 GB 與下載時間，但前端拉遠時
#   會回落到全解析度、失去 Phase 2 的效能收益）：
#   sh /app/scripts/pull-from-s3.sh --no-lod
#
# Alpine 相容（BusyBox wget，不依賴 curl/bash）
# - 可重複執行（已下載的非空檔案會跳過；--force-airports 例外）
# - 單檔失敗不會中斷整個腳本（會 echo 警告）
# - wget 加上 retry + timeout

# 注意：不用 set -e，個別檔案失敗時要繼續

FORCE_AIRPORTS=0
WITH_LOD=1
for ARG in "$@"; do
  case "$ARG" in
    --force-airports) FORCE_AIRPORTS=1 ;;
    --no-lod) WITH_LOD=0 ;;
  esac
done

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

# 強制下載到同目錄 temp，成功後才原子替換。
fetch_replace() {
  src="$1"
  dst="$2"
  tmp="${dst}.tmp-$$"
  rm -f "$tmp"
  if ! wget $WGET_OPTS "$src" -O "$tmp" 2>/dev/null; then
    rm -f "$tmp"
    echo "  ⚠️  fail: $(basename "$dst")"
    return 1
  fi
  mv "$tmp" "$dst"
  return 0
}

echo "=== Pull Flight Arc data from S3 ==="
echo "Target: ${DATA_DIR}"
echo ""

# 建立目錄結構
mkdir -p "${DATA_DIR}/tracks/airports"
mkdir -p "${DATA_DIR}/tracks/regions"
mkdir -p "${DATA_DIR}/airspace/days"

# 1. 下載新 manifest 到 staging；等 daily 檔都齊了才 publish。
echo "[1/4] Tracks manifest (staging)..."
NEXT_MANIFEST="${DATA_DIR}/tracks/manifest.json.next"
if ! fetch_replace "${S3_BASE}/tracks/manifest.json" "$NEXT_MANIFEST"; then
  echo "❌ tracks manifest 下載失敗，保留舊版本"
  exit 1
fi
echo "  staged"

# 2. 從 manifest 解析每日分檔與機場 fallback，逐一下載（跳過已存在）
echo ""
echo "[2/4] Tracks airports..."
# [A-Z0-9]{4}：美國私人機場代碼可能數字開頭（如 65GA），別用 [A-Z] 開頭的窄 regex
AIRPORTS=$(grep -o '"[A-Z0-9]\{4\}": {' "$NEXT_MANIFEST" | sed 's/": {//' | sed 's/"//' | sort)

# manifest.dailyFiles 的 path 是相對於 tracks/ 的 `airports/{ICAO}/{YYYY-MM-DD}.jsonl`。
# flat fallback 仍照常下載，因為目前前端仍讀 {ICAO}.jsonl；日後 loader 切換後，
# daily files 才會按選擇日期命中。grep 無結果時仍正常退回舊 manifest。
DAILY_ENTRIES=$(awk '
  /"path": "airports\/[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]\/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]\.jsonl"/ {
    path=$0
    sub(/^.*"path": "/, "", path)
    sub(/".*$/, "", path)
    next
  }
  path != "" && /"bytes": [0-9]+/ {
    bytes=$0
    sub(/^.*"bytes": /, "", bytes)
    sub(/[^0-9].*$/, "", bytes)
    print path "|" bytes
    path=""
  }
' "$NEXT_MANIFEST" | sort)
DAILY_TOTAL=$(echo "$DAILY_ENTRIES" | sed '/^$/d' | wc -l | tr -d ' ')
DAILY_COUNT=0
DAILY_SKIPPED=0
DAILY_FETCHED=0
DAILY_FAILED=0
for DAILY_ENTRY in $DAILY_ENTRIES; do
  RELATIVE_PATH=${DAILY_ENTRY%%|*}
  EXPECTED_BYTES=${DAILY_ENTRY#*|}
  DAILY_COUNT=$((DAILY_COUNT + 1))
  DST="${DATA_DIR}/tracks/${RELATIVE_PATH}"
  mkdir -p "$(dirname "$DST")"
  if [ "$FORCE_AIRPORTS" = "1" ]; then
    rm -f "$DST"
  fi
  ACTUAL_BYTES=0
  if [ -s "$DST" ]; then
    ACTUAL_BYTES=$(wc -c < "$DST" | tr -d ' ')
  fi
  if [ "$ACTUAL_BYTES" = "$EXPECTED_BYTES" ]; then
    DAILY_SKIPPED=$((DAILY_SKIPPED + 1))
  else
    rm -f "$DST"
    if fetch "${S3_BASE}/tracks/${RELATIVE_PATH}" "$DST"; then
      ACTUAL_BYTES=$(wc -c < "$DST" | tr -d ' ')
      if [ "$ACTUAL_BYTES" = "$EXPECTED_BYTES" ]; then
        DAILY_FETCHED=$((DAILY_FETCHED + 1))
      else
        rm -f "$DST"
        DAILY_FAILED=$((DAILY_FAILED + 1))
        echo "  ⚠️  size mismatch: ${RELATIVE_PATH} (${ACTUAL_BYTES}/${EXPECTED_BYTES})"
      fi
    else
      DAILY_FAILED=$((DAILY_FAILED + 1))
    fi
  fi
  if [ $((DAILY_COUNT % 500)) -eq 0 ]; then
    echo "  ... daily ${DAILY_COUNT}/${DAILY_TOTAL} (fetched=${DAILY_FETCHED} skipped=${DAILY_SKIPPED} failed=${DAILY_FAILED})"
  fi
done
if [ "$DAILY_TOTAL" -gt 0 ]; then
  echo "  daily: total=${DAILY_COUNT} fetched=${DAILY_FETCHED} skipped=${DAILY_SKIPPED} failed=${DAILY_FAILED}"
fi

# ── LOD（L1 eps 50m / L2 eps 250m）──────────────────────────────
# 主 manifest 不記錄 LOD 檔（split-tracks --lod-only 刻意不動它），所以改讀
# tracks/lod-files.txt：每行 "相對路徑<TAB>bytes"，由 split-tracks 產生。
# 不能對每個 daily shard 盲試 .l1/.l2 —— 4,738 個日檔會變成 9,476 次 404。
# 缺檔不是錯誤：前端 loadAirportFlights 對 404 會自動回落全解析度。
if [ "$WITH_LOD" = "1" ]; then
  echo "[2b/4] Tracks airports LOD (L1/L2)..."
  LOD_LIST="${DATA_DIR}/tracks/lod-files.txt"
  if fetch_replace "${S3_BASE}/tracks/lod-files.txt" "$LOD_LIST"; then
    LOD_TOTAL=$(wc -l < "$LOD_LIST" | tr -d ' ')
    LOD_COUNT=0
    LOD_FETCHED=0
    LOD_SKIPPED=0
    LOD_FAILED=0
    while IFS="$(printf '\t')" read -r LOD_REL LOD_BYTES; do
      [ -z "$LOD_REL" ] && continue
      LOD_COUNT=$((LOD_COUNT + 1))
      LOD_DST="${DATA_DIR}/tracks/${LOD_REL}"
      mkdir -p "$(dirname "$LOD_DST")"
      if [ "$FORCE_AIRPORTS" = "1" ]; then
        rm -f "$LOD_DST"
      fi
      LOD_ACTUAL=0
      if [ -s "$LOD_DST" ]; then
        LOD_ACTUAL=$(wc -c < "$LOD_DST" | tr -d ' ')
      fi
      if [ "$LOD_ACTUAL" = "$LOD_BYTES" ]; then
        LOD_SKIPPED=$((LOD_SKIPPED + 1))
      else
        rm -f "$LOD_DST"
        if fetch "${S3_BASE}/tracks/${LOD_REL}" "$LOD_DST"; then
          LOD_ACTUAL=$(wc -c < "$LOD_DST" | tr -d ' ')
          if [ "$LOD_ACTUAL" = "$LOD_BYTES" ]; then
            LOD_FETCHED=$((LOD_FETCHED + 1))
          else
            rm -f "$LOD_DST"
            LOD_FAILED=$((LOD_FAILED + 1))
            echo "  ⚠️  size mismatch: ${LOD_REL} (${LOD_ACTUAL}/${LOD_BYTES})"
          fi
        else
          LOD_FAILED=$((LOD_FAILED + 1))
        fi
      fi
      if [ $((LOD_COUNT % 1000)) -eq 0 ]; then
        echo "  ... lod ${LOD_COUNT}/${LOD_TOTAL} (fetched=${LOD_FETCHED} skipped=${LOD_SKIPPED} failed=${LOD_FAILED})"
      fi
    done < "$LOD_LIST"
    echo "  lod: total=${LOD_COUNT} fetched=${LOD_FETCHED} skipped=${LOD_SKIPPED} failed=${LOD_FAILED}"
  else
    echo "  （S3 沒有 tracks/lod-files.txt，略過 LOD；前端會自動回落全解析度）"
  fi
else
  echo "[2b/4] LOD 下載已停用（--no-lod）"
fi

COUNT=0
SKIPPED=0
FETCHED=0
FAILED=0
TOTAL=$(echo "$AIRPORTS" | wc -l | tr -d ' ')
for ICAO in $AIRPORTS; do
  COUNT=$((COUNT + 1))
  DST="${DATA_DIR}/tracks/airports/${ICAO}.jsonl"
  if [ "$FORCE_AIRPORTS" = "1" ]; then
    rm -f "$DST"
  fi
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

# 新 manifest 只在所有公告的 daily shards 就緒後才取代舊版本。
if [ "$DAILY_FAILED" -eq 0 ] && [ "$FAILED" -eq 0 ]; then
  mv "$NEXT_MANIFEST" "${DATA_DIR}/tracks/manifest.json"
  echo "  ✓ tracks manifest published"
else
  rm -f "$NEXT_MANIFEST"
  echo "  ⚠️  tracks manifest 未發布（daily failed=${DAILY_FAILED}, flat failed=${FAILED}），保留舊版本"
fi

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
TOTAL_FAILED=$((FAILED + DAILY_FAILED))
if [ "$TOTAL_FAILED" -gt 0 ]; then
  echo "⚠️  ${TOTAL_FAILED} files failed — 重新跑一次即可續傳"
fi
