# Stabilize and Optimize Phase 2 — Design

**Goal:** Complete the remaining stabilization work: optimize diff, bound fallback output, fix remaining JSON leaks.

**Scope:** Backend diff summary + limit, CLI diff flags, callers/locate fallback capping, JSON audit fixes. Entity --summary deferred — YAGNI.

---

## 1. Diff Optimization

**Problem:** `--summary` is purely client-side. Backend always returns full `DiffResponse` with complete `GraphNode` objects at both revisions. Broad diffs produce MB-scale payloads.

**Backend change:** Add `summary: Option[Boolean]` and `limit: Option[Int]` to `DiffRequest`.

When `summary = true`, run a lightweight AQL counting query that groups changes by type (`added`/`modified`/`removed`) without hydrating full nodes. Return counts only.

When `limit` is set (default 100), return at most N `DiffEntry` records plus `truncated: true` and `totalChanges: Int` metadata.

**Summary AQL:** Single query that collects logical IDs changed between revisions, determines change type via subqueries, then aggregates counts by type — no full node hydration.

**CLI changes:**
- Pass `summary` and `limit` to client
- Default broad diff: limit 100 changes, include truncation metadata
- `--full` flag overrides limit (sets to max)
- `--limit <n>` for explicit control
- `--summary` triggers backend summary mode

## 2. Bound Fallback Behavior

**Problem:** callers text fallback has `--max-count 10` per file in ripgrep but JSON mode doesn't cap total results across files.

**Fix:** Hard-cap fallback results to 10 total in all modes. Add `candidatesFound` vs `candidatesReturned` to summary so agents know there were more.

**Commands affected:**
- `callers.ts` — cap ripgrep results to 10, restructure fallback output
- `locate.ts` — cap ripgrep matches to 10 before merging with graph results

**Not affected:** callees, depends, imports, imported-by, contains — all graph-only, no fallback.

## 3. JSON Audit Fixes

**Remaining leaks (minor):**
- `callers.ts` line 67 — warning `console.log` not format-guarded → use `stderr()` + guard
- `query.ts` — deprecation warning prints to stdout unconditionally → move to `stderr()`
- `read.ts` — `console.error()` → `stderr()` for consistency
- `text.ts` — `console.error()` → `stderr()` for consistency

**Not changed:** `init.ts` — interactive setup command, not used in JSON pipelines.

## Deferred

- Entity `--summary` flag — YAGNI, entity is intentionally detailed as a low-level primitive
