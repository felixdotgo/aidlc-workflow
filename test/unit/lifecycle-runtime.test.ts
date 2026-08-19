import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { applyPlan, planInit, readManifest } from "../../src/installer.js";
import type { InitOptions } from "../../src/model.js";

const options = (root: string): InitOptions => ({ root, agents: ["codex"], all: false, dryRun: false, yes: true, force: false });
const run = (root: string, script: string, args: string[]): string => execFileSync(process.execPath, [join(root, ".agents/aidlc/scripts", script), ...args], { cwd: root, encoding: "utf8" });
const runAsync = (root: string, script: string, args: string[]): Promise<void> => new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [join(root, ".agents/aidlc/scripts", script), ...args], { cwd: root });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.once("error", rejectRun);
  child.once("close", (code) => code === 0 ? resolveRun() : rejectRun(new Error(`state script exited ${code}: ${stderr}`)));
});

test("installed lifecycle scripts preserve every concurrent local mutation", async () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-runtime-concurrent-"));
  try {
    applyPlan(root, planInit(options(root)));
    const ids = Array.from({ length: 16 }, (_, index) => `2026-lock-${String(index).padStart(2, "0")}`);
    await Promise.all(ids.map((id) => runAsync(root, "state.mjs", ["task", "create", id, "--title", `Concurrent ${id}`])));
    const catalog = JSON.parse(run(root, "state.mjs", ["task", "list"]));
    assert.equal(catalog.total, ids.length);
    for (const id of ids) assert.equal(JSON.parse(run(root, "state.mjs", ["task", "show", id])).id, id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("installed local scripts drive the lifecycle without an aidlc executable or BOARD", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-runtime-"));
  try {
    applyPlan(root, planInit(options(root)));
    const id = "2026-0001-runtime";
    run(root, "state.mjs", ["task", "create", id, "--title", "Runtime smoke", "--type", "bug", "--language", "en", "--area", "root"]);
    const taskDir = join(root, ".agents/data/tasks", id);
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, "intent.md"), "# Intent\n\n## 📋 Problem\nx\n## 🗺️ Affected areas\nx\n## 💭 Assumptions\nx\n## ❓ Open questions\nnone\n## 🎯 Scope\nx\n");
    writeFileSync(join(taskDir, "design.md"), "# Design\n\n## 🧩 Solution per affected area\nx\n## 📌 Spec traceability\nx\n## 🔗 Cross-service contracts\nnone\n## ⚠️ Risks / edge cases\nnone\n");

    assert.match(run(root, "gate-check.mjs", [id, "--gate", "G0_confirm"]), /GATE_OK/);
    run(root, "state.mjs", ["task", "status", id, "--status", "blocked_on_user"]);
    const g0View = run(root, "gate-view.mjs", [id]);
    assert.match(g0View, /^> \[!IMPORTANT\]/); assert.equal(g0View.match(/ACTION REQUIRED/g)?.length, 1);
    const g0 = JSON.parse(run(root, "state.mjs", ["gate", "approve", id, "--gate", "G0_confirm", "--source", "human approval"]));
    assert.equal(g0.nextAction.classification, "run_phase");
    const g0Retry = JSON.parse(run(root, "state.mjs", ["gate", "approve", id, "--gate", "G0_confirm", "--source", "retry"]));
    assert.equal(g0Retry.idempotent, true);
    run(root, "state.mjs", ["decision", "set", id, "D1", "--status", "approved", "--label", "Use local scripts", "--resolution", "approved choice"]);
    run(root, "state.mjs", ["task", "item", id, "T1", "--status", "todo", "--label", "Implement runtime"]);
    run(root, "state.mjs", ["task", "status", id, "--status", "blocked_on_user"]);
    const g1 = JSON.parse(run(root, "state.mjs", ["gate", "approve", id, "--gate", "G1_review", "--source", "human approval"]));
    assert.equal(g1.task.phase, "build");

    const blocked = spawnSync(process.execPath, [join(root, ".agents/aidlc/scripts/gate-check.mjs"), id, "--gate", "G2_codereview"], { cwd: root, encoding: "utf8" });
    assert.equal(blocked.status, 1);
    assert.match(blocked.stdout, /TASKS_OPEN/);
    run(root, "state.mjs", ["task", "item", id, "T1", "--status", "done"]);
    run(root, "state.mjs", ["evidence", "add", id, "--kind", "test", "--area", "root", "--result", "pass", "--source", "runtime smoke", "--detail", "label with spaces"]);
    run(root, "state.mjs", ["evidence", "add", id, "--kind", "review", "--result", "pass", "--source", "adversarial review"]);

    assert.match(run(root, "gate-check.mjs", [id, "--gate", "G2_codereview"]), /GATE_OK/);
    run(root, "state.mjs", ["evidence", "add", id, "--kind", "test", "--area", "root", "--result", "fail", "--source", "new regression"]);
    const latestFail = spawnSync(process.execPath, [join(root, ".agents/aidlc/scripts/gate-check.mjs"), id, "--gate", "G2_codereview"], { cwd: root, encoding: "utf8" });
    assert.equal(latestFail.status, 1); assert.match(latestFail.stdout, /root/);
    run(root, "state.mjs", ["evidence", "add", id, "--kind", "lint", "--area", "root", "--result", "pass", "--source", "repaired"]);
    run(root, "state.mjs", ["task", "status", id, "--status", "blocked_on_user"]);
    const next = JSON.parse(run(root, "state.mjs", ["task", "next", id]));
    assert.equal(next.classification, "await_user");
    assert.match(run(root, "gate-view.mjs", [id, "--format", "plain"]), /^\[IMPORTANT\].*GATE G2/);
    assert.equal(JSON.parse(run(root, "gate-view.mjs", [id, "--format", "json"])).gate, "G2_codereview");
    assert.match(run(root, "context.mjs", [id, "--phase", "build", "--format", "json"]), /Runtime smoke/);
    assert.match(run(root, "state.mjs", ["task", "show", id]), /label with spaces/);
    assert.match(run(root, "state.mjs", ["task", "show", id]), /blocked_on_user/);
    assert.equal(existsSync(join(root, ".agents/data/state/BOARD.md")), false);
    assert.ok(readManifest(root)?.files[".agents/aidlc/scripts/state.mjs"]);
    assert.doesNotMatch(readFileSync(join(root, "AGENTS.md"), "utf8"), /aidlc context/);

    const g2 = JSON.parse(run(root, "state.mjs", ["gate", "approve", id, "--gate", "G2_codereview", "--source", "human approval"]));
    assert.equal(g2.task.phase, "wrap"); assert.equal(g2.nextAction.classification, "run_phase");
    run(root, "state.mjs", ["lesson", "record", id, "L1", "--area", "root", "--summary", "Use installed lifecycle commands", "--prevention", "Do not hand-edit state", "--example", "state.mjs task show", "--promotion", "orchestrator", "--source", "runtime smoke"]);
    assert.equal(JSON.parse(run(root, "state.mjs", ["lesson", "search", "--query", "lifecycle", "--area", "root"])).length, 1);
    run(root, "state.mjs", ["task", "transition", id, "--to", "done"]);
    assert.equal(JSON.parse(run(root, "state.mjs", ["task", "next", id])).classification, "complete");
    const compact = JSON.parse(readFileSync(join(root, ".agents/data/state/aidlc-state.json"), "utf8"));
    assert.equal(compact.schemaVersion, 3); assert.equal(compact.tasks[id], undefined); assert.equal(compact.archive[id].lessonCount, 1);
    assert.ok(existsSync(join(root, ".agents/data/state/archive", `${id}.json`)));
    assert.match(run(root, "state.mjs", ["task", "show", id]), /Use installed lifecycle commands/);
    const catalog = JSON.parse(run(root, "state.mjs", ["task", "show", "--include-archive"]));
    assert.equal(catalog.items.length, 1); assert.equal(catalog.items[0].source, "archive");

    const oldCli = spawnSync(process.execPath, [resolve("dist/src/cli.js"), "task", "show"], { encoding: "utf8" });
    assert.equal(oldCli.status, 1);
    assert.match(oldCli.stderr, /Unknown command: task/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("installed runtime supports audited handoff, reopen, close, and atomic supersede", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-runtime-handoff-"));
  try {
    applyPlan(root, planInit(options(root)));
    const predecessor = "2026-0002-predecessor"; const successor = "2026-0003-successor";
    run(root, "state.mjs", ["task", "create", predecessor, "--title", "Blocked release", "--type", "bug", "--language", "en", "--area", "root"]);
    const taskDir = join(root, ".agents/data/tasks", predecessor); mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, "intent.md"), "# Intent\n\n## 📋 Problem\nx\n## 🗺️ Affected areas\nx\n## 💭 Assumptions\nx\n## ❓ Open questions\nnone\n## 🎯 Scope\nx\n");
    writeFileSync(join(taskDir, "design.md"), "# Design\n\n## 🧩 Solution per affected area\nx\n## 📌 Spec traceability\nx\n## 🔗 Cross-service contracts\nnone\n## ⚠️ Risks / edge cases\nnone\n");
    run(root, "state.mjs", ["task", "status", predecessor, "--status", "blocked_on_user"]);
    run(root, "state.mjs", ["gate", "approve", predecessor, "--gate", "G0_confirm", "--source", "human"]);
    run(root, "state.mjs", ["decision", "set", predecessor, "D1", "--status", "approved", "--label", "Lifecycle"]);
    run(root, "state.mjs", ["task", "status", predecessor, "--status", "blocked_on_user"]);
    run(root, "state.mjs", ["gate", "approve", predecessor, "--gate", "G1_review", "--source", "human"]);

    const handoff = JSON.parse(run(root, "state.mjs", ["task", "handoff", predecessor, "--kind", "release_failed", "--reason", "provider evidence failed", "--source", "human"]));
    assert.equal(handoff.nextAction.classification, "blocked"); assert.equal(handoff.nextAction.actions.some((item: { id: string }) => item.id === "reopen_g1"), true);
    const reopened = JSON.parse(run(root, "state.mjs", ["task", "reopen", predecessor, "--to", "plan", "--reason", "new design", "--source", "human"]));
    assert.equal(reopened.task.phase, "plan"); assert.equal(reopened.task.evidence.at(-1).result, "fail");

    run(root, "state.mjs", ["task", "handoff", predecessor, "--kind", "structural_change", "--reason", "use successor", "--source", "human"]);
    run(root, "state.mjs", ["task", "create", successor, "--title", "Release successor", "--type", "bug", "--language", "en", "--area", "root"]);
    const superseded = JSON.parse(run(root, "state.mjs", ["task", "supersede", predecessor, "--successor", successor, "--reason", "separate release work", "--source", "human"]));
    assert.equal(superseded.nextAction.classification, "terminal"); assert.equal(superseded.nextAction.outcome, "superseded");
    assert.equal(JSON.parse(run(root, "state.mjs", ["task", "show", successor])).predecessorTaskId, predecessor);
    const compact = JSON.parse(readFileSync(join(root, ".agents/data/state/aidlc-state.json"), "utf8"));
    assert.equal(compact.schemaVersion, 3); assert.equal(compact.tasks[predecessor], undefined); assert.equal(compact.archive[predecessor].status, "superseded");

    const closedId = "2026-0004-closed"; run(root, "state.mjs", ["task", "create", closedId, "--title", "Abandoned", "--area", "root"]);
    const closed = JSON.parse(run(root, "state.mjs", ["task", "close", closedId, "--reason", "no longer needed", "--source", "human"]));
    assert.equal(closed.nextAction.classification, "terminal"); assert.equal(closed.nextAction.outcome, "closed");
    const invalid = spawnSync(process.execPath, [join(root, ".agents/aidlc/scripts/state.mjs"), "task", "supersede", successor, "--successor", successor, "--reason", "bad", "--source", "human"], { cwd: root, encoding: "utf8" });
    assert.notEqual(invalid.status, 0); assert.equal(JSON.parse(run(root, "state.mjs", ["task", "show", successor])).status, "active");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
