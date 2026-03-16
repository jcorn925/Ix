# Example — Minimal TypeScript MCP Server

## 1. Project Setup

```bash
mkdir my-mcp-server && cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk
npm install -D typescript @types/node
npx tsc --init
```

Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```

Update `package.json`:
```json
{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

## 2. Server Code

Create `src/server.ts`:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Create the server instance
const server = new Server(
  { name: "my-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Declare available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "add",
        description: "Add two numbers together",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number", description: "First number" },
            b: { type: "number", description: "Second number" },
          },
          required: ["a", "b"],
        },
      },
      {
        name: "greet",
        description: "Generate a greeting for a person",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Person's name" },
          },
          required: ["name"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error("[debug] tool called:", name, args);

  if (name === "add") {
    const a = args?.a as number;
    const b = args?.b as number;

    if (typeof a !== "number" || typeof b !== "number") {
      return {
        content: [{ type: "text", text: "Error: a and b must be numbers" }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: `${a} + ${b} = ${a + b}` }],
    };
  }

  if (name === "greet") {
    const personName = args?.name as string;

    if (typeof personName !== "string" || personName.trim() === "") {
      return {
        content: [{ type: "text", text: "Error: name must be a non-empty string" }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: `Hello, ${personName.trim()}! Welcome to MCP.` }],
    };
  }

  // Unknown tool — protocol error
  throw new Error(`Unknown tool: ${name}`);
});

// Connect to Claude Code via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[info] MCP server running on stdio");
```

## 3. Build and Register

```bash
npm run build

# Register with Claude Code (stdio transport)
claude mcp add --transport stdio my-server -- node /absolute/path/to/dist/server.js
```

Or add to `.mcp.json` in your project root for project-wide access:
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["./my-mcp-server/dist/server.js"]
    }
  }
}
```

## 4. Test It

In Claude Code:
```
/mcp                           # verify server shows as connected
Use the add tool to add 5 + 3
Use the greet tool for Alice
```

## 5. Adding Resources

To also expose resources, update capabilities and add a handler:

```typescript
// In Server constructor
{ capabilities: { tools: {}, resources: {} } }

// Add handler
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "config://app/settings",
        name: "App Settings",
        description: "Current application configuration",
        mimeType: "application/json",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "config://app/settings") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ version: "1.0.0", debug: false }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});
```
