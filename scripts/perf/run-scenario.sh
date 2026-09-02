#!/bin/sh
# 用法: sh run-scenario.sh <tag> [seconds]   — 假設場景已設定好；做 暫停 trace → 播放 trace → 暫停 → 截圖
# 輸出全部寫進 out/（.gitignore 排除，不進 git）
SP="$(cd "$(dirname "$0")" && pwd)"; cd "$SP" || exit 1
mkdir -p out
TAG="$1"; SECS="${2:-8}"
node scenario.mjs pause > "out/trace-$TAG-paused.setup.json" && node scenario.mjs mouse-away > /dev/null && sleep 2
node cdp-trace.mjs --seconds "$SECS" --out "out/trace-$TAG-paused.json" --label "$TAG paused" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d[k] for k in ['label','fps','drawFrames','mainThread','fireAnimationFrame','longTasks','gpu','dataLossOccurred','sys']}))"
node scenario.mjs play > "out/trace-$TAG-playing.setup.json" && node scenario.mjs mouse-away > /dev/null && sleep 2
node cdp-trace.mjs --seconds "$SECS" --out "out/trace-$TAG-playing.json" --label "$TAG playing" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d[k] for k in ['label','fps','drawFrames','mainThread','fireAnimationFrame','longTasks','gpu','dataLossOccurred','sys']}))"
node scenario.mjs pause > "out/trace-$TAG-after.json"
node cdp-shot.mjs "out/shot-$TAG.png" > /dev/null
echo "stats: $(cat out/trace-$TAG-after.json)"
