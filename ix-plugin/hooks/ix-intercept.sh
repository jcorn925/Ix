#!/usr/bin/env bash
# ix-intercept.sh — PreToolUse hook for Grep and Glob
#
# Fires before Grep/Glob executes. Runs the ix equivalent silently and injects
# the result as additionalContext so Claude already has a graph-aware, token-
# efficient answer before the native tool runs.
#
# Exit 0 + JSON stdout → injects additionalContext, native tool still runs
# Exit 0 + no stdout  → no-op, native tool runs normally

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
[ -z "$TOOL" ] && exit 0

# Bail silently if ix is not in PATH
command -v ix >/dev/null 2>&1 || exit 0

# Bail silently if ix backend is not reachable
ix status >/dev/null 2>&1 || exit 0

# ── Grep: text/symbol search ─────────────────────────────────────────────────
if [ "$TOOL" = "Grep" ]; then
  PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty')
  [ -z "$PATTERN" ] && exit 0

  # Run ix text search (line-level matches, respects --language and --path)
  PATH_ARG=$(echo "$INPUT" | jq -r '.tool_input.path // empty')
  LANG_ARG=$(echo "$INPUT" | jq -r '.tool_input.type // empty')

  TEXT_ARGS=("$PATTERN" "--limit" "20" "--format" "json")
  [ -n "$PATH_ARG" ] && TEXT_ARGS+=("--path" "$PATH_ARG")
  [ -n "$LANG_ARG" ] && TEXT_ARGS+=("--language" "$LANG_ARG")

  TEXT_RESULT=$(ix text "${TEXT_ARGS[@]}" 2>/dev/null) || TEXT_RESULT=""

  # Also run ix locate for symbol-level matches (class, function, etc.)
  LOCATE_RESULT=$(ix locate "$PATTERN" --limit 10 --format json 2>/dev/null) || LOCATE_RESULT=""

  [ -z "$TEXT_RESULT" ] && [ -z "$LOCATE_RESULT" ] && exit 0

  CONTEXT="[ix] Pre-search results for pattern: '${PATTERN}'"
  [ -n "$TEXT_RESULT" ]   && CONTEXT="${CONTEXT}\n\n--- ix text ---\n${TEXT_RESULT}"
  [ -n "$LOCATE_RESULT" ] && CONTEXT="${CONTEXT}\n\n--- ix locate ---\n${LOCATE_RESULT}"

# ── Glob: file pattern search ─────────────────────────────────────────────────
elif [ "$TOOL" = "Glob" ]; then
  PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty')
  [ -z "$PATTERN" ] && exit 0

  PATH_ARG=$(echo "$INPUT" | jq -r '.tool_input.path // empty')

  INV_ARGS=("--format" "json")
  [ -n "$PATH_ARG" ] && INV_ARGS+=("--path" "$PATH_ARG")

  INV_RESULT=$(ix inventory "${INV_ARGS[@]}" 2>/dev/null) || INV_RESULT=""

  [ -z "$INV_RESULT" ] && exit 0

  CONTEXT="[ix] Pre-search inventory for glob: '${PATTERN}'"
  [ -n "$PATH_ARG" ] && CONTEXT="${CONTEXT} (path: ${PATH_ARG})"
  CONTEXT="${CONTEXT}\n\n--- ix inventory ---\n${INV_RESULT}"

else
  exit 0
fi

[ -z "$CONTEXT" ] && exit 0

jq -n --arg ctx "$CONTEXT" '{"additionalContext": $ctx}'
exit 0
