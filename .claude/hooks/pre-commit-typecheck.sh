#!/usr/bin/env bash
# Pre-commit typecheck — 在 git commit 前強制跑 npm run typecheck（tsc -b，與 CI 一致）
# 慣例同 ~/.claude/hooks/pre-push-check.sh：通過或不相關 exit 0，擋下 exit 2

set -euo pipefail

# 從 stdin 讀 hook JSON，取 .tool_input.command
INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""

# 只攔截包含 "git commit" 的指令（過度攔截可接受、漏攔不行）
if [[ "$COMMAND" != *"git commit"* ]]; then
  exit 0
fi

# 排除 --help
if [[ "$COMMAND" == *"--help"* ]]; then
  exit 0
fi

# 在專案根目錄跑 typecheck
ROOT="${CLAUDE_PROJECT_DIR:-}"
if [[ -z "$ROOT" ]]; then
  ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
fi
cd "$ROOT" || exit 0

if TSC_OUTPUT=$(npm run typecheck 2>&1); then
  echo "pre-commit typecheck passed (tsc -b)"
  exit 0
else
  {
    echo "❌ typecheck 失敗，commit 已擋下（npm run typecheck / tsc -b）"
    echo "--- tsc 輸出摘要（最後 30 行）---"
    echo "$TSC_OUTPUT" | tail -n 30
    echo "修好上面的錯誤再 commit。"
  } >&2
  exit 2
fi
