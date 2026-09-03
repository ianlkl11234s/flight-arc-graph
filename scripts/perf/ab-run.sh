#!/bin/sh
# 用法: sh ab-run.sh <tag> <s1|s2>  — reload → 設場景 → 釘死相機/時刻 → 跑 run-scenario.sh
# 目的：A/B 兩次量測的相機、時刻、heap 起點一致，否則數字不可比。
SP="$(cd "$(dirname "$0")" && pwd)"; cd "$SP" || exit 1
TAG="$1"; SCENE="$2"
node scenario.mjs reload > /dev/null 2>&1
node scenario.mjs "$SCENE" > /dev/null 2>&1
if [ "$SCENE" = "s1" ]; then
  CAM='{"center":[121.2281,25.0927],"zoom":10.4,"pitch":57,"bearing":16}'
else
  CAM='{"center":[127.156,29.3288],"zoom":4.72,"pitch":35,"bearing":0}'
fi
node cdp-eval.mjs "(()=>{const d=window.__flightArcDebug; d.map.jumpTo($CAM); d.timeline.pause(); d.timeline.seek(1771380000); return 1})()" > /dev/null
sleep 3
node cdp-eval.mjs "(()=>{const d=window.__flightArcDebug;const r=d.scene.renderer.info.render;return {lines:r.lines,calls:r.calls,heapMB:+(performance.memory.usedJSHeapSize/1048576).toFixed(0),zoom:+d.map.getZoom().toFixed(2),orbs:d.scene.activeOrbCount}})()"
sh run-scenario.sh "$TAG" 8
