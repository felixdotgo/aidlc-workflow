#!/usr/bin/env node
import { loadState, loadTask, nextAction, rootOption, withoutOptions } from "./lib/runtime.mjs";

const raw = process.argv.slice(2);
const root = rootOption(raw);
const [id] = withoutOptions(raw);
if (!id) throw new Error("Usage: task-next.mjs <task-id> [--root <path>] [--require-stop]");
const task = loadTask(root, id, loadState(root));
if (!task) throw new Error(`Unknown task: ${id}`);
const action = nextAction(task);
console.log(JSON.stringify(action, null, 2));
if (raw.includes("--require-stop") && action.classification === "run_phase") {
  console.error(`CONTINUATION_REQUIRED: ${action.command}`);
  process.exitCode = 2;
}
