import type { Command } from "commander";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";
import { formatExplain, type ExplainResult } from "../format.js";
import { resolveEntity } from "../resolve.js";

export function registerExplainCommand(program: Command): void {
  program
    .command("explain <symbol>")
    .description("Explain an entity — shows structure, container, and history")
    .option("--kind <kind>", "Filter target entity by kind")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .action(async (symbol: string, opts: { kind?: string; format: string }) => {
      const client = new IxClient(getEndpoint());
      const target = await resolveEntity(client, symbol, ["class", "function", "method", "trait", "object", "interface", "module", "file"], opts);
      if (!target) return;

      const details = await client.entity(target.id);

      let history: any = { entityId: target.id, chain: [] };
      try {
        history = await client.provenance(target.id);
      } catch { /* no history */ }

      const edges = (details.edges ?? []) as any[];
      const containsEdge = edges.find((e: any) =>
        (e.predicate === "CONTAINS" || e.predicate === "DEFINES") && e.dst === target.id
      );
      let container: any = undefined;
      if (containsEdge) {
        try {
          const containerDetails = await client.entity(containsEdge.src);
          container = containerDetails.node;
        } catch { /* no container */ }
      }

      const callEdges = edges.filter((e: any) => e.predicate === "CALLS");
      const containedEdges = edges.filter((e: any) =>
        (e.predicate === "CONTAINS" || e.predicate === "DEFINES") && e.src === target.id
      );

      const node = details.node as any;
      const result: ExplainResult = {
        kind: node.kind,
        name: node.name || node.attrs?.name || target.name,
        id: target.id,
        file: node.provenance?.source_uri ?? node.provenance?.sourceUri,
        container: container ? { kind: container.kind, name: container.name || container.attrs?.name || "(unknown)" } : undefined,
        introducedRev: node.createdRev ?? node.created_rev,
        calledBy: callEdges.filter((e: any) => e.dst === target.id).length,
        calls: callEdges.filter((e: any) => e.src === target.id).length,
        contains: containedEdges.length,
        historyLength: (history as any)?.chain?.length ?? 0,
      };

      formatExplain(result, opts.format);
    });
}
