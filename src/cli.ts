#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { installableAdapters } from "./adapters.js";
import { compileContext, writeableContextFormat } from "./context.js";
import { runEvaluation } from "./eval.js";
import { checkGate, formatDiagnostics } from "./gate.js";
import { applyPlan, detectedAgents, doctor, formatPlan, planInit, planUninstall, selectAgents, status } from "./installer.js";
import type { AgentId, Evidence, Gate, InitOptions, Phase, TaskDecision, TaskState } from "./model.js";
import { loadProjectConfig, resolveProfiles } from "./profiles.js";
import { verifyReleaseEvidence } from "./release.js";
import { loadState, renderViews, saveState, transitionTask } from "./state.js";
import { applyUpgrade, planUpgrade } from "./upgrade.js";
import { packageVersion } from "./workflow.js";

const usage = `Usage:
  aidlc init [path] [--agent <name[,name]> | --all] [--yes] [--dry-run] [--force]
  aidlc upgrade [path] [--dry-run]
  aidlc uninstall [path] [--yes] [--dry-run]
  aidlc status [path]
  aidlc doctor [path] [--strict]
  aidlc task create|show|item|transition|archive ...
  aidlc decision set <task-id> <decision-id> --status <status> [--resolution <text>]
  aidlc evidence add <task-id> --kind <kind> --result <pass|fail|skip> --source <source> [--gate <gate>]
  aidlc gate check <task-id> --gate <gate>
  aidlc context <task-id> --phase <phase> [--format markdown|json]
  aidlc render [task-id]
  aidlc profile validate [path]
  aidlc eval run --runner <id> [path]
  aidlc eval verify-release [evidence.json]`;

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
const valueFlags = new Set(["--agent", "--root", "--title", "--type", "--language", "--area", "--risk", "--to", "--status", "--resolution", "--label", "--kind", "--gate", "--result", "--source", "--detail", "--phase", "--format", "--runner"]);
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

const taskCommand = (args: string[]): void => {
  const action = args[0];
  const root = value(args, "--root") ?? ".";
  const state = loadState(root);
  if (action === "show") {
    const id = args[1];
    console.log(id ? JSON.stringify(state.tasks[id] ?? null, null, 2) : JSON.stringify(state, null, 2));
    return;
  }
  if (action === "create") {
    const id = args[1];
    const title = value(args, "--title");
    if (!id || !title || state.tasks[id]) throw new Error("task create requires a new id and --title");
    const now = new Date().toISOString();
    const task: TaskState = {
      id, title, type: (value(args, "--type") ?? "infra") as TaskState["type"], phase: "clarify", gate: "G0_confirm", status: "active",
      language: value(args, "--language") === "en" ? "en" : "vi", risk: (value(args, "--risk") ?? "normal") as TaskState["risk"],
      areas: (value(args, "--area") ?? "root").split(","), branch: "—",
      artifacts: { intent: `.agents/tasks/${id}/intent.md`, design: `.agents/tasks/${id}/design.md`, workplan: `.agents/tasks/${id}/workplan.md` },
      decisions: [], tasks: [], evidence: [], createdAt: now, updatedAt: now
    };
    state.tasks[id] = task;
    saveState(root, state); renderViews(root, state); console.log(JSON.stringify(task, null, 2)); return;
  }
  if (action === "transition" || action === "archive") {
    const id = args[1];
    if (!id) throw new Error(`task ${action} requires task id`);
    transitionTask(state, id, action === "archive" ? "done" : value(args, "--to") as Phase);
    saveState(root, state); renderViews(root, state); console.log(JSON.stringify(state.tasks[id], null, 2)); return;
  }
  if (action === "item") {
    const id = args[1]; const itemId = args[2]; const current = id ? state.tasks[id] : undefined;
    if (!current || !itemId) throw new Error("task item requires task id and item id");
    const itemStatus = value(args, "--status") as TaskState["tasks"][number]["status"];
    if (!["todo", "in_progress", "done", "deferred"].includes(itemStatus)) throw new Error("Invalid task item status");
    const item = current.tasks.find((entry) => entry.id === itemId);
    if (item) { item.status = itemStatus; if (value(args, "--label")) item.label = value(args, "--label")!; }
    else current.tasks.push({ id: itemId, label: value(args, "--label") ?? itemId, status: itemStatus });
    current.updatedAt = new Date().toISOString(); saveState(root, state); renderViews(root, state); return;
  }
  throw new Error("Unknown task action");
};

