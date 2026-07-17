#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { installableAdapters } from "./adapters.js";
import { applyPlan, detectedAgents, doctor, formatPlan, planInit, planUninstall, selectAgents, status } from "./installer.js";
import type { AgentId, InitOptions } from "./model.js";

const usage = `Usage:\n  aidlc init [path] [--agent <name[,name]> | --all] [--yes] [--dry-run] [--force]\n  aidlc uninstall [path] [--yes] [--dry-run]\n  aidlc status [path]\n  aidlc doctor [path]`;

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

const interactive = (): boolean => Boolean(stdin.isTTY && stdout.isTTY);

const question = async (prompt: string): Promise<string> => {
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    return await readline.question(prompt);
  } finally {
    readline.close();
  }
};

const chooseAgents = async (options: InitOptions): Promise<InitOptions> => {
  const selected = selectAgents(options);
  if (selected.length) return { ...options, agents: selected };
  const detected = detectedAgents(options.root);
  if (detected.length === 1) {
    console.log(`Auto-selected detected agent: ${detected[0]}`);
    return { ...options, agents: detected };
  }
  if (!interactive()) throw new Error(`Unable to select an agent automatically. Use --agent <name> or --all. Detected: ${detected.join(", ") || "none"}`);
  const choices = installableAdapters();
  console.log("Select one or more agents (comma-separated numbers):");
  for (const [index, adapter] of choices.entries()) console.log(`  ${index + 1}. ${adapter.displayName}${detected.includes(adapter.id) ? " (detected)" : ""}`);
  const answer = await question("> ");
  const indexes = answer.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value >= 1 && value <= choices.length);
  const agents = [...new Set(indexes.map((index) => choices[index - 1].id))];
  if (!agents.length) throw new Error("Choose at least one listed agent, or rerun with --agent <name> or --all.");
  return { ...options, agents };
};

const showPreview = (operation: string, plan: ReturnType<typeof planInit>): void => {
  const updates = plan.filter((item) => item.action === "update" || item.action === "delete").length;
  console.log(`=== ${operation} preview — changes have NOT been applied ===`);
  if (updates) console.log(`WARNING: ${updates} existing file(s) will be changed or removed if you confirm.`);
  console.log(formatPlan(plan));
};

const confirm = async (options: InitOptions, operation: string): Promise<boolean> => {
  if (options.dryRun) {
    console.log("Dry run: changes have NOT been applied.");
    return false;
  }
  if (options.yes) return true;
  if (!interactive()) {
    console.log("Preview only: changes have NOT been applied. Rerun with --yes to apply this plan.");
    return false;
  }
  return /^(y|yes)$/i.test((await question(`${operation} this plan? This may change or remove existing files. [y/N] `)).trim());
};

const main = async (): Promise<void> => {
  const { command, options } = parse(process.argv.slice(2));
  if (command === "help" || command === "--help") return void console.log(usage);
  if (command === "status") return void console.log(status(options.root));
  if (command === "doctor") return void console.log(doctor(options.root));
  if (command === "init") {
    const selectedOptions = await chooseAgents(options);
    const plan = planInit(selectedOptions);
    showPreview("INIT", plan);
    if (plan.some((item) => item.action === "conflict")) throw new Error("No files were written because the plan contains conflicts.");
    if (!await confirm(selectedOptions, "Apply")) return;
    applyPlan(selectedOptions.root, plan);
    console.log("Installed local AI-DLC workflow assets.");
    return;
  }
  if (command === "uninstall") {
    const plan = planUninstall(options.root);
    showPreview("UNINSTALL", plan);
    if (!plan.some((item) => item.action === "update" || item.action === "delete")) {
      console.log("Nothing eligible for removal; preserved files were left untouched.");
      return;
    }
    if (!await confirm(options, "Remove")) return;
    applyPlan(options.root, plan);
    console.log("Removed eligible local AI-DLC workflow assets. The task board was preserved.");
    return;
  }
  throw new Error(`Unknown command: ${command}`);
};

main().catch((error: unknown) => {
  console.error(`aidlc: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
