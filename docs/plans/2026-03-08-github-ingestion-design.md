# GitHub Ingestion Design

## Goal

Ingest GitHub issues, PRs, and commits into the Ix knowledge graph via `ix ingest --github owner/repo`, driven entirely from the CLI with one small backend addition (a direct patch submission endpoint).

## Architecture

The CLI fetches data from GitHub's REST API, transforms it into GraphPatch operations, and submits them to a new `POST /v1/patch` endpoint. The backend commits patches using existing infrastructure — no GitHub awareness needed.

Auth resolves in order: `gh auth token` → `GITHUB_TOKEN` env → `--token <pat>`.

## Command Surface

```
ix ingest --github owner/repo [--token <pat>] [--since <date>] [--limit <n>] [--format json]
```

- `--since` defaults to 30 days ago
- `--limit` caps items per category (default 50 issues, 50 PRs, 100 commits)
- `--format json` returns structured IngestResult

## Entity Mapping

| GitHub Concept | NodeKind | SourceType | URI Pattern |
|---|---|---|---|
| Issue | `intent` | `Comment` | `github://owner/repo/issues/123` |
| Issue comment | `doc` | `Comment` | `github://owner/repo/issues/123/comments/456` |
| Pull Request | `decision` | `Comment` | `github://owner/repo/pull/45` |
| PR review comment | `doc` | `Comment` | `github://owner/repo/pull/45/comments/789` |
| Commit | `doc` | `Commit` | `github://owner/repo/commit/abc123` |

## Edge Mapping

| Relationship | Edge Predicate |
|---|---|
| Issue → mentioned file | REFERENCES |
| PR → changed file | REFERENCES |
| PR → linked issue | REFERENCES |
| Commit → changed file | REFERENCES |
| Issue ← comment | CONTAINS |
| PR ← review comment | CONTAINS |

## Node Attrs

Issues: `{ number, url, author, labels, state, created_at, title }`
PRs: `{ number, url, author, state, merged, base_branch, head_branch, created_at, title, changed_files_count }`
Commits: `{ sha, url, author, message, created_at, changed_files_count }`
Comments: `{ url, author, created_at, body (truncated to 2000 chars) }`

## Identity

Deterministic node IDs from URI string (same scheme as file-based ingestion). Re-ingesting the same repo is idempotent.

## Backend Addition

One small Scala change: add `POST /v1/patch` endpoint that accepts a GraphPatch JSON body and calls `writeApi.commitPatch()`. The infrastructure already exists — DecideRoutes and TruthRoutes use the same pattern internally.

Corresponding `IxClient.commitPatch()` method in the CLI client.

## File References

PR changed files and commit changed files are matched against already-ingested file nodes by path suffix. Issue/PR body text is scanned for file path patterns to create REFERENCES edges.

## Bounds

- `--limit` per category (default 50/50/100)
- `--since` date filter (default 30 days)
- Comment body truncated to 2000 chars
- Pagination handled automatically up to limit

## Not Included

- Webhooks / real-time sync
- GitHub Actions / workflows
- Discussions, releases, tags
- Full diff content (just changed file list)
