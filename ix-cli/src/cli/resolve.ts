import chalk from "chalk";
import type { IxClient } from "../client/api.js";
import { stderr } from "./stderr.js";

export type ResolutionMode = "exact" | "preferred-kind" | "ambiguous" | "heuristic";

export interface ResolvedEntity {
  id: string;
  kind: string;
  name: string;
  path?: string;
  resolutionMode: ResolutionMode;
}

export interface AmbiguousResult {
  resolutionMode: "ambiguous";
  candidates: Array<{ id: string; name: string; kind: string; path?: string }>;
}

export type ResolveResult =
  | { resolved: true; entity: ResolvedEntity }
  | { resolved: false; ambiguous: true; result: AmbiguousResult }
  | { resolved: false; ambiguous: false };

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
 */
export async function resolveEntityFull(
  client: IxClient,
  symbol: string,
  preferredKinds: string[],
  opts?: { kind?: string; path?: string }
): Promise<ResolveResult> {
  const kindFilter = opts?.kind;
  const pathFilter = opts?.path;
  const nodes = await client.search(symbol, { limit: 20, kind: kindFilter });

  if (nodes.length === 0) {
    stderr(`No entity found matching "${symbol}".`);
    return { resolved: false, ambiguous: false };
  }

  // Exact name matches only
  const exact = nodes.filter((n: any) => {
    const name = n.name || n.attrs?.name || "";
    return name.toLowerCase() === symbol.toLowerCase();
  });

  let candidates = exact.length > 0 ? exact : nodes;

  // Apply path filter if provided — prefer entities whose file path contains the filter
  if (pathFilter) {
    const pathMatches = candidates.filter((n: any) => {
      const uri = n.provenance?.sourceUri ?? n.provenance?.source_uri ?? n.path ?? "";
      return uri.includes(pathFilter);
    });
    if (pathMatches.length > 0) {
      candidates = pathMatches;
    }
  }

  // If user specified --kind, take the first match
  if (kindFilter) {
    const node = candidates[0] as any;
    return { resolved: true, entity: nodeToResolved(node, symbol, "exact") };
  }

  // Try preferred kinds in order
  for (const pk of preferredKinds) {
    const matches = candidates.filter((n: any) => n.kind === pk);
    if (matches.length === 1) {
      return { resolved: true, entity: nodeToResolved(matches[0], symbol, "preferred-kind") };
    }
    if (matches.length > 1) {
      // Multiple matches of the same preferred kind — check if path disambiguates
      if (pathFilter) {
        // Path already filtered above, so if we still have multiple, it's genuinely ambiguous
        return { resolved: false, ambiguous: true, result: buildAmbiguous(matches) };
      }
      // Without path filter, check if all are the same entity (dedup by id)
      const uniqueIds = new Set(matches.map((n: any) => n.id));
      if (uniqueIds.size === 1) {
        return { resolved: true, entity: nodeToResolved(matches[0], symbol, "exact") };
      }
      return { resolved: false, ambiguous: true, result: buildAmbiguous(matches) };
    }
  }

  // If only one candidate, use it
  if (candidates.length === 1) {
    const node = candidates[0] as any;
    return { resolved: true, entity: nodeToResolved(node, symbol, "exact") };
  }

  // Multiple candidates, no preferred kind match — ambiguous
  return { resolved: false, ambiguous: true, result: buildAmbiguous(candidates) };
}

function nodeToResolved(node: any, symbol: string, mode: ResolutionMode): ResolvedEntity {
  return {
    id: node.id,
    kind: node.kind,
    name: node.name || node.attrs?.name || symbol,
    path: node.provenance?.sourceUri ?? node.provenance?.source_uri ?? node.path,
    resolutionMode: mode,
  };
}

function buildAmbiguous(nodes: any[]): AmbiguousResult {
  const seen = new Set<string>();
  const candidates: AmbiguousResult["candidates"] = [];
  for (const n of nodes.slice(0, 5)) {
    const node = n as any;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    candidates.push({
      id: node.id,
      name: node.name || node.attrs?.name || "(unnamed)",
      kind: node.kind ?? "",
      path: node.provenance?.sourceUri ?? node.provenance?.source_uri ?? node.path,
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
