#!/usr/bin/env bash
# sync-s3-to-r2.sh
# 把 S3 flight-arc/{tracks,airspace} 複製到 R2 bucket flight-arc-data（Cloudflare Worker 由 /data/* 提供）。
# 取代 Zeabur 時代的 pull-from-s3.sh：每輪 `npm run s3:upload` 之後跑一次，否則正式站的 manifest 不會更新。
#
#   bash scripts/sync-s3-to-r2.sh            # 實際複製
#   bash scripts/sync-s3-to-r2.sh --dry-run  # 只列出會複製的檔案
#
# 需要 .env：S3_ACCESS_KEY、S3_SECRET_KEY、S3_REGION、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_ENDPOINT_URL
# 只做 copy（不刪 R2 端多出的檔）；用 --checksum 比對內容，同大小的 manifest 改版也會被複製。
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${S3_ACCESS_KEY:?}" "${S3_SECRET_KEY:?}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}" "${R2_ENDPOINT_URL:?}"

# rclone remote 用環境變數臨時定義，不寫設定檔
export RCLONE_CONFIG_SRC_TYPE=s3 RCLONE_CONFIG_SRC_PROVIDER=AWS
export RCLONE_CONFIG_SRC_ACCESS_KEY_ID="$S3_ACCESS_KEY" RCLONE_CONFIG_SRC_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
export RCLONE_CONFIG_SRC_REGION="${S3_REGION:-ap-southeast-2}"
export RCLONE_CONFIG_DST_TYPE=s3 RCLONE_CONFIG_DST_PROVIDER=Cloudflare
export RCLONE_CONFIG_DST_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_DST_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_DST_ENDPOINT="$R2_ENDPOINT_URL" RCLONE_CONFIG_DST_NO_CHECK_BUCKET=true

SRC_BASE="src:migu-gis-data-collector/flight-arc"
DST_BASE="dst:flight-arc-data"

for prefix in tracks airspace; do
  echo "[sync] ${prefix}/"
  rclone copy "${SRC_BASE}/${prefix}" "${DST_BASE}/${prefix}" \
    --checksum --transfers 32 --checkers 32 --stats 30s --stats-one-line "$@"
done
echo "[sync] done"
