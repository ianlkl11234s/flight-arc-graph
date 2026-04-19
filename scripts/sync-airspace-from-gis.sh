#!/usr/bin/env bash
# 從 taipei-gis-analytics 同步空域 GeoJSON 到 plan-art/public/airspace/
#
# 用法：
#   bash scripts/sync-airspace-from-gis.sh           # 同步所有
#   bash scripts/sync-airspace-from-gis.sh tw gb     # 只同步指定（小寫前綴）
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GIS_DIR="$(cd "$SCRIPT_DIR/../../taipei-gis-analytics" && pwd)"
SRC_DIR="$GIS_DIR/data/processed/aviation/airspace"
DST_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/public/airspace"

if [ ! -d "$SRC_DIR" ]; then
  echo "找不到 $SRC_DIR" >&2
  exit 1
fi
mkdir -p "$DST_DIR"

# 對應表（POSIX-friendly：source|target|prefix）
MAPPINGS="
taiwan_airspace_3d.geojson|taiwan_airspace.geojson|tw
gb_airspace_3d.geojson|gb_airspace.geojson|gb
cn_airspace_3d.geojson|cn_airspace.geojson|cn
jp_airspace_3d.geojson|jp_airspace.geojson|jp
"

# 把參數轉小寫成空白分隔字串（前後加空白方便 substring 比對）
FILTER=""
if [ $# -gt 0 ]; then
  FILTER=" $(printf '%s\n' "$@" | tr '[:upper:]' '[:lower:]' | tr '\n' ' ')"
fi

copied=0
echo "$MAPPINGS" | while IFS='|' read -r src_name dst_name prefix; do
  [ -z "$src_name" ] && continue
  if [ -n "$FILTER" ]; then
    case "$FILTER" in
      *" $prefix "*) ;;
      *) continue ;;
    esac
  fi
  src="$SRC_DIR/$src_name"
  if [ -f "$src" ]; then
    cp "$src" "$DST_DIR/$dst_name"
    size=$(du -h "$DST_DIR/$dst_name" | awk '{print $1}')
    echo "OK $src_name -> $dst_name ($size)"
  else
    [ -n "$FILTER" ] && echo "skip $src_name (檔案不存在)"
  fi
done

echo "完成"
