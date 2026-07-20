#!/usr/bin/env node
import { spawnSync } from "node:child_process";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const scenario = JSON.parse(input);
  const model = process.env.AIDLC_EVAL_MODEL || "haiku";
  const prompt = [
    "You are an AI-DLC workflow evaluator.",
    "Return only a concise plain-text answer to the scenario below.",
    "Do not run npm, npx, or any upgrade command.",
    `Scenario ${scenario.id}: ${scenario.prompt}`
  ].join("\n");
  const execution = spawnSync("claude", ["-p", "--model", model, "--output-format", "json", "--permission-mode", "plan", prompt], {
    encoding: "utf8", timeout: Number(process.env.AIDLC_EVAL_TIMEOUT_MS || 120000),
    cwd: process.env.AIDLC_EVAL_WORKSPACE || process.cwd(), env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (execution.error || execution.status !== 0) { console.error(execution.stderr || execution.error?.message || `claude exited ${execution.status}`); process.exit(execution.status || 1); }
  const payload = JSON.parse(execution.stdout.trim());
  const transcript = typeof payload.result === "string" ? payload.result : typeof payload.message === "string" ? payload.message : "";
  if (!transcript) process.exit(1);
  process.stdout.write(JSON.stringify({ status: "pass", transcript, usage: { contextChars: prompt.length }, diagnostics: ["claude code completed"] }));
});
