import assert from "node:assert/strict";
import test from "node:test";
import type { TaskState, WorkflowState } from "../../src/model.js";
import { transitionDiagnostics, transitionTask, validateState } from "../../src/state.js";

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
  assert.deepEqual(remote, local);
});
