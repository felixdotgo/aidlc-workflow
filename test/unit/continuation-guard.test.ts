import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("task-next guard rejects a final response while a task must continue", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-continuation-"));
  try {
    mkdirSync(join(root, ".agents/data/state"), { recursive: true });
    const task = { id: "continue-task", title: "Continue", type: "infra", phase: "build", gate: "G2_codereview", status: "active", language: "en", risk: "normal", areas: ["root"], branch: "—", artifacts: {}, decisions: [], tasks: [], evidence: [], createdAt: "2026-08-14T00:00:00.000Z", updatedAt: "2026-08-14T00:00:00.000Z" };
    writeFileSync(join(root, ".agents/data/state/aidlc-state.json"), `${JSON.stringify({ schemaVersion: 3, tasks: { [task.id]: task }, archive: {} })}\n`);
    const result = spawnSync(process.execPath, [resolve(".agents/aidlc/scripts/task-next.mjs"), task.id, "--root", root, "--require-stop"], { encoding: "utf8" });
    assert.equal(result.status, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
