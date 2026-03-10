import type { Command } from "commander";

const WORKFLOWS_TEXT = `
Recommended Development Loop:

  1. ix briefing                          Resume context
  2. ix overview <target>                 Understand a component
  3. ix impact <target>                   Check blast radius before changes
  4. ix rank --by callers --kind method   Find hotspots
  5. ix plan next <id> --with-workflow    Get next task with commands

Bug Workflow:
  ix bugs --status open                   See open bugs
  ix bug show <id>                        Get bug details
  ix plan create "Fix X" --goal <id> --responds-to <bugId>
  ix plan task "Step 1" --plan <id> --resolves <bugId>

Decision Recording:
  ix decide "Use X" --rationale "..." --affects Entity

Task Listing:
  ix tasks                                List all tasks
  ix tasks --status pending               Only pending tasks
  ix tasks --plan <id>                    Tasks in a specific plan
`;

export function registerWorkflowsHelpCommand(program: Command): void {
  const help = program
    .command("help [topic]")
    .description("Additional help topics")
    .action((topic: string | undefined) => {
      if (!topic) {
        // ix help — show full program help
        program.outputHelp();
        return;
      }

      if (topic === "workflows") {
        console.log(WORKFLOWS_TEXT);
        return;
      }

      // Look up the topic as a registered command and show its help
      const cmd = program.commands.find(
        (c: Command) => c.name() === topic
      );
      if (cmd) {
        cmd.outputHelp();
      } else {
        console.error(`Unknown help topic: "${topic}". Try "ix --help" for available commands.`);
        process.exitCode = 1;
      }
    });
}
