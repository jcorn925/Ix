import type { Command } from "commander";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";
import { formatEdgeResults } from "../format.js";

export function registerContainsCommand(program: Command): void {
  program
    .command("contains <symbol>")
    .description("Show members contained by the given entity (class, module, file)")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .action(async (symbol: string, opts: { format: string }) => {
      const client = new IxClient(getEndpoint());

      const nodes = await client.search(symbol, { limit: 1 });
      if (nodes.length === 0) {
        console.log(`No entity found matching "${symbol}".`);
        return;
      }
      const entityId = (nodes[0] as any).id;

      const result = await client.expand(entityId, { direction: "out", predicates: ["CONTAINS"] });
      formatEdgeResults(result.nodes, "contains", symbol, opts.format);
    });
}
