import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Command } from "commander";
import chalk from "chalk";
import { IxClient } from "../../client/api.js";
import { getEndpoint, resolveWorkspaceRoot } from "../config.js";
import { formatLocateResults, type LocateResult } from "../format.js";
import type { ResultSource } from "../format.js";
import { isFileStale } from "../stale.js";
import { stderr } from "../stderr.js";

const execFileAsync = promisify(execFile);

export function registerLocateCommand(program: Command): void {
  program
    .command("locate <symbol>")
    .description("Find a symbol in code and resolve to graph entities")
    .option("--limit <n>", "Max text hits to check", "10")
    .option("--path <path>", "Prefer results from files matching this path substring")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .option("--root <dir>", "Workspace root directory")
    .action(async (symbol: string, opts: { limit: string; path?: string; format: string; root?: string }) => {
      const client = new IxClient(getEndpoint());
      const limit = parseInt(opts.limit, 10);
      const pathFilter = opts.path;

      // Step 1: Search the graph for matching entities
      const graphNodes = await client.search(symbol, { limit: 10 });

      // Step 2: Run ripgrep for text hits
      let textHits: Array<{ path: string; line: number }> = [];
      try {
        const rgArgs = [
          "--json", "--max-count", String(limit),
          "--no-heading", "--word-regexp",
        ];
        // If path filter provided, restrict ripgrep to that subtree
        const searchRoot = pathFilter
          ? resolveWorkspaceRoot(opts.root) + "/" + pathFilter
          : resolveWorkspaceRoot(opts.root);
        rgArgs.push(symbol, searchRoot);

        const { stdout } = await execFileAsync("rg", rgArgs, { maxBuffer: 10 * 1024 * 1024 });

        for (const line of stdout.split("\n")) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "match") {
              textHits.push({
                path: parsed.data.path?.text ?? "",
                line: parsed.data.line_number ?? 0,
              });
            }
          } catch { /* skip */ }
        }
      } catch (err: any) {
        if (err.code !== 1 && err.status !== 1 && err.code !== "ENOENT") throw err;
      }

      // Cap text hits to prevent oversized output
      textHits = textHits.slice(0, 10);

      // Step 3: Build results — graph entities first, then unmatched text hits
      let results: LocateResult[] = [];
      for (const node of graphNodes) {
        const n = node as any;
        results.push({
          kind: n.kind,
          id: n.id,
          name: n.attrs?.name ?? n.name ?? symbol,
          file: n.provenance?.source_uri ?? n.provenance?.sourceUri,
          source: "graph",
        });
      }

      // Apply path filter to graph results — put matching results first
      if (pathFilter) {
        const matching = results.filter(r => r.file?.includes(pathFilter));
        const nonMatching = results.filter(r => !r.file?.includes(pathFilter));
        results = [...matching, ...nonMatching];
      }

      // Add text-only hits that didn't match any graph entity
      const graphFiles = new Set(results.map(r => r.file).filter(Boolean));
      const seenPaths = new Set<string>();
      for (const hit of textHits) {
        if (!seenPaths.has(hit.path) && !graphFiles.has(hit.path)) {
          seenPaths.add(hit.path);
          results.push({
            kind: "text-match",
            name: symbol,
            file: hit.path,
            line: hit.line,
            source: "ripgrep",
          });
        }
      }

      const graphResults = results.filter(r => r.source === "graph");
      const textOnlyResults = results.filter(r => r.source === "ripgrep");

      const resultSource: ResultSource =
        graphResults.length > 0 && textOnlyResults.length > 0
          ? "graph+text"
          : graphResults.length > 0
            ? "graph"
            : "text";

      // Check staleness for the top result
      let stale = false;
      const topFile = results[0]?.file;
      if (topFile) {
        try { stale = await isFileStale(client, topFile); } catch {}
      }

      if (opts.format === "json") {
        const output: any = { results, resultSource };
        if (stale) {
          output.stale = true;
          output.warning = "Results may be stale; files have changed since last ingest.";
        }
        console.log(JSON.stringify(output, null, 2));
      } else {
        if (stale) stderr(chalk.yellow("⚠ Some results may be stale. Run ix ingest to update.\n"));
        if (results.length === 0) {
          console.log("No matches found.");
        } else {
          if (graphResults.length > 0) {
            console.log(chalk.dim("Graph results:"));
            formatLocateResults(graphResults, "text");
          }
          if (textOnlyResults.length > 0) {
            if (graphResults.length > 0) console.log();
            console.log(chalk.dim("Text results:"));
            formatLocateResults(textOnlyResults, "text");
          }
        }
      }
    });
}