const decisionCommand = (args: string[]): void => {
  if (args[0] !== "set" || !args[1] || !args[2]) throw new Error("decision set requires task id and decision id");
  const root = value(args, "--root") ?? ".";
  const state = loadState(root); const task = state.tasks[args[1]];
  if (!task) throw new Error(`Unknown task: ${args[1]}`);
  const statusValue = value(args, "--status") as TaskDecision["status"];
  if (!["unresolved", "approved", "changed", "dropped"].includes(statusValue)) throw new Error("Invalid decision status");
  const existing = task.decisions.find((item) => item.id === args[2]);
  if (existing) { existing.status = statusValue; existing.resolution = value(args, "--resolution"); }
  else task.decisions.push({ id: args[2], label: value(args, "--label") ?? args[2], status: statusValue, resolution: value(args, "--resolution") });
  task.updatedAt = new Date().toISOString(); saveState(root, state); renderViews(root, state);
};

const evidenceCommand = (args: string[]): void => {
  if (args[0] !== "add" || !args[1]) throw new Error("evidence add requires task id");
  const root = value(args, "--root") ?? "."; const state = loadState(root); const task = state.tasks[args[1]];
  if (!task) throw new Error(`Unknown task: ${args[1]}`);
  const evidence: Evidence = { kind: value(args, "--kind") as Evidence["kind"], gate: value(args, "--gate") as Gate | undefined, area: value(args, "--area"), result: value(args, "--result") as Evidence["result"], source: value(args, "--source") ?? "CLI", detail: value(args, "--detail"), recordedAt: new Date().toISOString() };
  if (!["approval", "spec", "test", "lint", "review", "diagnostic"].includes(evidence.kind) || !["pass", "fail", "skip"].includes(evidence.result)) throw new Error("Invalid evidence kind or result");
  task.evidence.push(evidence); task.updatedAt = new Date().toISOString(); saveState(root, state); renderViews(root, state);
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
  if (command === "task") return void taskCommand(args);
  if (command === "decision") return void decisionCommand(args);
  if (command === "evidence") return void evidenceCommand(args);
  if (command === "gate" && args[0] === "check") {
    const root = value(args, "--root") ?? "."; const diagnostics = checkGate(root, loadState(root), args[1], value(args, "--gate") as Gate);
    console.log(formatDiagnostics(diagnostics)); if (diagnostics.some((item) => item.level === "ERROR")) process.exitCode = 1; return;
  }
  if (command === "context") {
    const id = args[0]; const root = value(args, "--root") ?? "."; const state = loadState(root); const task = state.tasks[id];
    if (!task) throw new Error(`Unknown task: ${id}`);
    console.log(writeableContextFormat(compileContext(root, loadProjectConfig(root), task, (value(args, "--phase") ?? task.phase) as Phase), value(args, "--format") === "json" ? "json" : "markdown")); return;
  }
  if (command === "render") { const root = value(args, "--root") ?? "."; renderViews(root); console.log("Rendered AI-DLC Markdown views."); return; }
  if (command === "profile" && args[0] === "validate") { const root = rootArg(args.slice(1)); const config = loadProjectConfig(root); const profiles = resolveProfiles(root, config.extends); console.log(`OK: ${profiles.map((item) => item.id).join(" → ")}`); return; }
  if (command === "eval" && args[0] === "run") {
    const root = rootArg(args.slice(1)); const id = value(args, "--runner"); const runner = id ? loadProjectConfig(root).eval.runners[id] : undefined;
    if (!id || !runner) throw new Error("eval run requires a configured --runner");
    const report = runEvaluation(id, runner); console.log(JSON.stringify(report, null, 2)); if (!report.passedReleaseGate) process.exitCode = 1; return;
  }
  if (command === "eval" && args[0] === "verify-release") {
    const evidence = verifyReleaseEvidence(args[1] ?? ".aidlc/release-eval.json", packageVersion());
    console.log(`OK: ${evidence.reports.length} pinned economy runners passed release gates.`); return;
  }
  throw new Error(`Unknown command: ${command}`);
};

main().catch((error: unknown) => { console.error(`aidlc: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
