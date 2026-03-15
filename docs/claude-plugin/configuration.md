# Configuration — Registering a Plugin with Claude Code

## Method 1: CLI Commands (Recommended for Development)

```bash
# Stdio server (local process)
claude mcp add --transport stdio my-server -- node /path/to/server.js

# HTTP server (remote)
claude mcp add --transport http my-api https://api.example.com/mcp

# With environment variables
claude mcp add --transport stdio db-server --env DB_URL=postgres://... -- python server.py

# With authentication headers
claude mcp add --transport http secure-api --header "Authorization: Bearer token" https://api.example.com/mcp
```

## Method 2: .mcp.json (Recommended for Distribution)

Place `.mcp.json` in your project root. This is checked into version control so
all contributors get the plugin automatically.

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "${API_KEY}",
        "DEBUG": "true"
      }
    },
    "remote-api": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${MCP_TOKEN}"
      }
    }
  }
}
```

## Scopes

| Scope | Location | Who Sees It |
|-------|----------|-------------|
| `local` | `~/.claude.json` | Only you, not committed |
| `project` | `.mcp.json` in project root | All contributors via git |
| `user` | User-level config | You, across all projects |

```bash
claude mcp add --scope local my-server -- node server.js     # local only
claude mcp add --scope project my-server -- node server.js   # project-wide
claude mcp add --scope user my-server -- node server.js      # all projects
```

## Environment Variable Expansion

Supported inside `.mcp.json`:

```json
{
  "mcpServers": {
    "db": {
      "command": "${PYTHON_PATH:-python}",
      "args": ["server.py"],
      "env": {
        "DB_URL": "${DATABASE_URL}",
        "LOG_LEVEL": "${LOG_LEVEL:-info}"
      }
    }
  }
}
```

- `${VAR}` — expands to environment variable
- `${VAR:-default}` — fallback if not set
- `${CLAUDE_PLUGIN_ROOT}` — directory of the plugin itself

## OAuth Configuration

For servers requiring OAuth 2.0 authentication:

```bash
# Add the server
claude mcp add --transport http myauth https://api.example.com/mcp

# In Claude Code, trigger authentication
/mcp
# Follow the browser login flow
```

Pre-configured client credentials:
```bash
claude mcp add --transport http \
  --client-id your-client-id \
  --client-secret \
  --callback-port 8080 \
  my-server https://api.example.com/mcp
```

In `.mcp.json`:
```json
{
  "mcpServers": {
    "my-server": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "oauth": {
        "clientId": "your-client-id",
        "callbackPort": 8080,
        "authServerMetadataUrl": "https://auth.example.com/.well-known/openid-configuration"
      }
    }
  }
}
```

Credentials are stored in the system keychain — never in config files.

## Managing Servers

```bash
claude mcp list                  # List all configured servers
claude mcp get my-server         # Show details for one server
claude mcp remove my-server      # Remove a server
```

Inside Claude Code:
```
/mcp   # View all servers, status, capabilities, and authentication
```
