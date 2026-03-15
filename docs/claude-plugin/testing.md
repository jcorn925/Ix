# Testing and Debugging an MCP Server

## Run Claude Code in Debug Mode

```bash
claude --debug
```

This prints MCP initialization messages, tool discovery, and every JSON-RPC
message exchanged. Most issues are visible here.

## Inspect Configured Servers

Inside Claude Code:
```
/mcp
```

Shows all configured servers with:
- Connection status (running / error)
- Declared capabilities (tools, resources, prompts)
- List of available tools with descriptions

CLI commands:
```bash
claude mcp list              # All configured servers
claude mcp get my-server     # Details for one server
```

## Test stdio Transport Directly

Send a raw JSON-RPC message to your server via stdin:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}' \
  | node dist/server.js
```

Then follow with `initialized`:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' \
  | node dist/server.js
```

## Common Issues and Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "Connection closed" immediately | Server process crashes on start | Check stderr output; verify all imports resolve |
| Tool not appearing in `/mcp` | `tools` not declared in capabilities | Add `tools: {}` to `capabilities` in `initialize` response |
| Tool appears but call fails | Input schema mismatch | Log the raw `arguments` object to stderr and compare |
| Authentication fails | Bad OAuth config | Verify `--client-id`, `--callback-port`, and auth server URL |
| Timeout on tool call | Server too slow to respond | Increase `MCP_TIMEOUT` or add progress notifications |
| "Unknown tool" error | Tool name typo or case mismatch | Tool names are case-sensitive; verify exact match |
| Output to stdout corrupts stream | Debug `console.log` in server code | Change all debug output to `console.error` |

## Logging

Always write debug output to **stderr** — stdout is the JSON-RPC channel:

```typescript
// TypeScript
console.error("[debug] received request:", JSON.stringify(request.params));

// Python
import sys
print("[debug] received request:", args, file=sys.stderr)
```

## Testing Tool Calls in Claude Code

Once your server is registered, ask Claude directly:

```
Call the add tool with a=5 and b=3
```

Claude Code will show the approval prompt, then invoke the tool, and display
the result. Watch `--debug` output for the full round-trip.

## Reload After Changes

After rebuilding your server:
```bash
npm run build            # rebuild
/mcp                     # inside Claude Code — reconnects servers
```

Or remove and re-add the server:
```bash
claude mcp remove my-server
claude mcp add --transport stdio my-server -- node dist/server.js
```

## MCP Timeout Environment Variable

```bash
MCP_TIMEOUT=30000 claude   # 30-second timeout per tool call
```

Useful when debugging slow operations — prevents premature timeouts while
you're stepping through code.
