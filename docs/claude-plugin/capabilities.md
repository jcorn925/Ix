# Capabilities — Tools, Resources, and Prompts

## Tools (Model-Controlled Functions)

Tools are functions the LLM can discover and call based on task context. The LLM decides
when to call them; the user must approve each invocation.

### Tool Definition

```json
{
  "name": "get_user_by_id",
  "title": "Get User Information",
  "description": "Retrieves user details by user ID",
  "inputSchema": {
    "type": "object",
    "properties": {
      "user_id": {
        "type": "string",
        "description": "The user's unique identifier"
      },
      "include_details": {
        "type": "boolean",
        "description": "Include detailed information"
      }
    },
    "required": ["user_id"]
  }
}
```

### Tool Name Rules

- Characters: A–Z, a–z, 0–9, underscore `_`, hyphen `-`, dot `.`
- Length: 1–128 characters
- Case-sensitive
- Must be unique within the server
- Examples: `getUser`, `fetch_data`, `admin.tools.list`

### Tool Result Content Types

**Text:**
```json
{ "type": "text", "text": "Result text" }
```

**Image:**
```json
{ "type": "image", "data": "<base64>", "mimeType": "image/png" }
```

**Resource link:**
```json
{
  "type": "resource_link",
  "uri": "file:///path/to/file",
  "name": "File Name",
  "mimeType": "text/plain"
}
```

**Embedded resource:**
```json
{
  "type": "resource",
  "resource": { "uri": "file:///path", "mimeType": "text/plain", "text": "Content" }
}
```

### Returning a Tool Result

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      { "type": "text", "text": "Operation completed successfully." }
    ]
  }
}
```

For errors the LLM should see and self-correct from, set `isError: true` in the result
(not as a JSON-RPC error). See [error-handling.md](./error-handling.md).

### Output Schema (Optional)

Declare expected output structure for validation:

```json
{
  "outputSchema": {
    "type": "object",
    "properties": {
      "status": { "type": "string", "enum": ["success", "error"] },
      "count": { "type": "integer" }
    },
    "required": ["status"]
  }
}
```

---

## Resources (Application-Controlled Context)

Resources provide contextual data — files, schemas, documentation — to the LLM.
The application (Claude Code) controls when they are included; the LLM does not
call resources directly.

### Resource Definition

```json
{
  "uri": "file:///project/src/main.rs",
  "name": "main.rs",
  "title": "Application Entry Point",
  "description": "Primary Rust source file",
  "mimeType": "text/x-rust",
  "size": 2048,
  "annotations": {
    "audience": ["assistant"],
    "priority": 0.9,
    "lastModified": "2025-03-14T10:30:00Z"
  }
}
```

### Resource Content

Text resource:
```json
{ "uri": "file:///example.txt", "mimeType": "text/plain", "text": "File contents" }
```

Binary resource:
```json
{ "uri": "file:///image.png", "mimeType": "image/png", "blob": "<base64>" }
```

### URI Templates (Parameterized Resources)

Servers can expose templates using URI templates (RFC 6570):

```json
{
  "uriTemplate": "file:///{path}",
  "name": "Project Files",
  "description": "Access any file in the project",
  "mimeType": "application/octet-stream"
}
```

### Annotations

| Field | Values | Meaning |
|-------|--------|---------|
| `audience` | `["user"]`, `["assistant"]`, or both | Who the resource is for |
| `priority` | 0.0 – 1.0 | Importance (1.0 = most important) |
| `lastModified` | ISO 8601 timestamp | When the resource was last changed |

### Common URI Schemes

- `file://` — Filesystem-like resources
- `git://` — Version control resources
- `https://` — Web resources
- Custom schemes (must follow RFC 3986)

---

## Prompts (User-Controlled Templates)

Prompts are templated messages invoked by the user — similar to slash commands.
The user explicitly triggers a prompt; no additional approval is needed.

### Prompt Definition

```json
{
  "name": "code_review",
  "title": "Request Code Review",
  "description": "Analyzes code and suggests improvements",
  "arguments": [
    {
      "name": "code",
      "description": "Code to review",
      "required": true
    },
    {
      "name": "language",
      "description": "Programming language",
      "required": false
    }
  ]
}
```

### Prompt Response (Messages)

```json
{
  "description": "Code review prompt",
  "messages": [
    {
      "role": "user",
      "content": {
        "type": "text",
        "text": "Please review this {{language}} code:\n\n{{code}}"
      }
    }
  ]
}
```

### Prompt Message Content Types

- `text` — Plain text message
- `image` — Base64-encoded image (`data` + `mimeType`)
- `audio` — Base64-encoded audio (`data` + `mimeType`)
- `resource` — Embedded resource with URI and content

---

## JSON Schema Reference

MCP uses **JSON Schema Draft 2020-12** by default. Specify an explicit version with:

```json
{ "$schema": "http://json-schema.org/draft-07/schema#", "type": "object", ... }
```

Tool with no parameters:
```json
{ "inputSchema": { "type": "object", "additionalProperties": false } }
```

Complex nested input:
```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "filters": {
        "type": "object",
        "properties": {
          "date_range": {
            "type": "object",
            "properties": {
              "start": { "type": "string", "format": "date" },
              "end": { "type": "string", "format": "date" }
            },
            "required": ["start", "end"]
          }
        }
      }
    }
  }
}
```
