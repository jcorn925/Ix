import type { Command } from "commander";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";
import chalk from "chalk";

interface BriefingGoal {
  id: string;
  name: string;
}

interface BriefingPlan {
  id: string;
  name: string;
  taskSummary: { total: number; done: number; pending: number };
  nextTask: string | null;
}

interface BriefingBug {
  id: string;
  title: string;
  severity: string;
  status: string;
}

interface BriefingDecision {
  id: string;
  name: string;
  rationale: string;
}

interface BriefingChange {
  patchId: string;
  intent: string | null;
  rev: number;
  timestamp: string | null;
}

interface BriefingFreshness {
  lastIngestAt: string | null;
  ageMinutes: number | null;
  stale: boolean;
}

export interface BriefingResult {
  lastIngestAt: string | null;
  revision: number | null;
  freshness: BriefingFreshness;
  goalCount: number;
  activeGoals: BriefingGoal[];
  activePlans: BriefingPlan[];
  openBugs: BriefingBug[];
  recentDecisions: BriefingDecision[];
  recentChanges: BriefingChange[];
  conflicts: unknown[];
  diagnostics: string[];
}

export async function buildBriefing(
  client: IxClient,
  opts: { activeOnly?: boolean } = {}
): Promise<BriefingResult> {
  const diagnostics: string[] = [];

  // Fetch all data sources in parallel
  const [healthResult, goals, plans, bugs, decisions, patches, conflicts] =
    await Promise.all([
      client.health().catch(() => {
        diagnostics.push("health endpoint unreachable");
        return null;
      }),
      client.listByKind("intent", { limit: 50 }).catch(() => {
        diagnostics.push("could not list goals");
        return [] as any[];
      }),
      client.listByKind("plan", { limit: 50 }).catch(() => {
        diagnostics.push("could not list plans");
        return [] as any[];
      }),
      client.listByKind("bug", { limit: 50 }).catch(() => {
        diagnostics.push("could not list bugs");
        return [] as any[];
      }),
      client.listDecisions({ limit: 5 }).catch(() => {
        diagnostics.push("could not list decisions");
        return [] as any[];
      }),
      client.listPatches({ limit: 10 }).catch(() => {
        diagnostics.push("could not list patches");
        return [] as any[];
      }),
      client.conflicts().catch(() => {
        diagnostics.push("could not check conflicts");
        return [] as unknown[];
      }),
    ]);

  // Extract last ingest time and revision from patches
  let lastIngestAt: string | null = null;
  let revision: number | null = null;
  if (patches.length > 0) {
    const latest = patches[0] as any;
    lastIngestAt = latest.timestamp ?? null;
    revision = latest.rev ?? null;
  }

  // Compute freshness
  let ageMinutes: number | null = null;
  let stale = false;
  if (lastIngestAt) {
    const ingestDate = new Date(lastIngestAt);
    const now = new Date();
    ageMinutes = Math.round((now.getTime() - ingestDate.getTime()) / 60000);
    stale = ageMinutes > 60;
  }
  const freshness: BriefingFreshness = { lastIngestAt, ageMinutes, stale };

  // Map goals
  const allGoals: BriefingGoal[] = goals.map((g: any) => ({
    id: g.id,
    name: g.name ?? g.attrs?.statement ?? "(unnamed)",
  }));
  const goalCount = allGoals.length;

  // Map bugs — filter to open/investigating only
  const openBugs: BriefingBug[] = bugs
    .filter((b: any) => {
      const status = b.attrs?.status ?? "open";
      return status === "open" || status === "investigating";
    })
    .map((b: any) => ({
      id: b.id,
      title: b.name,
      severity: b.attrs?.severity ?? "medium",
      status: b.attrs?.status ?? "open",
    }));

  // Map decisions
  const recentDecisions: BriefingDecision[] = decisions.map((d: any) => ({
    id: d.id,
    name: d.name ?? d.title ?? "(unnamed)",
    rationale: d.attrs?.rationale ?? d.rationale ?? "",
  }));

  // Map patches/changes with timestamp
  const recentChanges: BriefingChange[] = patches.map((p: any) => ({
    patchId: p.patch_id ?? p.patchId ?? p.id,
    intent: p.intent ?? null,
    rev: p.rev ?? 0,
    timestamp: p.timestamp ?? null,
  }));

  // Enrich plans with task summaries (up to 5 plans)
  const activePlans: BriefingPlan[] = [];
  const plansToProcess = plans.slice(0, 5);

  // Track which plans have pending tasks (for activeOnly goal filtering)
  const plansWithPendingTasks = new Set<string>();

  for (const plan of plansToProcess) {
    try {
      const { nodes: taskNodes } = await client.expand(plan.id, {
        direction: "out",
        predicates: ["PLAN_HAS_TASK"],
      });

      const tasks = taskNodes.filter((n: any) => n.kind === "task");
      let doneCount = 0;
      let pendingCount = 0;
      let nextTask: string | null = null;

      // Get status for each task
      const doneIds = new Set<string>();
      const taskDetails: { id: string; name: string; status: string; dependsOn: string[] }[] = [];

      for (const t of tasks) {
        const detail = await client.entity(t.id);
        const statusClaim = detail.claims?.find(
          (c: any) => c.field === "status" || c.statement?.includes("status")
        );
        let status = "pending";
        if (statusClaim) {
          const val = (statusClaim as any).value ?? (statusClaim as any).statement;
          if (typeof val === "string") status = val;
        } else if (detail.node?.attrs?.status) {
          status = detail.node.attrs.status as string;
        }

        if (status === "done") {
          doneCount++;
          doneIds.add(t.id);
        } else if (status === "pending") {
          pendingCount++;
        }

        const { edges: depEdges } = await client.expand(t.id, {
          direction: "out",
          predicates: ["DEPENDS_ON"],
        });
        taskDetails.push({
          id: t.id,
          name: t.name,
          status,
          dependsOn: depEdges.map((e: any) => e.dst as string),
        });
      }

      if (pendingCount > 0) {
        plansWithPendingTasks.add(plan.id);
      }

      // Find next actionable
      const actionable = taskDetails.find(
        (t) =>
          t.status !== "done" &&
          t.status !== "abandoned" &&
          t.dependsOn.every((dep) => doneIds.has(dep))
      );
      if (actionable) nextTask = actionable.name;

      activePlans.push({
        id: plan.id,
        name: plan.name ?? "(unnamed)",
        taskSummary: { total: tasks.length, done: doneCount, pending: pendingCount },
        nextTask,
      });
    } catch {
      activePlans.push({
        id: plan.id,
        name: plan.name ?? "(unnamed)",
        taskSummary: { total: 0, done: 0, pending: 0 },
        nextTask: null,
      });
    }
  }

  // Filter goals if --active-only
  let activeGoals = allGoals;
  if (opts.activeOnly) {
    // For each goal (up to 20), check if it has at least one plan with pending tasks
    const goalsToCheck = allGoals.slice(0, 20);
    const activeGoalIds = new Set<string>();

    for (const goal of goalsToCheck) {
      try {
        const { nodes: goalPlans } = await client.expand(goal.id, {
          direction: "out",
          predicates: ["GOAL_HAS_PLAN"],
        });
        for (const gp of goalPlans) {
          if (plansWithPendingTasks.has(gp.id)) {
            activeGoalIds.add(goal.id);
            break;
          }
        }
      } catch {
        // If we can't expand, include it to be safe
        activeGoalIds.add(goal.id);
      }
    }
    activeGoals = allGoals.filter((g) => activeGoalIds.has(g.id));
  }

  return {
    lastIngestAt,
    revision,
    freshness,
    goalCount,
    activeGoals,
    activePlans,
    openBugs,
    recentDecisions,
    recentChanges,
    conflicts,
    diagnostics,
  };
}

