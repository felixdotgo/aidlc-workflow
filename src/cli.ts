#!/usr/bin/env node
import { applyPlan, detectedAgents, doctor, formatPlan, planInit, selectAgents, status } from "./installer.js";
import type { AgentId, InitOptions } from "./model.js";

const usage = `Usage:\n  aidlc init [path] --agent <name[,name]> [--yes] [--dry-run] [--force]\n  aidlc init [path] --all [--yes] [--dry-run] [--force]\n  aidlc status [path]\n  aidlc doctor [path]`;

const parse = (argv: string[]) => {
  const [command = "help", ...rest] = argv;
  let root = ".";
  let agents: AgentId[] = [];
  let all = false;
  let dryRun = false;
  let yes = false;
  let force = false;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--agent") agents = (rest[++index] ?? "").split(",").filter(Boolean) as AgentId[];
    else if (token === "--all") all = true;
    else if (token === "--dry-run") dryRun = true;
    else if (token === "--yes") yes = true;
    else if (token === "--force") force = true;
    else if (!token.startsWith("-")) root = token;
    else throw new Error(`Unknown option: ${token}`);
  }
  return { command, options: { root, agents, all, dryRun, yes, force } satisfies InitOptions };
};

const main = (): void => {
  const { command, options } = parse(process.argv.slice(2));
  if (command === "help" || command === "--help") return void console.log(usage);
  if (command === "status") return void console.log(status(options.root));
  if (command === "doctor") return void console.log(doctor(options.root));
  if (command !== "init") throw new Error(`Unknown command: ${command}`);
  const selected = selectAgents(options);
  if (!selected.length) {
    const detected = detectedAgents(options.root);
    throw new Error(`Choose --agent <name> or --all. Detected: ${detected.join(", ") || "none"}`);
  }
  const plan = planInit(options);
  console.log(formatPlan(plan));
  if (plan.some((item) => item.action === "conflict")) throw new Error("No files were written because the plan contains conflicts.");
  if (options.dryRun || !options.yes) {
    console.log(options.dryRun ? "Dry run: no files were written." : "Preview only: rerun with --yes to apply this plan.");
    return;
  }
  applyPlan(options.root, plan);
  console.log("Installed local AI-DLC workflow assets.");
};

try {
  main();
} catch (error) {
  console.error(`aidlc: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
