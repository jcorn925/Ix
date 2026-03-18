import type { Command } from "commander";
import chalk from "chalk";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";
import { resolveFileOrEntity, printResolved } from "../resolve.js";
import { isFileStale } from "../stale.js";
import { stderr } from "../stderr.js";
import { getSystemPath, hasMapData } from "../hierarchy.js";

const CONTAINER_KINDS = new Set(["class", "module", "file", "trait", "object", "interface"]);

interface LocateOutput {
  resolvedTarget: { id: string; kind: string; name: string; path?: string } | null;
  resolutionMode: string;
  lineRange?: { start: number; end: number };
  container?: { kind: string; name: string; id?: string };
  systemPath: Array<{ name: string; kind: string }> | null;
  hasMapData?: boolean;
  stale?: boolean;
  diagnostics: string[];
}

export function registerLocateCommand(program: Command): void {
  program
    .command("locate <symbol>")
    .description("Resolve a symbol to its position in the codebase and system hierarchy")
    .option("--kind <kind>", "Filter target entity by kind")
    .option("--path <path>", "Prefer results from files matching this path substring")
    .option("--pick <n>", "Pick Nth candidate from ambiguous results (1-based)")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .addHelpText("after", `\nExamples:
  ix locate IngestionService
  ix locate verify_token --kind function
  ix locate ArangoClient --format json
  ix locate scoreCandidate --pick 2`)
    .action(async (symbol: string, opts: { kind?: string; path?: string; pick?: string; format: string }) => {
      const client = new IxClient(getEndpoint());
      const diagnostics: string[] = [];

      const resolveOpts = { kind: opts.kind, path: opts.path, pick: opts.pick ? parseInt(opts.pick, 10) : undefined };
      const target = await resolveFileOrEntity(client, symbol, resolveOpts);

      if (!target) {
        const output: LocateOutput = {
          resolvedTarget: null,
          resolutionMode: "none",
          systemPath: null,
          diagnostics: ["No graph entity found."],
        };
        outputLocate(output, symbol, opts.format);
        return;
      }

      if (opts.format !== "json") printResolved(target);

      const isContainer = CONTAINER_KINDS.has(target.kind);

      // Parallel fetch: system path, parent container (for non-containers), entity details
      const [systemPath, containsResult, details] = await Promise.all([
        getSystemPath(client, target.id),
        isContainer
          ? Promise.resolve({ nodes: [] })
          : client.expand(target.id, { direction: "in", predicates: ["CONTAINS"] }),
        client.entity(target.id),
      ]);

      const node = details.node as any;
      const nodePath = node.provenance?.source_uri ?? node.provenance?.sourceUri ?? undefined;

      // Extract line range from attrs
      const lineStart = node.attrs?.line_start ?? node.attrs?.lineStart;
      const lineEnd = node.attrs?.line_end ?? node.attrs?.lineEnd;
      const lineRange = lineStart != null && lineEnd != null
        ? { start: Number(lineStart), end: Number(lineEnd) }
        : undefined;

      // Check staleness
      let stale = false;
      if (nodePath) {
        try { stale = await isFileStale(client, nodePath); } catch {}
      }

      // Container context (parent for callables)
      let container: LocateOutput["container"];
      if (!isContainer && containsResult.nodes.length > 0) {
        const c = containsResult.nodes[0] as any;
        container = {
          kind: c.kind || "unknown",
          name: c.name || c.attrs?.name || "(unknown)",
          id: c.id,
        };
      }

      // Diagnostic for missing map data
      if (!hasMapData(systemPath)) {
        diagnostics.push("No system map. Run `ix map` to see hierarchy.");
      }

      const hasMap = hasMapData(systemPath);

      const output: LocateOutput = {
        resolvedTarget: {
          id: target.id,
          kind: target.kind,
          name: target.name,
          path: nodePath,
        },
        resolutionMode: target.resolutionMode,
        lineRange,
        container,
        systemPath: systemPath.map((n) => ({ name: n.name, kind: n.kind })),
        hasMapData: hasMap,
        diagnostics,
      };
      if (stale) {
        output.stale = true;
      }

      outputLocate(output, symbol, opts.format);
    });
}

function outputLocate(output: LocateOutput, symbol: string, format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (output.stale) stderr(chalk.yellow("⚠ Some results may be stale. Run ix ingest to update.\n"));

  if (!output.resolvedTarget) {
    stderr(`No graph entity found for "${symbol}".`);
    console.log("No matches found.");
    return;
  }

  const t = output.resolvedTarget;

  // Location section
  const hasLocation = t.path || output.lineRange || output.container;
  if (hasLocation) {
    console.log(chalk.bold("\nLocation"));
    if (t.path) {
      console.log(`  ${chalk.dim("File:".padEnd(16))}${t.path}`);
    }
    if (output.lineRange) {
      console.log(`  ${chalk.dim("Lines:".padEnd(16))}${output.lineRange.start}-${output.lineRange.end}`);
    }
    if (output.container) {
      console.log(`  ${chalk.dim("Contained in:".padEnd(16))}${output.container.name}`);
    }
  }

  // System path section
  if (output.systemPath && output.systemPath.length > 1 && output.hasMapData) {
    const breadcrumb = output.systemPath.map((n) => n.name).join(" → ");
    console.log(chalk.bold("\nSystem path"));
    console.log(`  ${breadcrumb}`);
  }

  // Diagnostics
  for (const d of output.diagnostics) {
    stderr(chalk.dim(`  ${d}`));
  }
}
