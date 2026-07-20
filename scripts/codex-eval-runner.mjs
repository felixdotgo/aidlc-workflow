#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const input = await new Promise((resolve) => {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (data += chunk));
  process.stdin.on("end", () => resolve(data));
});

const scenario = JSON.parse(input);
const model = process.env.AIDLC_EVAL_MODEL || "gpt-5.6-luna";
const prompt = [
  "You are an AI-DLC workflow evaluator.",
  "Return only a concise plain-text answer to the scenario below.",
  "Do not run npm, npx, or any upgrade command. Respect the scenario constraints.",
  `Scenario ${scenario.id}: ${scenario.prompt}`
].join("\n");

const execution = spawnSync("codex", ["exec", "--ephemeral", "--json", "--model", model, "--sandbox", "read-only", prompt], {
  encoding: "utf8",
  timeout: Number(process.env.AIDLC_EVAL_TIMEOUT_MS || 120000),
  cwd: process.env.AIDLC_EVAL_WORKSPACE || process.cwd(),
  env: process.env
});

if (execution.error || execution.status !== 0) {
  console.error(execution.stderr || execution.error?.message || `codex exited ${execution.status}`);
  process.exit(execution.status || 1);
}

const events = execution.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const message = [...events].reverse().find((event) => event.type === "item.completed" && event.item?.type === "agent_message");
const transcript = message?.item?.text || message?.item?.content || "";
if (typeof transcript !== "string") process.exit(1);
process.stdout.write(JSON.stringify({
  status: "pass",
  transcript,
  usage: { contextChars: prompt.length },
  diagnostics: ["codex exec completed"]
}));
