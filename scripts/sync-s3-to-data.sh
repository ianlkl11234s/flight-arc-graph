#!/bin/sh
# 從 S3 同步航班資料到 /data（Zeabur volume）
# 用法：在 Zeabur 終端機執行 sh /app/scripts/sync-s3-to-data.sh
#
# 需要 wget（alpine 內建）或 curl
# 不需要 AWS credentials — S3 bucket 已開放 public read

S3_BASE="https://migu-gis-data-collector.s3.ap-southeast-2.amazonaws.com/flight-arc"
DATA_DIR="/data"

echo "=== S3 → /data sync ==="

# 確保目錄存在
mkdir -p "$DATA_DIR/tracks" "$DATA_DIR/airspace"

# 下載 manifest
for source in tracks airspace; do
  echo ""
  echo "--- $source ---"

  manifest_url="$S3_BASE/$source/manifest.json"
  manifest_file="$DATA_DIR/$source/manifest.json"

  echo "Fetching manifest: $manifest_url"
  wget -q -O "$manifest_file" "$manifest_url" 2>/dev/null || \
    curl -sf -o "$manifest_file" "$manifest_url" 2>/dev/null

  if [ ! -f "$manifest_file" ] || [ ! -s "$manifest_file" ]; then
    echo "  ⚠️  No manifest for $source, skipping"
    continue
  fi

  echo "  ✓ manifest.json downloaded"

  # 下載 latest.json（完整合併檔）
  latest_url="$S3_BASE/$source/latest.json"
  latest_file="$DATA_DIR/$source/latest.json"

  echo "Fetching latest.json..."
  wget -q -O "$latest_file" "$latest_url" 2>/dev/null || \
    curl -sf -o "$latest_file" "$latest_url" 2>/dev/null

  if [ -f "$latest_file" ] && [ -s "$latest_file" ]; then
    size=$(du -h "$latest_file" | cut -f1)
    echo "  ✓ latest.json ($size)"
  else
    echo "  ⚠️  latest.json download failed"
  fi

  # 也下載按天拆分的資料（供增量更新用）
  # 用 manifest 中的日期列表（簡單 parse JSON）
  dates=$(grep -o '"date":"[0-9-]*"' "$manifest_file" | sed 's/"date":"//;s/"//')

  for date in $dates; do
    y=$(echo "$date" | cut -d- -f1)
    m=$(echo "$date" | cut -d- -f2)
    d=$(echo "$date" | cut -d- -f3)

    dir="$DATA_DIR/$source/$y/$m/$d"
    file="$dir/data.json"

    # 若已存在且非空就跳過
    if [ -f "$file" ] && [ -s "$file" ]; then
      echo "  [$date] already exists, skip"
      continue
    fi

    mkdir -p "$dir"
    url="$S3_BASE/$source/$y/$m/$d/data.json"
    wget -q -O "$file" "$url" 2>/dev/null || \
      curl -sf -o "$file" "$url" 2>/dev/null

    if [ -f "$file" ] && [ -s "$file" ]; then
      size=$(du -h "$file" | cut -f1)
      echo "  [$date] ✓ ($size)"
    else
      echo "  [$date] ⚠️ failed"
      rm -f "$file"
    fi
  done
done

echo ""
echo "=== Sync complete ==="
echo "Data directory:"
du -sh "$DATA_DIR"/* 2>/dev/null
