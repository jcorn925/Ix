# Claude Code Plugin — Developer Guide

A Claude Code plugin can use **hooks**, **MCP servers**, or both depending on
what behavior you need. Read [hooks-vs-mcp.md](./hooks-vs-mcp.md) first if you
are unsure which to use.

The Ix Memory plugin (`ix-plugin/`) uses hooks only — see
[ix-plugin-reference.md](./ix-plugin-reference.md) for the concrete implementation.

## Contents

### Decision Guide
| File | Description |
|------|-------------|
| [hooks-vs-mcp.md](./hooks-vs-mcp.md) | When to use hooks vs MCP — the front-run pattern, blocking, additionalContext |

### Ix Plugin (Hooks-Based)
| File | Description |
|------|-------------|
| [ix-plugin-reference.md](./ix-plugin-reference.md) | The actual Ix Memory plugin — structure, hooks, scripts |

### MCP Server Reference
| File | Description |
|------|-------------|
| [overview.md](./overview.md) | What MCP is, how Claude Code loads MCP servers, core concepts |
| [capabilities.md](./capabilities.md) | Tools, Resources, and Prompts — definitions and schemas |
| [configuration.md](./configuration.md) | Registering and configuring an MCP server with Claude Code |
| [error-handling.md](./error-handling.md) | Protocol errors vs. execution errors, best practices |
| [security.md](./security.md) | Permissions model, OAuth, user consent requirements |
| [testing.md](./testing.md) | How to test and debug an MCP server |
| [example-typescript.md](./example-typescript.md) | Minimal working TypeScript MCP server |
| [example-python.md](./example-python.md) | Minimal working Python MCP server |

## Quick Decision

**Want automatic behavior with no user approval?** → Use hooks.
- File change tracking → `PostToolUse` on `Write|Edit`
- Front-run native searches → `PreToolUse` on `Grep|Glob`

**Want Claude to call a function on demand?** → Use MCP tools.
- Requires user approval per call
- Claude decides when to invoke based on context

## Key Facts (MCP)

- Protocol: **JSON-RPC 2.0** over stdio, HTTP, or SSE
- Official SDKs: **TypeScript** (`@modelcontextprotocol/sdk`) and **Python** (`mcp`)
- Three capability types: **Tools** (LLM-invoked), **Resources** (data context), **Prompts** (user commands)
- Schema format: **JSON Schema Draft 2020-12**
- All tool invocations require **explicit user approval**
