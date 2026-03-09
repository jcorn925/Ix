import type { Command } from "commander";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";
import { formatNodes } from "../format.js";
import { scoreCandidate } from "../resolve.js";

/** Structural kinds that should rank higher than incidental matches. */
const STRUCTURAL_KINDS = new Set([
  "class", "trait", "object", "interface", "function", "method", "module", "file",
]);

/**
 * Compute a ranking score for a search result.
 * Lower score = better match.
 *
 * Uses the shared scoreCandidate from resolve.ts as the primary signal,
 * with additional search-specific adjustments.
 *
 * Tiers (for JSON output):
 *   0 — exact name + exact kind
 *   1 — exact name + structural kind
 *   2 — exact name (any kind)
 *   3 — exact filename/module match
 *   4 — container-aware near match
 *   5 — fuzzy/incidental match
 */
function rankScore(
  node: any,
  term: string,
  requestedKind: string | undefined,
  pathFilter: string | undefined
): number {
  // Use the shared resolver scoring as the base
  const resolverScore = scoreCandidate(node, term, { kind: requestedKind, path: pathFilter });

  // Map resolver score ranges to display tiers
  if (resolverScore <= -8) return 0;  // exact name + kind + path
  if (resolverScore <= -3) return 0;  // exact name + kind
  if (resolverScore <= 0) return 1;   // exact name + structural
  if (resolverScore <= 2) return 2;   // exact name, any kind

  const name: string = (node.name || node.attrs?.name || "").toLowerCase();
  const termLower = term.toLowerCase();
  const sourceUri: string = (node.provenance?.sourceUri ?? node.provenance?.source_uri ?? "").toLowerCase();
  const basename = sourceUri.split("/").pop() ?? "";
  const basenameNoExt = basename.replace(/\.[^.]+$/, "");

  // Tier 3: entity IS a file/module whose own name matches
  const kind = (node.kind || "").toLowerCase();
  if (
    kind === "file" && (basename === termLower || basenameNoExt === termLower) ||
    kind === "module" && name === termLower
  ) {
    return 3;
  }

  // Tier 4: prefix match or name starts with term
  if (name.startsWith(termLower)) {
    return 4;
  }

  return 5;
}

/**
 * Full sort key: (tier, structural-boost, name).
 */
function searchSort(a: { node: any; score: number }, b: { node: any; score: number }): number {
  if (a.score !== b.score) return a.score - b.score;
  // Within same tier: structural kinds first
  const aStructural = STRUCTURAL_KINDS.has((a.node.kind || "").toLowerCase()) ? 0 : 1;
  const bStructural = STRUCTURAL_KINDS.has((b.node.kind || "").toLowerCase()) ? 0 : 1;
  if (aStructural !== bStructural) return aStructural - bStructural;
  const aName = (a.node.name || a.node.attrs?.name || "").toLowerCase();
  const bName = (b.node.name || b.node.attrs?.name || "").toLowerCase();
  return aName.localeCompare(bName);
}

export function registerSearchCommand(program: Command): void {
  program
    .command("search <term>")
    .description("Search the knowledge graph by term — ranked by structural relevance")
    .option("--limit <n>", "Max results", "10")
    .option("--kind <kind>", "Filter and boost results by node kind (e.g. class, function, decision)")
    .option("--language <lang>", "Filter by language/file extension (e.g. scala, ts)")
    .option("--path <path>", "Boost results from files matching this path substring")
    .option("--as-of <rev>", "Search as of a specific revision")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .addHelpText("after", `\nRanking priority:
  1. Exact name + exact kind match
  2. Exact name + structural kind (class, function, etc.)
  3. Exact name (any kind)
  4. Exact filename/module match
  5. Container-aware near match
  6. Fuzzy/incidental match

Use --path to boost results from specific directories.

Examples:
  ix search IngestionService --kind class
  ix search auth --language python --limit 10
  ix search expand --path memory-layer
  ix search "" --kind file --limit 50 --format json`)
    .action(async (term: string, opts: {
      limit: string; kind?: string; language?: string; path?: string; asOf?: string; format: string
    }) => {
      const client = new IxClient(getEndpoint());
      const limit = parseInt(opts.limit, 10);

      // Fetch more results than requested so we can re-rank and trim
      const fetchLimit = Math.min(limit * 3, 60);
      const nodes = await client.search(term, {
        limit: fetchLimit,
        kind: opts.kind,
        language: opts.language,
        asOfRev: opts.asOf ? parseInt(opts.asOf, 10) : undefined,
      });

      // Re-rank client-side using shared scoring
      const scored = nodes.map(n => ({
        node: n,
        score: rankScore(n, term, opts.kind, opts.path),
      }));

      scored.sort(searchSort);

      const ranked = scored.slice(0, limit).map(s => s.node);

      if (opts.format === "json") {
        const diagnostics: { code: string; message: string }[] = [];
        if (!opts.kind) {
          diagnostics.push({
            code: "unfiltered_search",
            message: "Results may be broad. Use --kind to filter and boost structural matches.",
          });
        }
        console.log(JSON.stringify({
          results: ranked.map((n, i) => ({
            id: n.id,
            name: n.name || (n.attrs as any)?.name || "(unnamed)",
            kind: n.kind,
            path: n.provenance?.sourceUri ?? undefined,
            rank: i + 1,
            tier: scored.find(s => s.node === n)?.score ?? 5,
          })),
          summary: {
            count: ranked.length,
            totalCandidates: nodes.length,
          },
          diagnostics,
        }, null, 2));
      } else {
        formatNodes(ranked, opts.format);
      }
    });
}
