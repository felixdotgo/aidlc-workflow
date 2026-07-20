#!/usr/bin/env node
import { compileContext, loadState, option, rootOption, withoutOptions } from "./lib/runtime.mjs";

const raw = process.argv.slice(2);
const root = rootOption(raw);
const [id] = withoutOptions(raw);
const task = loadState(root).tasks[id];
if (!task) throw new Error(`Unknown task: ${id}`);
const packet = compileContext(root, task, option(raw, "--phase") ?? task.phase);
if (option(raw, "--format") === "json") console.log(JSON.stringify(packet, null, 2));
else console.log(`${packet.content}\n\n---\nchars: ${packet.chars} · estimated tokens: ${packet.estimatedTokens} · omitted rules: ${packet.omittedRules.length}`);
