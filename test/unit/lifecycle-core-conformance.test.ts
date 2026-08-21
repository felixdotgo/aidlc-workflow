import assert from "node:assert/strict";
import test from "node:test";
import type { TaskState, WorkflowState } from "../../src/model.js";
import { handoffTask, hasAreaVerification, nextAction, reopenTask, transitionDiagnostics, transitionTask, validateState } from "../../src/state.js";

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

test("MCP and local cores share build-boundary, verification, reopen, and self-transition semantics", async () => {
  // @ts-ignore -- runtime conformance is the contract under test.
  const core = await import("../../services/mcp-state/src/lifecycle-core.mjs");
  const localTask = task(); localTask.phase = "build"; localTask.gate = "G2_codereview"; localTask.tasks = [{ id: "T1", label: "Build", status: "done" }];
  localTask.evidence.push(
    { kind: "approval", gate: "G1_review", source: "human", result: "pass", recordedAt: "2026-01-01T00:00:01.000Z" },
    { kind: "test", area: "root", source: "test", result: "fail", recordedAt: "2026-01-01T00:00:02.000Z" },
    { kind: "lint", area: "root", source: "lint", result: "pass", recordedAt: "2026-01-01T00:00:03.000Z" }
  );
  const remoteTask = structuredClone(localTask);
  assert.equal(hasAreaVerification(localTask, "root"), false); assert.equal(core.hasAreaVerification(remoteTask, "root"), false);
  const local: WorkflowState = { schemaVersion: 3, tasks: { [localTask.id]: localTask }, archive: {} }; const remote = structuredClone(local);
  assert.throws(() => transitionTask(local, localTask.id, "build"), /Cannot transition/);
  assert.throws(() => core.transitionTask(remote, remoteTask.id, "build"), /Cannot transition/);
  handoffTask(local, localTask.id, "structural_change", "new design", "review", "2026-01-01T00:00:04.000Z"); core.handoffTask(remote, remoteTask.id, "structural_change", "new design", "review", "2026-01-01T00:00:04.000Z");
  reopenTask(local, localTask.id, "plan", "replan", "human", "2026-01-01T00:00:05.000Z"); core.reopenTask(remote, remoteTask.id, "plan", "replan", "human", "2026-01-01T00:00:05.000Z");
  assert.equal(localTask.tasks[0].status, "todo"); assert.deepEqual(remote.tasks[remoteTask.id], localTask);
});

test("MCP and local cores agree that a gateless wait continues wrap", async () => {
  // @ts-ignore -- runtime conformance is the contract under test.
  const core = await import("../../services/mcp-state/src/lifecycle-core.mjs");
  const fixture = task(); fixture.phase = "wrap"; fixture.gate = "none"; fixture.status = "blocked_on_user";
  assert.deepEqual(core.nextAction(structuredClone(fixture)), nextAction(fixture));
  assert.equal(nextAction(fixture).classification, "run_phase");
  assert.match(nextAction(fixture).command ?? "", /task status core-fixture --status active/);
});

test("MCP and local cores count repair bounds identically", async () => {
  // @ts-ignore -- runtime conformance is the contract under test.
  const core = await import("../../services/mcp-state/src/lifecycle-core.mjs");
  const { repairBounds } = await import("../../src/state.js");
  const fixture = task(); fixture.phase = "build"; fixture.gate = "G2_codereview"; fixture.tasks = [{ id: "T1", label: "Build", status: "done" }];
  fixture.evidence.push(
    { kind: "approval", gate: "G1_review", source: "human", result: "pass", recordedAt: "2026-01-01T00:00:01.000Z" },
    { kind: "test", area: "root", source: "test", result: "fail", recordedAt: "2026-01-01T00:00:02.000Z" },
    { kind: "test", area: "root", source: "test", result: "fail", recordedAt: "2026-01-01T00:00:03.000Z" },
    { kind: "lint", area: "root", source: "lint", result: "fail", recordedAt: "2026-01-01T00:00:04.000Z" }
  );
  assert.deepEqual(core.repairBounds(structuredClone(fixture)), repairBounds(fixture));
  assert.deepEqual(core.nextAction(structuredClone(fixture)), nextAction(fixture));
  assert.equal(nextAction(fixture).classification, "blocked");
});
