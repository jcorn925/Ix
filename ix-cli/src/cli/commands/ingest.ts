import type { Command } from "commander";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";

export function registerIngestCommand(program: Command): void {
  program
    .command("ingest <path>")
    .description("Ingest source files into the knowledge graph")
    .option("--recursive", "Recursively ingest directory")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .action(async (path: string, opts: { recursive?: boolean; format: string }) => {
      const client = new IxClient(getEndpoint());
      const start = performance.now();
      const result = await client.ingest(path, opts.recursive);
      const elapsed = ((performance.now() - start) / 1000).toFixed(2);
      if (opts.format === "json") {
        console.log(JSON.stringify({ ...result, elapsedSeconds: parseFloat(elapsed) }, null, 2));
      } else {
        console.log(`Ingested: ${result.filesProcessed} files, ${result.patchesApplied} patches applied (${elapsed}s)`);
        if (result.filesSkipped) {
          console.log(`Skipped:  ${result.filesSkipped} unchanged files`);
        }
        console.log(`Rev:      ${result.latestRev}`);
      }
    });
}
