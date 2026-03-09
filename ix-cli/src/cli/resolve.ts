import chalk from "chalk";
import type { IxClient } from "../client/api.js";
import { stderr } from "./stderr.js";

export type ResolutionMode = "exact" | "preferred-kind" | "scored" | "ambiguous" | "heuristic";

export interface ResolvedEntity {
  id: string;
  kind: string;
  name: string;
  path?: string;
  resolutionMode: ResolutionMode;
}

export interface AmbiguousResult {
  resolutionMode: "ambiguous";
  candidates: Array<{ id: string; name: string; kind: string; path?: string; score?: number }>;
}

export type ResolveResult =
  | { resolved: true; entity: ResolvedEntity }
  | { resolved: false; ambiguous: true; result: AmbiguousResult }
  | { resolved: false; ambiguous: false };

// ── Structural kind sets ──────────────────────────────────────────────────

/** High-value container kinds — typically what callers want when resolving a bare name. */
const CONTAINER_KINDS = new Set(["file", "class", "object", "trait", "interface", "module"]);

/** All kinds that represent real code structure (vs. config/doc/decision). */
const STRUCTURAL_KINDS = new Set([
  ...CONTAINER_KINDS, "function", "method",
]);

// ── Scoring ───────────────────────────────────────────────────────────────

/**
 * Score a candidate node for resolution.
 * Lower is better. Combines:
 *   - exact name match (0 vs 10)
 *   - exact kind match when --kind provided (-5)
 *   - strong path match when --path provided (-4)
 *   - structural kind boost (-3 for container, -1 for method/function)
 *   - penalty for fuzzy/incidental matches (+5)
 */
export function scoreCandidate(
  node: any,
  symbol: string,
  opts?: { kind?: string; path?: string }
): number {
  const name: string = (node.name || node.attrs?.name || "").toLowerCase();
  const kind: string = (node.kind || "").toLowerCase();
  const symbolLower = symbol.toLowerCase();
  const sourceUri: string = (node.provenance?.sourceUri ?? node.provenance?.source_uri ?? "").toLowerCase();

  let score = 50; // baseline

  // ── Name match ──────────────────────────────────────────────────────
  if (name === symbolLower) {
    score = 0; // exact name match — best tier
  } else if (name.startsWith(symbolLower)) {
    score = 15; // prefix match — moderate
  } else {
    score = 30; // fuzzy / incidental — poor
  }

  // ── Kind match ──────────────────────────────────────────────────────
  if (opts?.kind && kind === opts.kind.toLowerCase()) {
    score -= 5; // exact kind requested by user
  }

  // ── Structural boost ────────────────────────────────────────────────
  if (CONTAINER_KINDS.has(kind)) {
    score -= 3; // containers are high-value resolution targets
  } else if (STRUCTURAL_KINDS.has(kind)) {
    score -= 1; // methods/functions are useful but lower than containers
  }
  // non-structural kinds (config_entry, doc, decision, etc.) get no boost

  // ── Path match ──────────────────────────────────────────────────────
  if (opts?.path) {
    const pathLower = opts.path.toLowerCase();
    if (sourceUri.includes(pathLower)) {
      score -= 4; // strong path preference
    }
  }

  return score;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Resolve a symbol to a single entity, preferring specific kinds and path filters.
 * Returns null and prints guidance if no match or ambiguous.
 */
export async function resolveEntity(
  client: IxClient,
  symbol: string,
  preferredKinds: string[],
  opts?: { kind?: string; path?: string }
): Promise<ResolvedEntity | null> {
  const result = await resolveEntityFull(client, symbol, preferredKinds, opts);
  if (result.resolved) return result.entity;
  if (result.ambiguous) {
    printAmbiguous(symbol, result.result, opts);
  }
  return null;
}

/**
 * Full resolution returning structured result for JSON consumers.
 *
 * Two-phase ranking:
 *   Phase 1: Score exact-name candidates. If a clear winner exists, return it.
 *   Phase 2: If no exact-name candidates or still ambiguous, include fuzzy matches.
 */
export async function resolveEntityFull(
  client: IxClient,
  symbol: string,
  preferredKinds: string[],
  opts?: { kind?: string; path?: string }
): Promise<ResolveResult> {
  const kindFilter = opts?.kind;
  const nodes = await client.search(symbol, { limit: 20, kind: kindFilter });

  if (nodes.length === 0) {
    stderr(`No entity found matching "${symbol}".`);
    return { resolved: false, ambiguous: false };
  }

  // ── Phase 1: Exact-name candidates ──────────────────────────────────
  const symbolLower = symbol.toLowerCase();
  const exactName = nodes.filter((n: any) => {
    const name = (n.name || n.attrs?.name || "").toLowerCase();
    return name === symbolLower;
  });

  // Score exact-name candidates
  if (exactName.length > 0) {
    const winner = pickBest(exactName, symbol, preferredKinds, opts);
    if (winner) return winner;
  }

  // ── Phase 2: Fall back to all candidates ────────────────────────────
  const winner = pickBest(nodes, symbol, preferredKinds, opts);
  if (winner) return winner;

  // Nothing resolved at all
  stderr(`No entity found matching "${symbol}".`);
  return { resolved: false, ambiguous: false };
}

/**
 * Given a candidate set, score them, dedup, and either pick a winner or declare ambiguity.
 */
function pickBest(
  candidates: any[],
  symbol: string,
  preferredKinds: string[],
  opts?: { kind?: string; path?: string }
): ResolveResult | null {
  // Score all candidates
  const scored = candidates.map(n => ({
    node: n,
    score: scoreCandidate(n, symbol, opts),
  }));

  // Sort by score ascending (lower = better)
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    // Tie-break: prefer preferred kinds in order
    const aIdx = preferredKinds.indexOf(a.node.kind);
    const bIdx = preferredKinds.indexOf(b.node.kind);
    const aRank = aIdx >= 0 ? aIdx : preferredKinds.length;
    const bRank = bIdx >= 0 ? bIdx : preferredKinds.length;
    return aRank - bRank;
  });

  // Dedup by id
  const seen = new Set<string>();
  const unique = scored.filter(s => {
    if (seen.has(s.node.id)) return false;
    seen.add(s.node.id);
    return true;
  });

  if (unique.length === 0) return null;

  // If the best candidate has a clearly better score than the second, it wins
  const best = unique[0];
  const second = unique[1];

  // Single candidate — clear winner
  if (unique.length === 1) {
    return { resolved: true, entity: nodeToResolved(best.node, symbol, resolutionMode(best, opts)) };
  }

  // Best is significantly better than second (score gap >= 3) — winner
  if (second && best.score + 3 <= second.score) {
    return { resolved: true, entity: nodeToResolved(best.node, symbol, resolutionMode(best, opts)) };
  }

  // If user specified --kind, take the best — they asked for it
  if (opts?.kind) {
    return { resolved: true, entity: nodeToResolved(best.node, symbol, "exact") };
  }

  // Check if all top candidates at the same score tier are the same entity
  const topScore = best.score;
  const topTier = unique.filter(s => s.score === topScore);
  const topIds = new Set(topTier.map(s => s.node.id));
  if (topIds.size === 1) {
    return { resolved: true, entity: nodeToResolved(best.node, symbol, resolutionMode(best, opts)) };
  }

  // If best is a container kind and second is a method/function, prefer the container
  const bestKind = (best.node.kind || "").toLowerCase();
  const secondKind = (second.node.kind || "").toLowerCase();
  if (CONTAINER_KINDS.has(bestKind) && !CONTAINER_KINDS.has(secondKind)) {
    return { resolved: true, entity: nodeToResolved(best.node, symbol, "scored") };
  }

  // If path was provided and best matches path but second doesn't, best wins
  if (opts?.path) {
    const bestUri = (best.node.provenance?.sourceUri ?? best.node.provenance?.source_uri ?? "").toLowerCase();
    const secondUri = (second.node.provenance?.sourceUri ?? second.node.provenance?.source_uri ?? "").toLowerCase();
    const pathLower = opts.path.toLowerCase();
    if (bestUri.includes(pathLower) && !secondUri.includes(pathLower)) {
      return { resolved: true, entity: nodeToResolved(best.node, symbol, "scored") };
    }
  }

  // Genuinely ambiguous — return only structurally relevant candidates
  const ambiguousCandidates = unique
    .filter(s => s.score <= topScore + 5) // only candidates within range
    .slice(0, 5);

  return {
    resolved: false,
    ambiguous: true,
    result: buildAmbiguous(ambiguousCandidates.map(s => s.node), ambiguousCandidates.map(s => s.score)),
  };
}

