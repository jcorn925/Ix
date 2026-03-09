import type { Command } from "commander";
import chalk from "chalk";
import { IxClient } from "../../client/api.js";
import { getEndpoint, resolveWorkspaceRoot } from "../config.js";
import { detectStaleFiles } from "../stale.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show Ix backend health and status")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .option("--root <dir>", "Workspace root directory")
    .action(async (opts: { format: string; root?: string }) => {
      const client = new IxClient(getEndpoint());
      try {
        const health = await client.health();
        const root = resolveWorkspaceRoot(opts.root);

        // Detect stale files
        let staleInfo;
        try {
          staleInfo = await detectStaleFiles(client, root);
        } catch {
          staleInfo = null;
        }

        if (opts.format === "json") {
          const result: any = {
            backend: health.status,
            currentRev: staleInfo?.currentRev ?? null,
            lastIngestAt: staleInfo?.lastIngestAt ?? null,
            staleFiles: staleInfo?.staleFiles ?? 0,
            sampleChangedFiles: staleInfo?.sampleChangedFiles ?? [],
          };
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Ix Memory: ${health.status}`);
          console.log(`Endpoint:  ${getEndpoint()}`);
          if (staleInfo) {
            console.log(`Revision:  ${staleInfo.currentRev}`);
            if (staleInfo.lastIngestAt) {
              const ago = timeSince(staleInfo.lastIngestAt);
              console.log(`Last ingest: ${ago}`);
            }
            if (staleInfo.staleFiles > 0) {
              console.log(chalk.yellow(`\n⚠ ${staleInfo.staleFiles} file(s) changed since last ingest:`));
              for (const f of staleInfo.sampleChangedFiles) {
                console.log(`  ${chalk.dim(f)}`);
              }
              if (staleInfo.staleFiles > staleInfo.sampleChangedFiles.length) {
                console.log(chalk.dim(`  ... and ${staleInfo.staleFiles - staleInfo.sampleChangedFiles.length} more`));
              }
              console.log(chalk.dim("\nRun ix ingest to update."));
            } else {
              console.log(chalk.green("\nGraph is up to date."));
            }
          }
        }
      } catch (err) {
        console.error(`Ix backend not reachable at ${getEndpoint()}`);
        process.exit(1);
      }
    });
}

function timeSince(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
