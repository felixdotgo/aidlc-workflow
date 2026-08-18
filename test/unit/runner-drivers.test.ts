import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";

const request = (workspace: string, turns = 1, suiteId = "aidlc-official-agentic") => JSON.stringify({ protocolVersion: 2, suiteId, workspace, scenario: { id: "fixture", turns: Array.from({ length: turns }, (_, index) => ({ role: "user", input: `Reply OK ${index + 1}` })) } });
const executable = (root: string, name: string, body: string): string => {
  const path = join(root, name); writeFileSync(path, `#!/usr/bin/env node\n${body}\n`, "utf8"); chmodSync(path, 0o755); return path;
};
const run = (driver: "claude" | "codex", workspace: string, bin: string, extra: Record<string, string> = {}, turns = 1) => spawnSync(process.execPath, [resolve(`dist/dev/evaluator/runners/${driver}.js`)], {
  input: request(workspace, turns), encoding: "utf8", env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`, AIDLC_EVAL_MODEL: driver === "claude" ? "sonnet" : "fixture", AIDLC_EVAL_TIMEOUT_MS: "10000", ...extra }
});

test("Claude driver enables verbose stream JSON mode", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-claude-driver-")); const argsPath = join(root, "args.json");
  try {
    executable(root, "claude", `const fs=require("node:fs"); fs.writeFileSync(process.env.FAKE_ARGS_PATH, JSON.stringify(process.argv.slice(2))); if (!process.argv.includes("--verbose")) { console.error("missing verbose"); process.exit(9); } console.log(JSON.stringify({type:"result",result:"OK",session_id:"fixture",usage:{input_tokens:2,output_tokens:1},total_cost_usd:0.01}));`);
    const result = run("claude", root, root, { FAKE_ARGS_PATH: argsPath }); assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout); const args = JSON.parse(readFileSync(argsPath, "utf8"));
    assert.equal(payload.transport, "completed"); assert.equal(payload.transcript, "OK"); assert.deepEqual(payload.diagnostics, []);
    assert.ok(args.includes("-p")); assert.ok(args.includes("--verbose")); assert.ok(args.includes("stream-json"));
    assert.ok(args.includes("acceptEdits")); assert.ok(args.includes("Bash,Read,Edit,Write,Glob,Grep"));
    assert.ok(args.includes("--strict-mcp-config")); assert.ok(args.includes('{"mcpServers":{}}')); assert.match(args[args.indexOf("--append-system-prompt") + 1], /use Read, Glob, and Grep/);
    const allowed = args[args.indexOf("--allowedTools") + 1];
    assert.match(allowed, /Bash\(node \.agents\/aidlc\/scripts\/\*\)/); assert.doesNotMatch(allowed, /(^|,)Bash(,|$)/);
    assert.ok(allowed.includes(`Bash(node ${root}/.agents/aidlc/scripts/*)`));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivers apply least-privilege permissions to initial and resumed turns", { skip: process.platform === "win32" }, () => {
  for (const driver of ["codex", "claude"] as const) {
    const root = mkdtempSync(join(tmpdir(), `aidlc-${driver}-permissions-`)); const argsPath = join(root, "args.jsonl");
    try {
      const configRoot = join(root, ".agents");
      writeFileSync(join(root, "verify.mjs"), "", "utf8");
      mkdirSync(configRoot, { recursive: true });
      writeFileSync(join(configRoot, "config.json"), JSON.stringify({ commands: { test: { command: "node", args: ["verify.mjs"] }, unsafe: { command: "node", args: ["bad;command"] } } }), "utf8");
      const body = driver === "codex"
        ? `const fs=require("node:fs"); fs.appendFileSync(process.env.FAKE_ARGS_PATH,JSON.stringify(process.argv.slice(2))+"\\n"); console.log(JSON.stringify({type:"thread.started",thread_id:"fixture-thread"})); console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:"OK"}}));`
        : `const fs=require("node:fs"); fs.appendFileSync(process.env.FAKE_ARGS_PATH,JSON.stringify(process.argv.slice(2))+"\\n"); console.log(JSON.stringify({type:"result",result:"OK",session_id:"fixture-session"}));`;
      executable(root, driver, body);
      const result = run(driver, root, root, { FAKE_ARGS_PATH: argsPath }, 2); assert.equal(result.status, 0, result.stderr);
      const calls = readFileSync(argsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]); assert.equal(calls.length, 2);
      for (const args of calls) {
        if (driver === "codex") {
          assert.ok(args.includes("--ignore-user-config")); assert.ok(args.includes("--strict-config"));
          assert.ok(args.includes('approval_policy="never"')); assert.ok(args.includes('web_search="disabled"'));
          assert.equal(args[args.indexOf("--sandbox") + 1], "workspace-write");
          assert.ok(!args.some((arg) => arg.startsWith("permissions.aidlc_eval="))); assert.ok(!args.includes('default_permissions="aidlc_eval"'));
          assert.ok(!args.includes("--approve-for-me")); assert.ok(!args.includes("danger-full-access")); assert.ok(!args.includes("--dangerously-bypass-approvals-and-sandbox"));
        } else {
          const allowed = args[args.indexOf("--allowedTools") + 1];
          assert.match(allowed, /Bash\(node verify\.mjs\)/); assert.doesNotMatch(allowed, /bad;command/);
          assert.ok(allowed.includes(`Bash(node ${root}/.agents/aidlc/scripts/*)`));
          assert.ok(args.includes("--strict-mcp-config")); assert.ok(args.includes('{"mcpServers":{}}')); assert.match(args[args.indexOf("--append-system-prompt") + 1], /canonical nextAction loop/);
          assert.ok(!args.includes("bypassPermissions")); assert.ok(!args.includes("--dangerously-skip-permissions"));
        }
      }
      if (driver === "codex") {
        const resumed = calls[1];
        assert.ok(resumed.indexOf("--skip-git-repo-check") < resumed.indexOf("resume"));
        assert.ok(resumed.indexOf("-C") < resumed.indexOf("resume"));
        assert.equal(resumed[resumed.indexOf("-C") + 1], root);
        assert.equal(resumed[resumed.indexOf("resume") + 1], "fixture-thread");
        assert.ok(!resumed.includes("--last"));
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("Codex driver fails closed when the initial turn does not return a thread ID", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-codex-missing-thread-")); const argsPath = join(root, "args.jsonl");
  try {
    executable(root, "codex", `const fs=require("node:fs"); fs.appendFileSync(process.env.FAKE_ARGS_PATH,JSON.stringify(process.argv.slice(2))+"\\n"); console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:"OK"}}));`);
    const result = run("codex", root, root, { FAKE_ARGS_PATH: argsPath }, 2); assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout); assert.equal(payload.transport, "error");
    assert.match(payload.diagnostics.join("\n"), /explicit captured thread ID/);
    const calls = readFileSync(argsPath, "utf8").trim().split("\n"); assert.equal(calls.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Claude does not auto-approve configured commands for custom suites", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-claude-custom-permissions-")); const argsPath = join(root, "args.json");
  try {
    mkdirSync(join(root, ".agents"), { recursive: true });
    writeFileSync(join(root, ".agents/config.json"), JSON.stringify({ commands: { test: { command: "node", args: ["verify.mjs"] } } }), "utf8");
    executable(root, "claude", `const fs=require("node:fs"); fs.writeFileSync(process.env.FAKE_ARGS_PATH,JSON.stringify(process.argv.slice(2))); console.log(JSON.stringify({type:"result",result:"OK",session_id:"fixture"}));`);
    const result = spawnSync(process.execPath, [resolve("dist/dev/evaluator/runners/claude.js")], { input: request(root, 1, "custom-suite"), encoding: "utf8", env: { ...process.env, PATH: `${root}${delimiter}${process.env.PATH ?? ""}`, FAKE_ARGS_PATH: argsPath, AIDLC_EVAL_TIMEOUT_MS: "10000" } });
    assert.equal(result.status, 0, result.stderr);
    const args = JSON.parse(readFileSync(argsPath, "utf8")) as string[]; const allowed = args[args.indexOf("--allowedTools") + 1];
    assert.doesNotMatch(allowed, /verify\.mjs/); assert.match(allowed, /Bash\(node \.agents\/aidlc\/scripts\/\*\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("executable drivers expose child stderr as protocol diagnostics", { skip: process.platform === "win32" }, () => {
  for (const driver of ["claude", "codex"] as const) {
    const root = mkdtempSync(join(tmpdir(), `aidlc-${driver}-error-`));
    try {
      executable(root, driver, `console.error("${driver} fixture stderr"); process.exit(7);`);
      const result = run(driver, root, root); assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout); assert.equal(payload.transport, "error"); assert.match(payload.diagnostics.join("\n"), new RegExp(`${driver} fixture stderr`));
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("executable drivers expose bounded command failure diagnostics", { skip: process.platform === "win32" }, () => {
  const fixtures: Record<"codex" | "claude", string> = {
    codex: `console.log(JSON.stringify({type:"item.completed",item:{type:"command_execution",command:"API_TOKEN=supersecret node state.mjs task next --id eval-task",status:"failed",exit_code:2,aggregated_output:"task eval-task not found sk_fixturesecret"}})); console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:"Unable to continue"}}));`,
    claude: `console.log(JSON.stringify({type:"assistant",message:{content:[{type:"tool_use",id:"tool-1",name:"Bash",input:{command:"API_TOKEN=supersecret node state.mjs task next --id eval-task"}}]}})); console.log(JSON.stringify({type:"user",message:{content:[{type:"tool_result",tool_use_id:"tool-1",is_error:true,content:"task eval-task not found sk_fixturesecret"}]}})); console.log(JSON.stringify({type:"result",result:"Unable to continue",session_id:"fixture"}));`
  };
  for (const driver of ["codex", "claude"] as const) {
    const root = mkdtempSync(join(tmpdir(), `aidlc-${driver}-command-error-`));
    try {
      executable(root, driver, fixtures[driver]);
      const result = run(driver, root, root); assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout); assert.equal(payload.transport, "completed");
      assert.match(payload.diagnostics.join("\n"), /commandFailed/);
      assert.match(payload.diagnostics.join("\n"), /task eval-task not found/);
      assert.doesNotMatch(payload.diagnostics.join("\n"), /supersecret|sk_fixturesecret/);
      assert.match(payload.diagnostics.join("\n"), /REDACTED/);
      assert.ok(payload.diagnostics.every((item: string) => item.length < 1024));
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("drivers normalize vendor web tools into provider-neutral network events", { skip: process.platform === "win32" }, () => {
  const fixtures: Record<"codex" | "claude", string> = {
    codex: `console.log(JSON.stringify({type:"thread.started",thread_id:"fixture"})); console.log(JSON.stringify({type:"item.completed",item:{type:"web_search",query:"example"}})); console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:"done"}}));`,
    claude: `console.log(JSON.stringify({type:"assistant",message:{content:[{type:"tool_use",id:"web-1",name:"WebFetch",input:{url:"https://example.invalid"}}]}})); console.log(JSON.stringify({type:"result",result:"done",session_id:"fixture"}));`
  };
  for (const driver of ["codex", "claude"] as const) {
    const root = mkdtempSync(join(tmpdir(), `aidlc-${driver}-network-`));
    try {
      executable(root, driver, fixtures[driver]);
      const result = run(driver, root, root); assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout); assert.ok(payload.events.some((event: { type: string }) => event.type === "network"));
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("development-only evaluator runners use the approved timeouts", () => {
  const config = JSON.parse(readFileSync(resolve("dev/evaluator/config.json"), "utf8"));
  for (const id of ["codex-luna", "claude-sonnet", "claude-haiku"]) assert.equal(config.runners[id].timeoutMs, 300_000);
  assert.equal(config.runners["local-simulated"].timeoutMs, 120_000);
});
