import chalk from "chalk";

const OSS_HELP = [
  `${chalk.cyan("ix")} — Code Memory CLI`,
  ``,
  chalk.bold(`Start:`),
  `  map [path]            Map the architectural hierarchy of a codebase`,
  `  watch                 Watch files and auto-ingest on change`,
  `  config                Show or update configuration`,
  ``,
  chalk.bold(`Understand:`),
  `  search <term>         Search the knowledge graph by term`,
  `  locate <symbol>       Resolve symbol to definition with context`,
  `  explain <symbol>      Explain an entity with history`,
  `  impact <target>       Blast-radius / dependency analysis`,
  `  overview <target>     One-shot structural summary`,
  `  read <target>         Read file content or symbol source code`,
  ``,
  chalk.bold(`Explore:`),
  `  trace <symbol>        Follow how a symbol connects upstream and downstream`,
  `  inventory             List entities by kind`,
  `  rank                  Hotspot discovery by metric`,
  `  history <entityId>    Show entity provenance chain`,
  `  diff <from> <to>      Show diff between revisions`,
  ``,
  chalk.bold(`System:`),
  `  status                Show backend health`,
  `  stats                 Show graph statistics`,
  `  doctor                Check system health`,
  `  docker <action>       Manage the IX backend containers`,
  `  reset                 Wipe all graph data for a clean re-ingest`,
  `  upgrade               Upgrade ix CLI and backend to the latest version`,
  ``,
].join("\n");

const FOOTER = `Use "ix help advanced" for low-level graph commands.
Use "ix <command> --help" for details on any command.
`;

export function buildHelpText(
  proCommands?: { name: string; desc: string }[],
): string {
  let text = OSS_HELP;

  if (proCommands && proCommands.length > 0) {
    text += "\nPro:\n";
    for (const { name, desc } of proCommands) {
      text += `  ${name.padEnd(20)}${desc}\n`;
    }
    text += "\n";
  }

  text += FOOTER;
  return text;
}
