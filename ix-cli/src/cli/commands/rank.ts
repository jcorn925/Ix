import type { Command } from "commander";
import chalk from "chalk";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";

type Metric = "dependents" | "callers" | "importers" | "members";

const METRIC_CONFIG: Record<Metric, { direction: string; predicates: string[] }> = {
  dependents: { direction: "in", predicates: ["CALLS", "IMPORTS"] },
  callers: { direction: "in", predicates: ["CALLS"] },
  importers: { direction: "in", predicates: ["IMPORTS"] },
  members: { direction: "out", predicates: ["CONTAINS"] },
};

const VALID_METRICS = Object.keys(METRIC_CONFIG) as Metric[];

/** Get source URI from a node, checking common locations */
export function getSourceUri(node: any): string {
  return (
    node.provenance?.sourceUri ??
    node.provenance?.source_uri ??
    node.attrs?.sourceUri ??
    node.attrs?.source_uri ??
    ""
  );
}

/** Apply path inclusion and exclusion filters to a list of nodes */
export function applyPathFilters(
  nodes: any[],
  includePath?: string,
  excludePath?: string
): any[] {
  let result = nodes;
  if (includePath) {
    result = result.filter((node: any) => getSourceUri(node).includes(includePath));
  }
  if (excludePath) {
    result = result.filter((node: any) => !getSourceUri(node).includes(excludePath));
  }
  return result;
}

/** Filter nodes by excluding specified kinds */
export function applyKindExclusion(nodes: any[], excludeKinds: string[]): any[] {
  if (excludeKinds.length === 0) return nodes;
  const excluded = new Set(excludeKinds);
  return nodes.filter((node: any) => !excluded.has(node.kind));
}

export function registerRankCommand(program: Command): void {
  program
    .command("rank")
    .description("Rank entities by graph-derived importance (dependents, callers, importers, members)")
    .requiredOption("--by <metric>", `Metric to rank by (${VALID_METRICS.join(", ")})`)
    .requiredOption("--kind <kind>", "Entity kind to rank (e.g. class, method, module)")
    .option("--top <n>", "Number of results to return", "10")
    .option("--path <path>", "Filter entities by source path substring")
    .option("--exclude-path <path>", "Exclude entities whose source path contains this substring")
    .option("--exclude-kind <kinds>", "Comma-separated kinds to exclude from results")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .addHelpText(
      "after",
      `\nExamples:
  ix rank --by dependents --kind class --top 10
  ix rank --by callers --kind method --top 20
  ix rank --by importers --kind module --top 10
  ix rank --by members --kind class --top 20
  ix rank --by dependents --kind class --path memory-layer --top 10
  ix rank --by dependents --kind class --exclude-path test --top 10
  ix rank --by dependents --kind class --exclude-kind config_entry --top 10
  ix rank --format json --by dependents --kind class`
    )
    .action(
      async (opts: {
        by: string;
        kind: string;
        top: string;
        path?: string;
        excludePath?: string;
        excludeKind?: string;
        format: string;
      }) => {
        const metric = opts.by as Metric;
        if (!VALID_METRICS.includes(metric)) {
          console.error(
            `Error: invalid metric "${opts.by}". Must be one of: ${VALID_METRICS.join(", ")}`
          );
          process.exit(1);
        }

        const topN = parseInt(opts.top, 10);
        const isJson = opts.format === "json";
        const client = new IxClient(getEndpoint());
        const diagnostics: string[] = [];

        // 1. Fetch all entities of the given kind
        const allNodes = await client.listByKind(opts.kind, { limit: 200 });

        if (allNodes.length === 0) {
          if (isJson) {
            console.log(JSON.stringify({
              metric,
              kind: opts.kind,
              scope: opts.path ?? null,
              results: [],
              summary: { evaluated: 0, totalCandidates: 0, returned: 0 },
              diagnostics: ["No entities found for the given kind."],
            }, null, 2));
          } else {
            console.log(chalk.dim("No entities found for the given kind."));
          }
          return;
        }

        // 2. Apply path inclusion filter
        let candidates = applyPathFilters(allNodes, opts.path, opts.excludePath);

        // 3. Apply kind exclusion filter
        const excludeKinds = opts.excludeKind ? opts.excludeKind.split(",").map(s => s.trim()) : [];
        candidates = applyKindExclusion(candidates, excludeKinds);

        if (candidates.length === 0) {
          const filterDesc = [
            opts.path ? `path "${opts.path}"` : null,
            opts.excludePath ? `exclude-path "${opts.excludePath}"` : null,
            excludeKinds.length > 0 ? `exclude-kind "${excludeKinds.join(",")}"` : null,
          ].filter(Boolean).join(", ");
          if (isJson) {
            console.log(JSON.stringify({
              metric,
              kind: opts.kind,
              scope: opts.path ?? null,
              results: [],
              summary: { evaluated: 0, totalCandidates: 0, returned: 0 },
              diagnostics: [`No entities matched filters: ${filterDesc}.`],
            }, null, 2));
          } else {
            console.log(chalk.dim(`No entities matched filters: ${filterDesc}.`));
          }
          return;
        }

        const totalCandidates = candidates.length;

        // 4. Performance guard: cap entities to evaluate
        const evalCap = Math.min(topN * 3, 60);
        const toEvaluate = candidates.slice(0, evalCap);
        if (candidates.length > evalCap) {
          diagnostics.push(
            `Evaluated ${evalCap} of ${totalCandidates} candidates (${totalCandidates} total). Increase --top or narrow --path for full coverage.`
          );
        }

        // 5. Expand each entity and count the metric
        const config = METRIC_CONFIG[metric];
        const scored = await Promise.all(
          toEvaluate.map(async (node: any) => {
            try {
              const result = await client.expand(node.id, {
                direction: config.direction,
                predicates: config.predicates,
              });
              // Count unique nodes by id
              const seen = new Set<string>();
              for (const n of result.nodes) {
                seen.add(n.id);
              }
              return {
                id: node.id,
                name: node.name || node.attrs?.name || "(unnamed)",
                kind: node.kind || opts.kind,
                score: seen.size,
              };
            } catch {
              diagnostics.push(`Failed to expand entity ${node.id}`);
              return {
                id: node.id,
                name: node.name || node.attrs?.name || "(unnamed)",
                kind: node.kind || opts.kind,
                score: 0,
              };
            }
          })
        );

        // 6. Sort descending, take top N
        scored.sort((a, b) => b.score - a.score);
        const results = scored.slice(0, topN);

        // 7. Output
        if (isJson) {
          console.log(JSON.stringify({
            metric,
            kind: opts.kind,
            scope: opts.path ?? null,
            results,
            summary: { evaluated: toEvaluate.length, totalCandidates, returned: results.length },
            diagnostics,
          }, null, 2));
        } else {
          console.log(chalk.bold(`Top ${results.length} ${opts.kind}s by ${metric}:`));
          const maxNameLen = Math.max(...results.map((r) => r.name.length), 1);
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const rank = String(i + 1).padStart(4);
            const name = r.name.padEnd(maxNameLen);
            console.log(`${rank}. ${name}  ${r.score}`);
          }
          if (diagnostics.length > 0) {
            console.log(chalk.dim(`\n${diagnostics.join("\n")}`));
          }
        }
      }
    );
}
