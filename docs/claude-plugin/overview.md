# Overview — What Is an MCP Server / Claude Plugin

## What Is MCP?

**MCP (Model Context Protocol)** is an open standard protocol that enables integration
between LLM applications (like Claude Code) and external tools, data sources, and services.

A **Claude plugin** is an MCP server: a program you write that exposes capabilities to
Claude Code through this standardized protocol.

## Architecture

Three roles in every MCP interaction:

| Role | What It Is |
|------|-----------|
| **Host** | Claude Code — initiates connections to servers |
| **Client** | The connection manager running inside Claude Code |
| **Server** | Your MCP server — exposes tools, resources, prompts |

## What Can a Plugin Do?

Three capability types:

| Type | Who Controls It | What It Does |
|------|----------------|-------------|
| **Tools** | LLM (model-controlled) | Functions the LLM can invoke based on task context |
| **Resources** | Application (app-controlled) | Context/data provided to the LLM (files, schemas, docs) |
| **Prompts** | User (user-controlled) | Templated messages invoked by user commands |

## How Claude Code Loads a Plugin

1. You register the server: `claude mcp add --transport stdio my-server -- node server.js`
2. Claude Code starts (or connects to) the server process
3. **Capability negotiation**: both sides declare what features they support
4. Claude Code discovers tools, resources, and prompts via `tools/list`, `resources/list`, `prompts/list`
5. During a session, Claude Code routes tool calls to your server and returns results to the LLM

## Transport Types

| Transport | Use Case | How Claude Connects |
|-----------|----------|---------------------|
| **stdio** | Local process on user's machine | Spawns process, communicates via stdin/stdout |
| **HTTP** (Streamable HTTP) | Remote cloud services | HTTP POST with streaming response |
| **SSE** (Server-Sent Events) | Remote services with events | HTTP with event stream (legacy, prefer HTTP) |

For local plugins, **stdio is the standard choice**. The server reads JSON-RPC messages
from stdin and writes responses to stdout. Log debug output to stderr.

## Protocol Foundation

- All messages are **JSON-RPC 2.0**
- Each session is **stateful** — one connection, one session
- The server declares its capabilities during the `initialize` handshake
- Servers can send `list_changed` notifications when their capabilities change dynamically

## Initialization Handshake

Claude Code sends:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": { "sampling": {} },
    "clientInfo": { "name": "claude-code", "version": "1.0.0" }
  }
}
```

Your server responds with:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": { "subscribe": true, "listChanged": true },
      "prompts": { "listChanged": true }
    },
    "serverInfo": { "name": "my-mcp-server", "version": "1.0.0" }
  }
}
```

Then Claude Code sends `initialized` to confirm, and the session is live.
