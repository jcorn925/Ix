import type { Command } from "commander";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";
import { formatNodes } from "../format.js";

export function registerSearchCommand(program: Command): void {
  program
    .command("search <term>")
    .description("Search the knowledge graph by term")
    .option("--limit <n>", "Max results", "10")
    .option("--kind <kind>", "Filter by node kind (e.g. method, class, decision)")
    .option("--language <lang>", "Filter by language/file extension (e.g. scala, ts)")
    .option("--as-of <rev>", "Search as of a specific revision")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .addHelpText("after", "\nExamples:\n  ix search IngestionService --kind class\n  ix search auth --language python --limit 10\n  ix search \"\" --kind file --limit 50 --format json")
    .action(async (term: string, opts: {
      limit: string; kind?: string; language?: string; asOf?: string; format: string
    }) => {
      const client = new IxClient(getEndpoint());
      const limit = parseInt(opts.limit, 10);
      const nodes = await client.search(term, {
        limit,
        kind: opts.kind,
        language: opts.language,
        asOfRev: opts.asOf ? parseInt(opts.asOf, 10) : undefined,
      });

      if (opts.format === "json") {
        const diagnostics: { code: string; message: string }[] = [];
        if (!opts.kind) {
          diagnostics.push({
            code: "unfiltered_search",
            message: "Results may be broad. Use --kind to filter.",
          });
        }
        console.log(JSON.stringify({
          results: nodes.map((n) => ({
            id: n.id,
            name: n.name || (n.attrs as any)?.name || "(unnamed)",
            kind: n.kind,
            path: n.provenance?.sourceUri ?? undefined,
          })),
          summary: { count: nodes.length },
          diagnostics,
        }, null, 2));
      } else {
        formatNodes(nodes, opts.format);
      }
    });
}
