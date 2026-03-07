import type { Command } from "commander";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";
import { formatEdgeResults } from "../format.js";

export function registerImportsCommand(program: Command): void {
  program
    .command("imports <symbol>")
    .description("Show what the given entity imports")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .action(async (symbol: string, opts: { format: string }) => {
      const client = new IxClient(getEndpoint());

      const nodes = await client.search(symbol, { limit: 1 });
      if (nodes.length === 0) {
        console.log(`No entity found matching "${symbol}".`);
        return;
      }
      const entityId = (nodes[0] as any).id;

      const result = await client.expand(entityId, { direction: "out", predicates: ["IMPORTS"] });
      formatEdgeResults(result.nodes, "imports", symbol, opts.format);
    });

  program
    .command("imported-by <symbol>")
    .description("Show what imports the given entity")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .action(async (symbol: string, opts: { format: string }) => {
      const client = new IxClient(getEndpoint());

      const nodes = await client.search(symbol, { limit: 1 });
      if (nodes.length === 0) {
        console.log(`No entity found matching "${symbol}".`);
        return;
      }
      const entityId = (nodes[0] as any).id;

      const result = await client.expand(entityId, { direction: "in", predicates: ["IMPORTS"] });
      formatEdgeResults(result.nodes, "imported-by", symbol, opts.format);
    });
}
