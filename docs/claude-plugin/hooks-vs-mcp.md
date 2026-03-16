# Hooks vs MCP — Choosing the Right Mechanism

## Summary

| Need | Use |
|------|-----|
| Guarantee execution on every tool call | **Hooks** |
| Automatic file change tracking | **Hooks** (PostToolUse on Write/Edit) |
| Front-run native searches with better data | **Hooks** (PreToolUse on Grep/Glob) |
| Give Claude an on-demand callable function | **MCP tool** |
| Expose file/data context to Claude | **MCP resource** |
| Add a user-invocable slash command | **MCP prompt** or **skill** |

## Hooks

Hooks are shell commands registered in `hooks.json` that fire automatically on
Claude Code events. They require **no user approval** and cannot be skipped.

### Key Events

| Event | When | Can Block Claude? |
|-------|------|-------------------|
| `PreToolUse` | Before any tool runs | Yes (exit 2 + stderr) |
| `PostToolUse` | After any tool succeeds | No |
| `SessionStart` | Session begins | No |
| `Stop` | Claude finishes a response | Yes |

### Injecting Into Claude's Context

A hook script can write JSON to stdout:

```json
{"additionalContext": "text that gets added to Claude's context window"}
```

Claude sees this on the next turn. Use it to give Claude pre-fetched data so
it doesn't need to run additional tool calls.

### Blocking a Tool Call

Return exit code 2 and write to stderr — Claude reads the stderr message and
can self-correct:

```bash
echo "Don't use Grep for this — run: ix text '$PATTERN'" >&2
exit 2
```

### The Front-Run Pattern

The most powerful pattern for search optimization:

1. Claude decides to run `Grep "foo"`
2. `PreToolUse` hook intercepts, runs `ix text "foo"` silently
3. Hook returns `additionalContext` with the Ix results
4. Claude sees the Ix results already — often skips or shortens the Grep
5. Grep still runs (not blocked), but Claude may not need it

This is how `ix-intercept.sh` works in the Ix plugin.

## MCP

MCP servers expose **tools**, **resources**, and **prompts** to Claude. Unlike hooks:

- Tool calls require explicit **user approval** every time
- Claude decides when to call them based on context
- They can be called from any point in the conversation on demand

### When MCP Makes Sense

Use MCP when you want Claude to be able to **ask for something** interactively —
for example, querying a database, calling an API, or fetching a document — and
the user should see and approve each call.

For the Ix use case (`ix search`, `ix impact`, `ix overview`, etc.), MCP is
useful for on-demand investigative commands that Claude calls mid-reasoning.
The CLAUDE.md routing rules in this project already push Claude toward these.

## The Ix Plugin Uses Both (Implicitly)

The Ix plugin uses only hooks because the goal is **automatic, silent, guaranteed**
behavior:

- **Auto-ingest**: PostToolUse hook → no user interaction needed
- **Search intercept**: PreToolUse hook → runs before Claude even sees the result

The `ix` CLI commands Claude calls manually (via CLAUDE.md instructions) are not
MCP tools — they are called via the native `Bash` tool, which requires normal
user approval just like any shell command.