export function registerBriefingCommand(program: Command): void {
  program
    .command("briefing")
    .description("Session-resume briefing — aggregated project status")
    .option("--active-only", "Only show goals with active plans (plans with pending tasks)")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .action(async (opts: { activeOnly?: boolean; format: string }) => {
      const client = new IxClient(getEndpoint());
      const briefing = await buildBriefing(client, { activeOnly: opts.activeOnly });

      if (opts.format === "json") {
        console.log(JSON.stringify(briefing, null, 2));
      } else {
        // Header
        console.log(chalk.bold("Ix Briefing"));
        if (briefing.revision !== null) {
          console.log(chalk.dim(`  Revision: ${briefing.revision}`));
        }
        if (briefing.lastIngestAt) {
          console.log(chalk.dim(`  Last ingest: ${briefing.lastIngestAt}`));
        }

        // Freshness warning
        if (briefing.freshness.stale) {
          const ageStr = briefing.freshness.ageMinutes! >= 60
            ? `${Math.round(briefing.freshness.ageMinutes! / 60)}h ago`
            : `${briefing.freshness.ageMinutes}m ago`;
          console.log(chalk.yellow(`  \u26A0 Graph is stale (last ingest: ${ageStr})`));
        }

        // Goals
        if (briefing.activeGoals.length > 0) {
          const countLabel = briefing.goalCount !== briefing.activeGoals.length
            ? ` (${briefing.activeGoals.length} of ${briefing.goalCount})`
            : ` (${briefing.activeGoals.length})`;
          console.log(`\n${chalk.bold("Goals")}${countLabel}`);
          for (const g of briefing.activeGoals) {
            console.log(`  ${chalk.cyan("\u25C6")} ${g.name}`);
          }
        }

        // Plans
        if (briefing.activePlans.length > 0) {
          console.log(`\n${chalk.bold("Plans")} (${briefing.activePlans.length})`);
          for (const p of briefing.activePlans) {
            const { done, total } = p.taskSummary;
            console.log(`  ${chalk.cyan("\u25B8")} ${p.name} ${chalk.dim(`(${done}/${total} done)`)}`);
            if (p.nextTask) {
              console.log(`    ${chalk.green("Next:")} ${p.nextTask}`);
            }
          }
        }

        // Bugs
        if (briefing.openBugs.length > 0) {
          console.log(`\n${chalk.bold("Open Bugs")} (${briefing.openBugs.length})`);
          for (const b of briefing.openBugs) {
            const sev = b.severity === "critical" || b.severity === "high"
              ? chalk.red(b.severity)
              : chalk.yellow(b.severity);
            console.log(`  ${chalk.red("\u25CB")} ${b.title} ${chalk.dim(`[${sev}]`)}`);
          }
        }

        // Decisions
        if (briefing.recentDecisions.length > 0) {
          console.log(`\n${chalk.bold("Recent Decisions")} (${briefing.recentDecisions.length})`);
          for (const d of briefing.recentDecisions) {
            console.log(`  ${chalk.magenta("\u25C7")} ${d.name}`);
            if (d.rationale) {
              console.log(`    ${chalk.dim(d.rationale.slice(0, 80))}`);
            }
          }
        }

        // Changes
        if (briefing.recentChanges.length > 0) {
          console.log(`\n${chalk.bold("Recent Changes")} (${briefing.recentChanges.length})`);
          for (const c of briefing.recentChanges) {
            const label = c.intent ?? chalk.dim("(no intent)");
            console.log(`  rev ${chalk.dim(String(c.rev))} ${label}`);
          }
        }

        // Conflicts
        if (briefing.conflicts.length > 0) {
          console.log(`\n${chalk.red.bold("Conflicts")} (${briefing.conflicts.length})`);
          for (const c of briefing.conflicts as any[]) {
            console.log(`  ${chalk.red("\u26A0")} ${c.reason ?? JSON.stringify(c)}`);
          }
        }

        // Diagnostics
        if (briefing.diagnostics.length > 0) {
          console.log(`\n${chalk.yellow("Diagnostics:")}`);
          for (const d of briefing.diagnostics) {
            console.log(`  ${chalk.yellow("!")} ${d}`);
          }
        }
      }
    });
}
