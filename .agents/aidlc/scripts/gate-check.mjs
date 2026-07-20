#!/usr/bin/env node
import { checkGate, formatDiagnostics, loadState, option, rootOption, withoutOptions } from "./lib/runtime.mjs";

const raw = process.argv.slice(2);
const root = rootOption(raw);
const [id] = withoutOptions(raw);
const state = loadState(root);
const gate = option(raw, "--gate") ?? state.tasks[id]?.gate;
if (!id || !gate) throw new Error("Usage: gate-check.mjs <task-id> [--gate <gate>] [--root <path>]");
const diagnostics = checkGate(root, state, id, gate);
console.log(formatDiagnostics(diagnostics));
if (diagnostics.some((item) => item.level === "ERROR")) process.exitCode = 1;
