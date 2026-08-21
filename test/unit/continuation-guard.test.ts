import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("task-next guard rejects final responses across multi-item and premature G2 states", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-continuation-"));
  try {
    mkdirSync(join(root, ".agents/data/state"), { recursive: true });
    const task = { id: "continue-task", title: "Continue", type: "infra", phase: "build", gate: "G2_codereview", status: "active", language: "en", risk: "normal", areas: ["root"], branch: "—", artifacts: {}, decisions: [], tasks: [{ id: "T1", label: "First", status: "done" }, { id: "T2", label: "Second", status: "todo" }], evidence: [], createdAt: "2026-08-14T00:00:00.000Z", updatedAt: "2026-08-14T00:00:00.000Z" };
    const statePath = join(root, ".agents/data/state/aidlc-state.json");
    mkdirSync(join(root, ".agents/aidlc"), { recursive: true });
    const run = () => spawnSync(process.execPath, [resolve("dist/assets/.agents/aidlc/scripts/task-next.mjs"), task.id, "--root", root, "--require-stop"], { encoding: "utf8" });
    writeFileSync(statePath, `${JSON.stringify({ schemaVersion: 3, tasks: { [task.id]: task }, archive: {} })}\n`);
    const active = run(); assert.equal(active.status, 2); assert.match(active.stdout, /--item T2/);
    assert.match(active.stderr, /expected pause, not a failure/);
    assert.ok(JSON.parse(active.stdout).nextAction.command.includes(`--root ${JSON.stringify(root)}`));

    task.status = "blocked_on_user";
    writeFileSync(statePath, `${JSON.stringify({ schemaVersion: 3, tasks: { [task.id]: task }, archive: {} })}\n`);
    const premature = run(); assert.equal(premature.status, 2); assert.match(premature.stdout, /premature G2/);

    task.tasks[1].status = "done";
    writeFileSync(statePath, `${JSON.stringify({ schemaVersion: 3, tasks: { [task.id]: task }, archive: {} })}\n`);
    const unverified = run(); assert.equal(unverified.status, 2); assert.match(unverified.stdout, /verification and adversarial review/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
