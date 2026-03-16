# Error Handling

MCP has two distinct error categories. Using the right one matters — they serve
different purposes.

## Protocol Errors (Invalid Requests)

Use JSON-RPC errors for malformed requests, unknown methods, or server crashes.
The LLM cannot self-correct from these.

Standard JSON-RPC error codes:

| Code | Meaning | When to Use |
|------|---------|-------------|
| `-32602` | Invalid params | Unknown tool name, malformed input |
| `-32603` | Internal error | Unexpected server crash |
| `-32002` | Resource not found | Missing resource URI |

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Unknown tool: invalid_tool_name"
  }
}
```

## Tool Execution Errors (Actionable Feedback)

When a tool runs but fails in a way the LLM can learn from (bad input values,
business logic violations), return the error **inside the result** with `isError: true`.
Claude Code shows this to the LLM and it can retry.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: User ID must be numeric. Got: 'abc'. Try again with an integer ID."
      }
    ],
    "isError": true
  }
}
```

## Decision Rule

```
Is the request malformed / un-parseable?
  → JSON-RPC error (code field)

Did the tool run but produce a failure the LLM should know about?
  → Result with isError: true
```

## Best Practices

1. **Validate inputs before processing** — check schema constraints before doing any work
2. **Include context in errors** — name the bad field and the expected type/format
3. **Distinguish actionable from fatal** — only use `isError: true` when the LLM can fix it
4. **Log to stderr, not stdout** — stdout is reserved for JSON-RPC messages
5. **Set timeouts** — use `MCP_TIMEOUT` env var or implement per-operation deadlines
6. **Rate limit** — implement backpressure for expensive tools

## Timeout Configuration

```bash
MCP_TIMEOUT=10000 claude   # 10 second timeout per tool call
```

## Logging

Write all debug output to **stderr**. stdout must contain only valid JSON-RPC:

```typescript
// Correct
console.error("Debug: processing request", requestId);

// Wrong — pollutes the JSON-RPC stream
console.log("Debug: processing request", requestId);
```
