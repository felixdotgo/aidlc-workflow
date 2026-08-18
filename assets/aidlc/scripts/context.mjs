#!/usr/bin/env node
import { compileContext, loadState, loadTask, option, rootOption, withoutOptions } from "./lib/runtime.mjs";

const raw = process.argv.slice(2);
const root = rootOption(raw);
const [id] = withoutOptions(raw);
const state = loadState(root);
const task = loadTask(root, id, state);
if (!task) throw new Error(`Unknown task: ${id}`);
const packet = compileContext(root, task, option(raw, "--phase") ?? task.phase, { mode: option(raw, "--mode") ?? "standard", itemId: option(raw, "--item") });
if (option(raw, "--format") === "json") console.log(JSON.stringify(packet, null, 2));
else console.log(`${packet.content}\n\n---\nchars: ${packet.chars} · estimated tokens: ${packet.estimatedTokens} · omitted rules: ${packet.omittedRules.length}`);
