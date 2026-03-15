# Example — Minimal Python MCP Server

## 1. Setup

```bash
pip install mcp
# Optional: use a virtual environment
python -m venv venv && source venv/bin/activate
pip install mcp
```

## 2. Server Code

Create `server.py`:

```python
import asyncio
import sys
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

# Create the server instance
app = Server("my-mcp-server")


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="add",
            description="Add two numbers together",
            inputSchema={
                "type": "object",
                "properties": {
                    "a": {"type": "number", "description": "First number"},
                    "b": {"type": "number", "description": "Second number"},
                },
                "required": ["a", "b"],
            },
        ),
        Tool(
            name="greet",
            description="Generate a greeting for a person",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Person's name"},
                },
                "required": ["name"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    print(f"[debug] tool called: {name} {arguments}", file=sys.stderr)

    if name == "add":
        a = arguments.get("a")
        b = arguments.get("b")

        if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
            return [TextContent(type="text", text="Error: a and b must be numbers")]

        return [TextContent(type="text", text=f"{a} + {b} = {a + b}")]

    if name == "greet":
        person_name = arguments.get("name", "")

        if not isinstance(person_name, str) or not person_name.strip():
            return [TextContent(type="text", text="Error: name must be a non-empty string")]

        return [TextContent(type="text", text=f"Hello, {person_name.strip()}! Welcome to MCP.")]

    # Unknown tool — raise so MCP SDK returns a protocol error
    raise ValueError(f"Unknown tool: {name}")


async def main():
    print("[info] MCP server starting on stdio", file=sys.stderr)
    async with stdio_server(app) as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
```

## 3. Register with Claude Code

```bash
# Stdio transport (local process)
claude mcp add --transport stdio py-server -- python /absolute/path/to/server.py

# If using a virtualenv
claude mcp add --transport stdio py-server -- /path/to/venv/bin/python /path/to/server.py
```

Or in `.mcp.json`:
```json
{
  "mcpServers": {
    "py-server": {
      "command": "python",
      "args": ["./server.py"]
    }
  }
}
```

## 4. Test It

```bash
# Verify the server is connected
# Inside Claude Code:
/mcp

# Ask Claude to use it:
# "Use the add tool to calculate 10 + 7"
# "Use the greet tool for Bob"
```

## 5. Adding Resources

```python
from mcp.types import Resource, TextContent, ReadResourceResult

@app.list_resources()
async def list_resources() -> list[Resource]:
    return [
        Resource(
            uri="config://app/settings",
            name="App Settings",
            description="Current application configuration",
            mimeType="application/json",
        )
    ]


@app.read_resource()
async def read_resource(uri: str) -> ReadResourceResult:
    import json

    if uri == "config://app/settings":
        return ReadResourceResult(
            contents=[
                TextContent(
                    type="text",
                    text=json.dumps({"version": "1.0.0", "debug": False}, indent=2),
                )
            ]
        )

    raise ValueError(f"Unknown resource: {uri}")
```

Update the Server constructor to declare the `resources` capability:

```python
from mcp.server import Server
from mcp.types import ServerCapabilities, ResourcesCapability

app = Server(
    "my-mcp-server",
    capabilities=ServerCapabilities(resources=ResourcesCapability()),
)
```

## Notes

- Always write debug output to `sys.stderr` — stdout is the JSON-RPC channel
- Tool errors the LLM can learn from: return them as `TextContent` (not exceptions)
- Protocol errors (unknown tool, bad method): raise an exception — the SDK handles it
