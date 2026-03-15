# Security — Permissions, Consent, and Authentication

## User Consent Model

### Tools — Always Require Confirmation

Before Claude Code invokes any tool, it shows the user:
- Which tool is being called
- The input parameters
- An approve/deny prompt

There is no way to bypass this. Every tool call goes through user approval.

### Resources — Application-Controlled

Claude Code decides when to include resources. This may be automatic or require
user selection, depending on the client implementation.

### Prompts — User-Initiated

Prompts are triggered explicitly by the user (like a slash command). No additional
approval is required beyond the user having invoked the prompt.

## Data Privacy Rules

1. Servers receive only the context necessary for the current tool call
2. Servers do not have access to the full conversation history
3. User data is only shared with explicit user consent

## Tool Implementation Security

Always validate inputs before trusting them:

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Validate required fields
  if (typeof args.user_id !== "string" || args.user_id.trim() === "") {
    return {
      content: [{ type: "text", text: "Error: user_id must be a non-empty string" }],
      isError: true,
    };
  }

  // Sanitize before using in any query
  const userId = args.user_id.trim();
  // ... proceed
});
```

Security checklist for tools:
- [ ] Validate all input types and ranges
- [ ] Sanitize strings before use in queries, shell commands, or file paths
- [ ] Implement access controls — not every caller should invoke every tool
- [ ] Rate-limit expensive operations
- [ ] Never expose secrets in tool results

## Claude Code Permission System

Configure which MCP tools are auto-approved or denied in `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "MCP(my-server:read_file)",
      "MCP(database:query)"
    ],
    "deny": [
      "MCP(untrusted-server:*)"
    ]
  }
}
```

The `*` wildcard matches all tools on a server.

## OAuth & Credentials

When using HTTP servers with OAuth:
- Credentials are stored in the **system keychain**, never in config files
- Tokens are refreshed automatically
- Use `${TOKEN}` environment variable expansion in `.mcp.json` rather than hardcoding

Never put secrets directly in `.mcp.json`:
```json
// Wrong
{ "headers": { "Authorization": "Bearer sk-live-abc123" } }

// Correct
{ "headers": { "Authorization": "Bearer ${MY_API_TOKEN}" } }
```

## LLM Sampling (If Your Server Requests It)

If your server uses the `sampling` capability (asks Claude to generate text):
- The user must explicitly approve the sampling request
- The user controls what prompt is sent to the LLM
- The user controls what the server sees in the response