function resolutionMode(scored: { score: number }, opts?: { kind?: string }): ResolutionMode {
  if (opts?.kind) return "exact";
  if (scored.score <= 0) return "exact";
  if (scored.score <= 5) return "preferred-kind";
  return "scored";
}

// ── Helpers ───────────────────────────────────────────────────────────────

function nodeToResolved(node: any, symbol: string, mode: ResolutionMode): ResolvedEntity {
  return {
    id: node.id,
    kind: node.kind,
    name: node.name || node.attrs?.name || symbol,
    path: node.provenance?.sourceUri ?? node.provenance?.source_uri ?? node.path,
    resolutionMode: mode,
  };
}

function buildAmbiguous(nodes: any[], scores?: number[]): AmbiguousResult {
  const seen = new Set<string>();
  const candidates: AmbiguousResult["candidates"] = [];
  for (let i = 0; i < nodes.length && i < 5; i++) {
    const node = nodes[i] as any;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    candidates.push({
      id: node.id,
      name: node.name || node.attrs?.name || "(unnamed)",
      kind: node.kind ?? "",
      path: node.provenance?.sourceUri ?? node.provenance?.source_uri ?? node.path,
      score: scores?.[i],
    });
  }
  return { resolutionMode: "ambiguous", candidates };
}

function printAmbiguous(symbol: string, result: AmbiguousResult, opts?: { kind?: string; path?: string }): void {
  stderr(`Ambiguous symbol "${symbol}":`);
  for (const c of result.candidates) {
    const shortPath = c.path ? ` in ${c.path}` : "";
    stderr(`  ${chalk.cyan((c.kind ?? "").padEnd(10))} ${chalk.dim(c.id.slice(0, 8))}  ${c.name}${chalk.dim(shortPath)}`);
  }
  const hints: string[] = [];
  if (!opts?.kind) hints.push("--kind");
  if (!opts?.path) hints.push("--path");
  stderr(chalk.dim(`\nUse ${hints.join(" or ")} to disambiguate.`));
}

/**
 * Print the resolved target before showing results (text mode only).
 * Callers should skip this when format === "json" to keep JSON strict.
 */
export function printResolved(target: ResolvedEntity): void {
  const shortId = target.id.slice(0, 8);
  const modeStr = target.resolutionMode !== "exact"
    ? chalk.dim(` (${target.resolutionMode})`)
    : "";
  stderr(`${chalk.dim("Resolved:")} ${chalk.cyan(target.kind)} ${chalk.dim(shortId)} ${chalk.bold(target.name)}${modeStr}\n`);
}

/** Check if a string looks like a raw UUID (not a human-readable name). */
export function isRawId(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s)
    || /^[0-9a-f]{32,}$/i.test(s);
}
