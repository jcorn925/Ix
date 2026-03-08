# Ix CLI — Agent Usage Guide

This file tells automated agents (Codex, Claude, etc.) how to use the `ix` CLI effectively.

## Interface

Use the `ix` CLI exclusively. All commands support `--format json` for machine-readable output.

**Do NOT use MCP tools** — the CLI is the canonical agent interface.

## JSON Mode

Always use `--format json` when chaining commands or parsing results programmatically.

JSON output is strict — no text preamble or postamble. The output is a single JSON object.

### Standard JSON fields

| Field | Description |
|-------|-------------|
| `resolvedTarget` | The entity that was resolved (`{id, kind, name}`) |
| `resolutionMode` | How the entity was resolved: `exact`, `preferred-kind`, `ambiguous`, `heuristic` |
| `resultSource` | Where results came from: `graph`, `text`, `graph+text`, `heuristic` |
| `results` | Array of result entities |
| `summary` | Counts and aggregates |
| `diagnostics` | Array of `{code, message}` explaining empty or weak results |
| `warning` | Human-readable warning string |

### Diagnostic codes

| Code | Meaning |
|------|---------|
| `no_edges` | Entity resolved but no graph edges of the requested type exist |
| `unresolved_call_target` | A callee/caller could not be resolved to a named entity |
| `dangling_reference_filtered` | Some results had unresolvable IDs |
| `ambiguous_resolution` | Multiple entities matched; specify `--kind` or use entity ID |
| `text_fallback_used` | Graph had no results; text search was used instead |
| `parser_gap_suspected` | Results suggest the parser did not fully index this area |

## Result entities

Each result entity in `results` includes:

- `name` — human-readable name (present when `resolved: true`)
- `kind` — entity kind (function, method, class, etc.)
- `id` — resolvable entity ID (present when `resolved: true`)
- `resolved` — boolean indicating whether this entity can be followed up
- `path` — source file path (when available)
- `suggestedCommand` — a follow-up `ix` command to get more details
- `rawId` — raw graph ID (only present when `resolved: false`)

**Rule:** Only use `id` fields from entities where `resolved: true`. Do not attempt `ix entity <rawId>` on unresolved references.

## Command routing

### Start here — high-level workflow commands

These are the preferred entry points. Use them first; drop to low-level commands only when you need fine-grained control.

```
ix impact <target> --format json          # Blast radius / dependency consequences
ix rank --by <metric> --kind <kind> --top N --format json   # Hotspot discovery
ix overview <target> --format json        # One-shot structural summary of a component
ix inventory --kind <kind> --format json  # Scoped entity listing
```

**When to use which:**
- "What breaks if I change X?" → `ix impact X`
- "What are the most important classes?" → `ix rank --by dependents --kind class --top 10`
- "Tell me about UserService" → `ix overview UserService`
- "List all functions in auth.py" → `ix inventory --kind function --path auth.py`

### Low-level structural primitives

Useful for debugging, fine-grained inspection, or when high-level commands don't cover your case.

#### Finding code
```
ix search <term> --format json --limit 10
ix text <term> --format json --language python
ix locate <symbol> --format json
ix read <file:lines>
```

#### Understanding entities
```
ix explain <symbol> --format json
ix entity <id> --format json
```

#### Navigating relationships
```
ix callers <symbol> --format json
ix callees <symbol> --format json
ix contains <symbol> --format json
ix imports <symbol> --format json
ix imported-by <symbol> --format json
ix depends <symbol> --format json
```

### Ingesting data
```
ix ingest ./src --recursive --format json
ix ingest --github owner/repo --format json --limit 50
ix ingest --github owner/repo --since 2026-01-01 --format json
```

### History and decisions
```
ix decisions --format json
ix history <id> --format json
ix diff <from> <to> --format json
```

## Chaining pattern

1. Start broad: `ix overview MyClass --format json` or `ix impact MyClass --format json`
2. If you need more detail, drill in: `ix explain MyClass --format json` or `ix entity <id> --format json`
3. Navigate edges: `ix callers MyClass --format json`

## Handling unresolved references

When a result has `resolved: false`:
- Do NOT follow the `rawId` with `ix entity`
- Instead, use `ix text "<name>"` or `ix read <file>` to locate it
- Check `suggestedCommand` if present

## Handling empty results

Check `diagnostics` in the JSON response:
- `no_edges` — entity exists but has no edges of this type. Try `ix text` instead.
- `text_fallback_used` — graph traversal was empty; text matches shown instead.
- `ambiguous_resolution` — re-run with `--kind <kind>` to disambiguate.
