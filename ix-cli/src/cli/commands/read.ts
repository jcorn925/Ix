import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import { IxClient } from "../../client/api.js";
import { getEndpoint, resolveWorkspaceRoot } from "../config.js";
import { resolveEntity } from "../resolve.js";
import { stderr } from "../stderr.js";
import { isFileStale } from "../stale.js";

export function registerReadCommand(program: Command): void {
  program
    .command("read <target>")
    .description("Read source code — by file path, path:lines, or symbol name")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .option("--kind <kind>", "Filter symbol by kind")
    .option("--path <path>", "Prefer symbols from files matching this path substring")
    .option("--root <dir>", "Workspace root directory")
    .action(async (target: string, opts: { format: string; kind?: string; path?: string; root?: string }) => {
      // Check if target has a line range (path:start-end)
      const lineRangeMatch = target.match(/^(.+?):(\d+)-(\d+)$/);
      const rawPath = lineRangeMatch ? lineRangeMatch[1] : target;
      // Resolve relative paths against workspace root
      const filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(resolveWorkspaceRoot(opts.root), rawPath);

      // Try as a file path first
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        // Check staleness for direct file reads
        let stale = false;
        try {
          const client = new IxClient(getEndpoint());
          stale = await isFileStale(client, filePath);
        } catch { /* ignore — don't block read on staleness check */ }

        if (lineRangeMatch) {
          const start = parseInt(lineRangeMatch[2], 10) - 1;
          const end = parseInt(lineRangeMatch[3], 10);
          const slice = lines.slice(start, end);
          if (opts.format === "json") {
            const result: any = { file: filePath, lines: [start + 1, end], content: slice.join("\n") };
            if (stale) {
              result.stale = true;
              result.warning = "Results may be stale; file has changed since last ingest.";
            }
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (stale) stderr(chalk.yellow("⚠ File has changed since last ingest. Run ix ingest to update.\n"));
            for (let i = 0; i < slice.length; i++) {
              console.log(`${chalk.dim(String(start + i + 1).padStart(4))} ${slice[i]}`);
            }
          }
        } else {
          if (opts.format === "json") {
            const result: any = { file: filePath, lines: [1, lines.length], content };
            if (stale) {
              result.stale = true;
              result.warning = "Results may be stale; file has changed since last ingest.";
            }
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (stale) stderr(chalk.yellow("⚠ File has changed since last ingest. Run ix ingest to update.\n"));
            for (let i = 0; i < lines.length; i++) {
              console.log(`${chalk.dim(String(i + 1).padStart(4))} ${lines[i]}`);
            }
          }
        }
        return;
      }

      // Not a file path — resolve as a symbol from the graph
      const client = new IxClient(getEndpoint());
      const resolved = await resolveEntity(client, target, [
        "function", "method", "class", "trait", "object", "interface", "module", "file"
      ], opts);
      if (!resolved) {
        stderr(`Could not resolve symbol: ${target}`);
        return;
      }

      const details = await client.entity(resolved.id);
      const node = details.node as any;
      const sourceUri = node.provenance?.source_uri ?? node.provenance?.sourceUri;

      // Check staleness for resolved symbols
      let stale = false;
      if (sourceUri) {
        try { stale = await isFileStale(client, sourceUri); } catch {}
      }

      if (!sourceUri || !fs.existsSync(sourceUri)) {
        const content = node.attrs?.content;
        if (content) {
          if (opts.format === "json") {
            const result: any = { symbol: resolved.name, content };
            if (stale) {
              result.stale = true;
              result.warning = "Results may be stale; file has changed since last ingest.";
            }
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (stale) stderr(chalk.yellow("⚠ Source has changed since last ingest. Run ix ingest to update.\n"));
            console.log(content);
          }
          return;
        }
        stderr(`Source file not found: ${sourceUri ?? "(no provenance)"}`);
        return;
      }

      const fileContent = fs.readFileSync(sourceUri, "utf-8");
      const allLines = fileContent.split("\n");
      const lineStart = node.attrs?.lineStart ?? node.attrs?.line_start ?? 1;
      const lineEnd = node.attrs?.lineEnd ?? node.attrs?.line_end ?? allLines.length;

      if (opts.format === "json") {
        const result: any = {
          symbol: resolved.name,
          file: sourceUri,
          lines: [lineStart, lineEnd],
          content: allLines.slice(lineStart - 1, lineEnd).join("\n"),
        };
        if (stale) {
          result.stale = true;
          result.warning = "Results may be stale; file has changed since last ingest.";
        }
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (stale) stderr(chalk.yellow("⚠ Source has changed since last ingest. Run ix ingest to update.\n"));
        console.log(chalk.dim(`  ${sourceUri}:${lineStart}-${lineEnd}`));
        console.log();
        for (let i = lineStart - 1; i < lineEnd && i < allLines.length; i++) {
          console.log(`${chalk.dim(String(i + 1).padStart(4))} ${allLines[i]}`);
        }
      }
    });
}
