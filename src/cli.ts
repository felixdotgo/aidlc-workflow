#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { installableAdapters } from "./adapters.js";
import { runEvaluation } from "./eval.js";
import { applyPlan, detectedAgents, doctor, formatPlan, planInit, planUninstall, selectAgents, status } from "./installer.js";
import type { AgentId, InitOptions } from "./model.js";
import { loadProjectConfig, resolveProfiles } from "./profiles.js";
import { verifyReleaseEvidence } from "./release.js";
import { applyUpgrade, planUpgrade } from "./upgrade.js";
import { packageVersion } from "./workflow.js";

const usage = `Usage:
  npx @felixdotgo/aidlc-workflow init [path] [--agent <name[,name]> | --all] [--yes] [--dry-run] [--force]
  npx @felixdotgo/aidlc-workflow upgrade [path] [--dry-run]
  npx @felixdotgo/aidlc-workflow uninstall [path] [--yes] [--dry-run]
  npx @felixdotgo/aidlc-workflow status [path]
  npx @felixdotgo/aidlc-workflow doctor [path] [--strict]
  npx @felixdotgo/aidlc-workflow profile validate [path]
  npx @felixdotgo/aidlc-workflow eval run --runner <id> [path]
  npx @felixdotgo/aidlc-workflow eval verify-release [evidence.json]`;

const interactive = (): boolean => Boolean(stdin.isTTY && stdout.isTTY);

const question = async (prompt: string): Promise<string> => {
  const readline = createInterface({ input: stdin, output: stdout });
  try { return await readline.question(prompt); } finally { readline.close(); }
};

const value = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};

const flags = (args: string[]): Set<string> => new Set(args.filter((item) => item.startsWith("--")));
const valueFlags = new Set(["--agent", "--runner"]);
const positional = (args: string[]): string[] => {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (valueFlags.has(args[index])) { index += 1; continue; }
    if (!args[index].startsWith("--")) result.push(args[index]);
  }
  return result;
};
const rootArg = (args: string[], fallback = "."): string => positional(args).find((item) => item !== "init" && item !== "upgrade" && item !== "uninstall" && item !== "status" && item !== "doctor" && item !== "validate" && item !== "run") ?? fallback;

const initOptions = (args: string[]): InitOptions => ({
  root: rootArg(args),
  agents: (value(args, "--agent") ?? "").split(",").filter(Boolean) as AgentId[],
  all: flags(args).has("--all"),
  dryRun: flags(args).has("--dry-run"),
  yes: flags(args).has("--yes"),
  force: flags(args).has("--force")
});

const chooseAgents = async (options: InitOptions): Promise<InitOptions> => {
  const selected = selectAgents(options);
  if (selected.length) return { ...options, agents: selected };
  const detected = detectedAgents(options.root);
  if (detected.length === 1) return { ...options, agents: detected };
  if (!interactive()) throw new Error(`Unable to select an agent automatically. Use --agent <name> or --all. Detected: ${detected.join(", ") || "none"}`);
  const choices = installableAdapters();
  console.log("Select one or more agents (comma-separated numbers):");
  choices.forEach((adapter, index) => console.log(`  ${index + 1}. ${adapter.displayName}${detected.includes(adapter.id) ? " (detected)" : ""}`));
  const answer = await question("> ");
  const indexes = answer.split(",").map((entry) => Number(entry.trim())).filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= choices.length);
  const agents = [...new Set(indexes.map((index) => choices[index - 1].id))];
  if (!agents.length) throw new Error("Choose at least one listed agent");
  return { ...options, agents };
};

const preview = (operation: string, plan: ReturnType<typeof planInit>): void => {
  console.log(`=== ${operation} preview — changes have NOT been applied ===`);
  console.log(formatPlan(plan));
};

const confirmGeneral = async (options: InitOptions, operation: string): Promise<boolean> => {
  if (options.dryRun) return false;
  if (options.yes) return true;
  if (!interactive()) return false;
  return /^(y|yes)$/i.test((await question(`${operation} this plan? [y/N] `)).trim());
};

const main = async (): Promise<void> => {
  const [command = "help", ...args] = process.argv.slice(2);
  if (command === "help" || command === "--help") return void console.log(usage);
  if (command === "status") return void console.log(status(rootArg(args)));
  if (command === "doctor") {
    const result = doctor(rootArg(args), flags(args).has("--strict"));
    console.log(result); if (result.startsWith("ERROR:")) process.exitCode = 1; return;
  }
  if (command === "init") {
    const options = await chooseAgents(initOptions(args)); const plan = planInit(options); preview("INIT", plan);
    if (plan.some((item) => item.action === "conflict")) throw new Error("No files were written because the plan contains conflicts.");
    if (!await confirmGeneral(options, "Apply")) return;
    applyPlan(options.root, plan); console.log("Installed local AI-DLC workflow assets."); return;
  }
  if (command === "uninstall") {
    const options = initOptions(args); const plan = planUninstall(options.root); preview("UNINSTALL", plan);
    if (!await confirmGeneral(options, "Remove")) return;
    applyPlan(options.root, plan); console.log("Removed eligible managed assets; project config and state were preserved."); return;
  }
  if (command === "upgrade") {
    if (flags(args).has("--yes") || flags(args).has("--force")) throw new Error("upgrade does not support --yes or --force; apply requires a human interactive TTY confirmation");
    const root = rootArg(args); const plan = planUpgrade(root); preview("UPGRADE", plan);
    if (plan.some((item) => item.action === "conflict")) throw new Error("Upgrade contains conflicts; no files were written.");
    if (flags(args).has("--dry-run")) return;
    if (!interactive()) throw new Error("Upgrade apply requires an interactive TTY. AI and non-interactive processes must not apply upgrades.");
    const expected = packageVersion();
    if ((await question(`Type ${expected} to apply this user-initiated upgrade: `)).trim() !== expected) throw new Error("Upgrade confirmation did not match the target version");
    const result = applyUpgrade(root, plan); console.log(`Upgrade complete. Backup: ${result.backup}; changed: ${result.changed}`); return;
  }
  if (command === "profile" && args[0] === "validate") { const root = rootArg(args.slice(1)); const config = loadProjectConfig(root); const profiles = resolveProfiles(root, config.extends); console.log(`OK: ${profiles.map((item) => item.id).join(" → ")}`); return; }
  if (command === "eval" && args[0] === "run") {
    const root = rootArg(args.slice(1)); const id = value(args, "--runner"); const runner = id ? loadProjectConfig(root).eval.runners[id] : undefined;
    if (!id || !runner) throw new Error("eval run requires a configured --runner");
    const report = runEvaluation(id, runner, root); console.log(JSON.stringify(report, null, 2)); if (!report.passedReleaseGate) process.exitCode = 1; return;
  }
  if (command === "eval" && args[0] === "verify-release") {
    const evidence = verifyReleaseEvidence(args[1] ?? ".aidlc/release-eval.json", packageVersion());
    console.log(`OK: ${evidence.reports.length} pinned economy runners passed release gates.`); return;
  }
  throw new Error(`Unknown command: ${command}`);
};

main().catch((error: unknown) => { console.error(`aidlc-workflow: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
