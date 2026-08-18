#!/usr/bin/env node
import { loadState, loadTask, renderViews, rootOption, withoutOptions } from "./lib/runtime.mjs";

const raw = process.argv.slice(2);
const root = rootOption(raw);
const [id] = withoutOptions(raw);
const state = loadState(root);
if (raw.includes("--all")) renderViews(root, state);
else {
  if (!id) throw new Error("render.mjs requires <task-id>; use --all only for explicit maintenance");
  const task = loadTask(root, id, state);
  if (!task) throw new Error(`Unknown task: ${id}`);
  renderViews(root, state, [task]);
}
console.log("Rendered requested task review artifact(s) from canonical state.");
