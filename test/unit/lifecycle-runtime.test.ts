import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { applyPlan, planInit, readManifest } from "../../src/installer.js";
import type { InitOptions } from "../../src/model.js";

const options = (root: string): InitOptions => ({ root, agents: ["codex"], all: false, dryRun: false, yes: true, force: false });
const run = (root: string, script: string, args: string[]): string => execFileSync(process.execPath, [join(root, ".agents/aidlc/scripts", script), ...args], { cwd: root, encoding: "utf8" });

test("installed local scripts drive the lifecycle without an aidlc executable or BOARD", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-runtime-"));
  try {
    applyPlan(root, planInit(options(root)));
    const id = "2026-0001-runtime";
    run(root, "state.mjs", ["task", "create", id, "--title", "Runtime smoke", "--type", "bug", "--language", "en", "--area", "root"]);
    const taskDir = join(root, ".agents/tasks", id);
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, "intent.md"), "# Intent\n\n## 📋 Problem\nx\n## 🗺️ Affected areas\nx\n## 💭 Assumptions\nx\n## ❓ Open questions\nnone\n## 🎯 Scope\nx\n");
    writeFileSync(join(taskDir, "design.md"), "# Design\n\n## 🧩 Solution per affected area\nx\n## 📌 Spec traceability\nx\n## 🔗 Cross-service contracts\nnone\n## ⚠️ Risks / edge cases\nnone\n");

    assert.match(run(root, "gate-check.mjs", [id, "--gate", "G0_confirm"]), /GATE_OK/);
    run(root, "state.mjs", ["evidence", "add", id, "--kind", "approval", "--gate", "G0_confirm", "--result", "pass", "--source", "human approval"]);
    run(root, "state.mjs", ["task", "transition", id, "--to", "plan"]);
    run(root, "state.mjs", ["decision", "set", id, "D1", "--status", "approved", "--label", "Use local scripts", "--resolution", "approved choice"]);
    run(root, "state.mjs", ["task", "item", id, "T1", "--status", "todo", "--label", "Implement runtime"]);
    run(root, "state.mjs", ["evidence", "add", id, "--kind", "approval", "--gate", "G1_review", "--result", "pass", "--source", "human approval"]);
    run(root, "state.mjs", ["task", "transition", id, "--to", "build"]);

    const blocked = spawnSync(process.execPath, [join(root, ".agents/aidlc/scripts/gate-check.mjs"), id, "--gate", "G2_codereview"], { cwd: root, encoding: "utf8" });
    assert.equal(blocked.status, 1);
    assert.match(blocked.stdout, /TASKS_OPEN/);
    run(root, "state.mjs", ["task", "item", id, "T1", "--status", "done"]);
    run(root, "state.mjs", ["evidence", "add", id, "--kind", "test", "--area", "root", "--result", "pass", "--source", "runtime smoke", "--detail", "label with spaces"]);
    run(root, "state.mjs", ["evidence", "add", id, "--kind", "review", "--result", "pass", "--source", "adversarial review"]);

    assert.match(run(root, "gate-check.mjs", [id, "--gate", "G2_codereview"]), /GATE_OK/);
    run(root, "state.mjs", ["task", "status", id, "--status", "blocked_on_user"]);
    assert.match(run(root, "context.mjs", [id, "--phase", "build", "--format", "json"]), /Runtime smoke/);
    assert.match(run(root, "state.mjs", ["task", "show", id]), /label with spaces/);
    assert.match(run(root, "state.mjs", ["task", "show", id]), /blocked_on_user/);
    assert.equal(existsSync(join(root, ".agents/state/BOARD.md")), false);
    assert.ok(readManifest(root)?.files[".agents/aidlc/scripts/state.mjs"]);
    assert.doesNotMatch(readFileSync(join(root, "AGENTS.md"), "utf8"), /aidlc context/);

    const oldCli = spawnSync(process.execPath, [resolve("dist/src/cli.js"), "task", "show"], { encoding: "utf8" });
    assert.equal(oldCli.status, 1);
    assert.match(oldCli.stderr, /Unknown command: task/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
