import type { Command } from "commander";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";
import { formatDecisions } from "../format.js";

export function registerDecisionsCommand(program: Command): void {
  program
    .command("decisions")
    .description("List recorded design decisions")
    .option("--limit <n>", "Max results", "50")
    .option("--topic <topic>", "Filter by topic keyword")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .action(async (opts: { limit: string; topic?: string; format: string }) => {
      const client = new IxClient(getEndpoint());
      const nodes = await client.listDecisions({
        limit: parseInt(opts.limit, 10),
        topic: opts.topic,
      });
      formatDecisions(nodes, opts.format);
    });
}
