import type { Command } from "commander";
import { IxClient } from "../../client/api.js";
import { getEndpoint } from "../config.js";
import { formatIntents } from "../format.js";

export function registerGoalCommand(program: Command): void {
  const goal = program
    .command("goal")
    .description("Manage project goals (aliases for ix truth)")
    .addHelpText(
      "after",
      `\nSubcommands:
  create <statement>  Create a new goal
  list                List all goals

Examples:
  ix goal create "Support GitHub ingestion"
  ix goal list --format json
  ix goal list --status active --format json`
    );

  goal
    .command("create <statement>")
    .description("Create a new goal")
    .option("--parent <id>", "Parent goal ID")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .action(async (statement: string, opts: { parent?: string; format: string }) => {
      const client = new IxClient(getEndpoint());
      const result = await client.createTruth(statement, opts.parent);
      if (opts.format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Goal created: ${result.nodeId} (rev ${result.rev})`);
      }
    });

  goal
    .command("list")
    .description("List all goals")
    .option("--status <status>", "Filter by status (active|all)", "all")
    .option("--format <fmt>", "Output format (text|json)", "text")
    .action(async (opts: { status: string; format: string }) => {
      const client = new IxClient(getEndpoint());
      let intents = await client.listTruth();

      if (opts.status === "active") {
        // Filter to goals that have at least one plan with pending tasks
        const activeGoalIds = new Set<string>();
        const goalsToCheck = intents.slice(0, 20);

        for (const intent of goalsToCheck) {
          try {
            const { nodes: goalPlans } = await client.expand(intent.id, {
              direction: "out",
              predicates: ["GOAL_HAS_PLAN"],
            });
            for (const plan of goalPlans) {
              const { nodes: taskNodes } = await client.expand(plan.id, {
                direction: "out",
                predicates: ["PLAN_HAS_TASK"],
              });
              const hasPending = taskNodes.some(
                (t: any) => t.kind === "task" && (t.attrs?.status ?? "pending") === "pending"
              );
              if (hasPending) {
                activeGoalIds.add(intent.id);
                break;
              }
            }
          } catch {
            // Include on error to be safe
            activeGoalIds.add(intent.id);
          }
        }
        intents = intents.filter((i: any) => activeGoalIds.has(i.id));
      }

      formatIntents(intents, opts.format);
    });
}
