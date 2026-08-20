#!/usr/bin/env node
import { loadState, loadTask, nextAction, parseArguments, rootOption, validateArguments } from "./lib/runtime.mjs";

const raw = process.argv.slice(2);
const parsed = parseArguments(raw, { valueOptions: ["--root"], booleanOptions: ["--require-stop"] });
validateArguments(parsed, { minPositionals: 1, booleanOptions: ["--require-stop"], usage: "Usage: task-next.mjs <task-id> [--root <path>] [--require-stop]" });
const root = rootOption(parsed);
const [id] = parsed.positionals;
const task = loadTask(root, id, loadState(root));
if (!task) throw new Error(`Unknown task: ${id}`);
const action = nextAction(task);
console.log(JSON.stringify(action, null, 2));
if (parsed.flags.has("--require-stop") && action.classification === "run_phase") {
  console.error(`CONTINUATION_REQUIRED: ${action.command}`);
  process.exitCode = 2;
}
