# Ix Memory Plugin — Reference

The Ix plugin lives at `ix-plugin/` in the repo root. It is a hooks-only Claude
Code plugin — no MCP server required.

## What It Does

| Hook | Event | Trigger | Effect |
|------|-------|---------|--------|
| `ix-intercept.sh` | `PreToolUse` | `Grep` or `Glob` | Runs `ix text` + `ix locate` (or `ix inventory`) and injects results as `additionalContext` before the native tool fires |
| `ix-ingest.sh` | `PostToolUse` (async) | `Write`, `Edit`, `MultiEdit` | Ingests the modified file into the Ix graph silently in the background |

Both hooks bail silently if `ix` is not in PATH or the backend is unreachable.
The ingest hook is `async: true` — it never blocks Claude's response.

## Directory Structure

```
ix-plugin/
  .claude-plugin/
    plugin.json          # plugin manifest
  hooks/
    hooks.json           # event → script registration
    ix-intercept.sh      # PreToolUse handler
    ix-ingest.sh         # PostToolUse handler
  README.md
```

## plugin.json

```json
{
  "name": "ix-memory",
  "version": "1.0.0",
  "description": "...",
  "author": { "name": "Ix Memory" },
  "hooks": "./hooks/hooks.json"
}
```

The manifest lives in `.claude-plugin/plugin.json`. Only `plugin.json` belongs
in that directory — scripts and other files go at the plugin root.

## hooks.json

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Grep|Glob",
        "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/ix-intercept.sh", "timeout": 10 }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/ix-ingest.sh", "timeout": 30, "async": true }]
      }
    ]
  }
}
```

`${CLAUDE_PLUGIN_ROOT}` is resolved by Claude Code to the absolute path of the
installed plugin directory. Always use it for script paths — never hardcode.

## How ix-intercept.sh Works

1. Reads the hook JSON payload from **stdin**
2. Extracts `tool_name` (Grep or Glob) and `tool_input.pattern`
3. For **Grep**: runs `ix text <pattern> --limit 20 --format json` and `ix locate <pattern> --limit 10 --format json`, passing through any `--path` or `--language` filters from the original tool call
4. For **Glob**: runs `ix inventory --format json` (with `--path` filter if present)
5. Formats results and writes `{"additionalContext": "..."}` to **stdout**
6. Exits 0 — native tool still runs

Claude Code injects `additionalContext` into Claude's context window. Claude
sees the Ix results first and often uses them instead of the raw Grep/Glob output.

### Hook Input Shape (Grep example)

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Grep",
  "tool_input": {
    "pattern": "verify_token",
    "path": "/home/user/project/src",
    "type": "scala"
  },
  "cwd": "/home/user/project"
}
```

### Hook Output Shape

```json
{
  "additionalContext": "[ix] Pre-search results for pattern: 'verify_token'\n\n--- ix text ---\n{...}\n\n--- ix locate ---\n{...}"
}
```

## How ix-ingest.sh Works

1. Reads the hook JSON payload from **stdin**
2. Extracts `tool_input.file_path`
3. Runs `ix ingest <file_path>` (suppresses output)
4. Returns a short `additionalContext` confirmation
5. Exits 0

Because the hook is `async: true`, it runs in the background and Claude's
response is never delayed waiting for ingestion to complete.

### Hook Input Shape (Edit example)

```json
{
  "hook_event_name": "PostToolUse",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/home/user/project/src/auth/AuthService.scala",
    "old_str": "...",
    "new_str": "..."
  }
}
```

## Installation

```bash
# From the IX-Memory repo root
claude plugin install ./ix-plugin

# Project-scoped (recommended for team use)
claude plugin install ./ix-plugin --scope project

# Verify
claude mcp list   # or /mcp inside Claude Code
```

## Requirements

- `ix` CLI available in PATH
- Ix backend running (`ix status` returns ok)
- `jq` available in PATH

## Uninstall

```bash
claude plugin uninstall ix-memory
```
