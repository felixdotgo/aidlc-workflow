#!/usr/bin/env node
import { checkGate, formatDiagnostics, loadState, option, parseArguments, rootOption, validateArguments } from "./lib/runtime.mjs";

const raw = process.argv.slice(2);
const parsed = parseArguments(raw, { valueOptions: ["--root", "--gate"] });
validateArguments(parsed, { minPositionals: 1, valueOptions: ["--gate"], usage: "Usage: gate-check.mjs <task-id> [--gate <gate>] [--root <path>]" });
const root = rootOption(parsed);
const [id] = parsed.positionals;
const state = loadState(root);
const gate = option(parsed, "--gate") ?? state.tasks[id]?.gate;
if (!id || !gate) throw new Error("Usage: gate-check.mjs <task-id> [--gate <gate>] [--root <path>]");
const diagnostics = checkGate(root, state, id, gate);
console.log(formatDiagnostics(diagnostics));
if (diagnostics.some((item) => item.level === "ERROR")) process.exitCode = 1;
