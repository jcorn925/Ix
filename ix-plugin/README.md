# Ix Memory — Claude Code Plugin

A Claude Code plugin that makes Claude use Ix for codebase searches instead of
native `Grep`/`Glob`, and keeps the Ix graph current as Claude edits files.

## What It Does

| Trigger | Hook | Effect |
|---------|------|--------|
| Claude runs `Grep` or `Glob` | `PreToolUse` → `ix-intercept.sh` | Runs `ix text` + `ix locate` (or `ix inventory`) first and injects results into Claude's context before the native tool fires |
| Claude runs `Write`, `Edit`, or `MultiEdit` | `PostToolUse` → `ix-ingest.sh` (async) | Ingests the changed file into the Ix graph silently in the background |

Both hooks bail silently if `ix` is not in PATH or the Ix backend is unreachable.

## Why Hooks Instead of MCP

- **No user approval prompt** — hooks fire silently and automatically
- **Guaranteed execution** — every Grep/Glob gets front-run, every edit gets ingested
- **Token-efficient** — Ix returns structured, bounded results vs. raw file content

## Installation

```bash
# From the IX-Memory repo root
claude plugin install ./ix-plugin

# Or for a single project only
claude plugin install ./ix-plugin --scope project
```

## Requirements

- `ix` CLI in PATH and Ix backend running (`ix status` should return ok)
- `jq` in PATH (used to parse hook JSON input)

## Structure

```
ix-plugin/
  .claude-plugin/
    plugin.json          # manifest
  hooks/
    hooks.json           # hook event registration
    ix-intercept.sh      # PreToolUse: Grep|Glob → ix text/locate/inventory
    ix-ingest.sh         # PostToolUse: Write|Edit|MultiEdit → ix ingest
  README.md
```

## How the Intercept Hook Works

When Claude runs `Grep "verify_token"`:

1. `ix-intercept.sh` fires with the tool input as JSON on stdin
2. Script runs `ix text "verify_token" --limit 20 --format json`
3. Script also runs `ix locate "verify_token" --limit 10 --format json`
4. Results are returned as `additionalContext` — injected into Claude's next context window
5. Claude sees the Ix results and typically uses them instead of waiting for Grep output

For `Glob`, the script runs `ix inventory` (optionally filtered by path) instead.

## How the Ingest Hook Works

When Claude edits a file:

1. `ix-ingest.sh` fires asynchronously after the edit succeeds
2. Reads `tool_input.file_path` from stdin
3. Runs `ix ingest <file_path>` silently
4. Returns a short `additionalContext` confirmation: `[ix] Graph updated — ingested: <path>`

## Uninstall

```bash
claude plugin uninstall ix-memory
```
