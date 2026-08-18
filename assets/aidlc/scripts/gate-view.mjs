#!/usr/bin/env node
import { checkGate, formatGateView, loadState, option, rootOption, withoutOptions } from "./lib/runtime.mjs";

const raw = process.argv.slice(2);
const root = rootOption(raw);
const [id] = withoutOptions(raw);
const state = loadState(root);
const task = state.tasks[id];
if (!task) throw new Error(`Unknown active task: ${id}`);
const format = option(raw, "--format") ?? "markdown";
if (!["markdown", "plain", "json"].includes(format)) throw new Error("--format must be markdown, plain, or json");
console.log(formatGateView(task, checkGate(root, state, id, task.gate), format).trimEnd());
