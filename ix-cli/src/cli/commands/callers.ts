import type { Command } from "commander";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";
import { formatEdgeResults } from "../format.js";
import { resolveEntity, printResolved } from "../resolve.js";

export function registerCallersCommand(program: Command): void {
  program
    .command("callers <symbol>")
    .description("Show methods/functions that call the given symbol")
    .option("--kind <kind>", "Filter target entity by kind")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .action(async (symbol: string, opts: { kind?: string; format: string }) => {
      const client = new IxClient(getEndpoint());
      const target = await resolveEntity(client, symbol, ["method", "function"], opts);
      if (!target) return;
      printResolved(target);
      const result = await client.expand(target.id, { direction: "in", predicates: ["CALLS"] });
      formatEdgeResults(result.nodes, "callers", target.name, opts.format);
    });

  program
    .command("callees <symbol>")
    .description("Show methods/functions called by the given symbol")
    .option("--kind <kind>", "Filter target entity by kind")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .action(async (symbol: string, opts: { kind?: string; format: string }) => {
      const client = new IxClient(getEndpoint());
      const target = await resolveEntity(client, symbol, ["method", "function"], opts);
      if (!target) return;
      printResolved(target);
      const result = await client.expand(target.id, { direction: "out", predicates: ["CALLS"] });
      formatEdgeResults(result.nodes, "callees", target.name, opts.format);
    });
}
