#!/usr/bin/env node
import { spawnSync } from "node:child_process";

if (process.argv.includes("--doctor")) {
  const check = spawnSync("codex", ["--version"], { encoding: "utf8", timeout: 10_000, shell: false });
  process.stdout.write(JSON.stringify({ available: !check.error && check.status === 0, driver: "codex", protocolVersion: 2, version: check.stdout.trim(), diagnostic: check.error?.message ?? check.stderr.trim() }));
  process.exit(check.error || check.status !== 0 ? 1 : 0);
}

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input) as { workspace: string; scenario: { turns: Array<{ input: string }> } };
const compact = (value: unknown, limit = 320): string => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "")
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY))=([^\s]+)/gi, "$1=[REDACTED]")
    .replace(/\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\s+/g, " ").trim().slice(0, limit);
};
const model = process.env.AIDLC_EVAL_MODEL;
const permissionArgs = [
  "--ignore-user-config",
  "--strict-config",
  "-c", 'approval_policy="never"',
  "-c", 'web_search="disabled"',
  "--sandbox", "workspace-write"
];
const allEvents: Array<Record<string, unknown>> = []; const transcripts: string[] = []; const diagnostics: string[] = []; let transport: "completed" | "error" | "timeout" = "completed"; let threadId: string | undefined;
for (const [index, turn] of request.scenario.turns.entries()) {
  let args: string[];
  if (index === 0) {
    args = ["exec", ...permissionArgs, "--json", "--skip-git-repo-check", "--cd", request.workspace];
  } else {
    if (!threadId) {
      transport = "error";
      const detail = "Codex resume requires an explicit captured thread ID";
      allEvents.push({ type: "runner-error", detail });
      diagnostics.push(detail);
      break;
    }
    args = ["exec", ...permissionArgs, "--json", "--skip-git-repo-check", "-C", request.workspace, "resume", threadId];
  }
  if (model && index === 0) args.push("--model", model);
  args.push(turn.input);
  const run = spawnSync("codex", args, { cwd: request.workspace, encoding: "utf8", timeout: Number(process.env.AIDLC_EVAL_TIMEOUT_MS ?? 120000), env: process.env, shell: false });
  if (run.error || run.status !== 0) { transport = run.error && "code" in run.error && run.error.code === "ETIMEDOUT" ? "timeout" : "error"; const detail = run.error?.message || run.stderr.trim() || `Codex runner exited ${run.status}`; allEvents.push({ type: "runner-error", detail }); diagnostics.push(detail); break; }
  for (const line of run.stdout.split("\n").filter(Boolean)) {
    const event = JSON.parse(line) as Record<string, unknown>; allEvents.push(event);
    if (event.type === "thread.started" && typeof event.thread_id === "string") threadId = event.thread_id;
    const item = event.item as Record<string, unknown> | undefined;
    if (event.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") transcripts.push(item.text);
    if ((event.type === "item.started" || event.type === "item.completed") && item?.type === "web_search") allEvents.push({ type: "network", tool: "web_search" });
    if (event.type === "item.completed" && item?.type === "command_execution") {
      const exitCode = item.exit_code;
      const status = item.status;
      allEvents.push({ type: "command", command: item.command, exitCode, status });
      if ((typeof exitCode === "number" && exitCode !== 0) || status === "failed") {
        diagnostics.push(`commandFailed turn=${index + 1} exitCode=${String(exitCode ?? "unknown")} status=${String(status ?? "unknown")} command=${compact(item.command)} output=${compact(item.aggregated_output)}`);
      }
    }
  }
}
process.stdout.write(JSON.stringify({ transport, transcript: transcripts.join("\n\n"), events: allEvents, diagnostics }));
