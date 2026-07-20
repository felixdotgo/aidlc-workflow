import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkGate } from "../../src/gate.js";
import type { TaskState, WorkflowState } from "../../src/model.js";
import { renderBoard, renderWorkplan, transitionTask } from "../../src/state.js";

const task = (): TaskState => ({
  id: "2026-0001-test", title: "Test task", type: "infra", phase: "clarify", gate: "G0_confirm", status: "active", language: "en", risk: "normal",
  areas: ["root"], branch: "—", artifacts: { intent: ".agents/tasks/2026-0001-test/intent.md", design: ".agents/tasks/2026-0001-test/design.md", workplan: ".agents/tasks/2026-0001-test/workplan.md" },
  decisions: [{ id: "D1", label: "Shape", status: "unresolved" }], tasks: [{ id: "T1", label: "Implement", status: "todo" }], evidence: [],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
});

test("state machine enforces approvals, decisions, verification, and review", () => {
  const current = task(); const state: WorkflowState = { schemaVersion: 1, tasks: { [current.id]: current } };
  assert.throws(() => transitionTask(state, current.id, "plan"), /G0 approval/);
  current.evidence.push({ kind: "approval", gate: "G0_confirm", source: "user", result: "pass", recordedAt: new Date().toISOString() });
  transitionTask(state, current.id, "plan");
  current.evidence.push({ kind: "approval", gate: "G1_review", source: "user", result: "pass", recordedAt: new Date().toISOString() });
  assert.throws(() => transitionTask(state, current.id, "build"), /unresolved/);
  current.decisions[0].status = "approved";
  transitionTask(state, current.id, "build");
  current.tasks[0].status = "done";
  assert.throws(() => transitionTask(state, current.id, "wrap"), /test or lint/);
  current.evidence.push({ kind: "test", source: "npm test", result: "pass", recordedAt: new Date().toISOString() });
  current.evidence.push({ kind: "review", source: "diff review", result: "pass", recordedAt: new Date().toISOString() });
  current.evidence.push({ kind: "approval", gate: "G2_codereview", source: "user", result: "pass", recordedAt: new Date().toISOString() });
  transitionTask(state, current.id, "wrap");
  transitionTask(state, current.id, "done");
  assert.equal(current.status, "done");
});

test("rendered views are deterministic and gate checks require artifacts/evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-state-"));
  try {
    const current = task(); current.phase = "build"; current.gate = "G2_codereview"; current.decisions[0].status = "approved"; current.tasks[0].status = "done";
    for (const path of Object.values(current.artifacts)) {
      mkdirSync(join(root, path!, ".."), { recursive: true });
      writeFileSync(join(root, path!), "artifact\n");
    }
    const state: WorkflowState = { schemaVersion: 1, tasks: { [current.id]: current } };
    assert.match(renderBoard(state), /Generated from/);
    assert.match(renderWorkplan(current), /D1 — Shape/);
    assert.ok(checkGate(root, state, current.id, "G2_codereview").some((item) => item.code === "VERIFY_EVIDENCE"));
    current.evidence.push({ kind: "test", source: "test", result: "pass", recordedAt: new Date().toISOString() });
    current.evidence.push({ kind: "review", source: "review", result: "pass", recordedAt: new Date().toISOString() });
    assert.equal(checkGate(root, state, current.id, "G2_codereview").some((item) => item.level === "ERROR"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("G2 requires verification evidence for every affected area", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-areas-"));
  try {
    const current = task(); current.phase = "build"; current.gate = "G2_codereview"; current.areas = ["api", "web"]; current.decisions[0].status = "approved"; current.tasks[0].status = "done";
    for (const path of Object.values(current.artifacts)) { mkdirSync(join(root, path!, ".."), { recursive: true }); writeFileSync(join(root, path!), "artifact\n"); }
    current.evidence.push({ kind: "test", area: "api", source: "api test", result: "pass", recordedAt: new Date().toISOString() });
    current.evidence.push({ kind: "review", source: "review", result: "pass", recordedAt: new Date().toISOString() });
    const state: WorkflowState = { schemaVersion: 1, tasks: { [current.id]: current } };
    assert.match(checkGate(root, state, current.id, "G2_codereview").find((item) => item.code === "VERIFY_EVIDENCE")?.message ?? "", /web/);
    current.evidence.push({ kind: "lint", area: "web", source: "web lint", result: "pass", recordedAt: new Date().toISOString() });
    assert.equal(checkGate(root, state, current.id, "G2_codereview").some((item) => item.level === "ERROR"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
