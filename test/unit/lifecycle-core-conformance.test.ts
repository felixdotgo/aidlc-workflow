import assert from "node:assert/strict";
import test from "node:test";
import type { TaskState, WorkflowState } from "../../src/model.js";
import { nextAction, transitionDiagnostics, transitionTask, validateState } from "../../src/state.js";

const task = (): TaskState => ({
  id: "core-fixture", title: "Shared-core fixture", type: "infra", phase: "clarify", gate: "G0_confirm", status: "active", language: "en", risk: "normal", areas: ["root"], branch: "—",
  artifacts: { intent: ".agents/data/tasks/core-fixture/intent.md", design: ".agents/data/tasks/core-fixture/design.md", workplan: ".agents/data/tasks/core-fixture/workplan.md" }, decisions: [], tasks: [], evidence: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
});

test("MCP lifecycle core and local lifecycle state reject and accept the same transition fixture", async () => {
  // The production core is dependency-free ESM copied verbatim into the image.
  // TypeScript's package compilation deliberately does not include service JS.
  // @ts-ignore -- runtime conformance is the contract under test.
  const core = await import("../../services/mcp-state/src/lifecycle-core.mjs");
  const local: WorkflowState = { schemaVersion: 3, tasks: { "core-fixture": task() }, archive: {} };
  const remote = structuredClone(local);
  assert.doesNotThrow(() => validateState(local)); assert.doesNotThrow(() => core.validateState(remote));
  assert.deepEqual(core.transitionDiagnostics(remote.tasks["core-fixture"], "plan"), transitionDiagnostics(local.tasks["core-fixture"], "plan"));
  assert.throws(() => transitionTask(local, "core-fixture", "plan"), /G0 approval/);
  assert.throws(() => core.transitionTask(remote, "core-fixture", "plan"), /G0 approval/);
  const approval = { kind: "approval" as const, gate: "G0_confirm" as const, source: "fixture", result: "pass" as const, recordedAt: "2026-01-01T00:00:01.000Z" };
  local.tasks["core-fixture"].evidence.push(approval); remote.tasks["core-fixture"].evidence.push(approval);
  transitionTask(local, "core-fixture", "plan"); core.transitionTask(remote, "core-fixture", "plan");
  assert.equal(Number.isNaN(Date.parse(local.tasks["core-fixture"].updatedAt)), false);
  assert.equal(Number.isNaN(Date.parse(remote.tasks["core-fixture"].updatedAt)), false);
  remote.tasks["core-fixture"].updatedAt = local.tasks["core-fixture"].updatedAt;
  assert.deepEqual(remote, local);

  const localTask = local.tasks["core-fixture"];
  localTask.phase = "build"; localTask.gate = "G2_codereview";
  localTask.tasks = [{ id: "T1", label: "First", status: "done" }, { id: "T2", label: "Second", status: "todo" }];
  const remoteTask = structuredClone(localTask);
  assert.deepEqual(core.nextAction(remoteTask), nextAction(localTask));
  assert.equal(nextAction(localTask).itemId, "T2");
});
