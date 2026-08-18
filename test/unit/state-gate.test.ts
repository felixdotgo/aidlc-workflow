import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { approveAndAdvance, checkGate } from "../../src/gate.js";
import type { TaskState, WorkflowState } from "../../src/model.js";
import { closeTask, handoffTask, nextAction, recordNoLessons, reopenTask, renderWorkplan, supersedeTask, transitionTask, validateState } from "../../src/state.js";

const task = (): TaskState => ({
  id: "2026-0001-test", title: "Test task", type: "infra", phase: "clarify", gate: "G0_confirm", status: "active", language: "en", risk: "normal",
  areas: ["root"], branch: "—", artifacts: { intent: ".agents/data/tasks/2026-0001-test/intent.md", design: ".agents/data/tasks/2026-0001-test/design.md", workplan: ".agents/data/tasks/2026-0001-test/workplan.md" },
  decisions: [{ id: "D1", label: "Shape", status: "unresolved" }], tasks: [{ id: "T1", label: "Implement", status: "todo" }], evidence: [],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
});

test("state machine enforces approvals, decisions, verification, and review", () => {
  const current = task(); const state: WorkflowState = { schemaVersion: 1, tasks: { [current.id]: current } };
  assert.throws(() => recordNoLessons(current, "too early", "unit test"), /active wrap/);
  assert.throws(() => transitionTask(state, current.id, "plan"), /G0 approval/);
  current.evidence.push({ kind: "approval", gate: "G0_confirm", source: "user", result: "pass", recordedAt: "2026-01-01T00:00:01.000Z" });
  transitionTask(state, current.id, "plan");
  current.evidence.push({ kind: "approval", gate: "G1_review", source: "user", result: "pass", recordedAt: "2026-01-01T00:00:02.000Z" });
  assert.throws(() => transitionTask(state, current.id, "build"), /unresolved/);
  current.decisions[0].status = "approved";
  transitionTask(state, current.id, "build");
  current.tasks[0].status = "done";
  assert.throws(() => transitionTask(state, current.id, "wrap"), /test or lint/);
  current.evidence.push({ kind: "test", source: "npm test", result: "pass", recordedAt: "2026-01-01T00:00:03.000Z" });
  current.evidence.push({ kind: "review", source: "diff review", result: "pass", recordedAt: "2026-01-01T00:00:04.000Z" });
  current.evidence.push({ kind: "approval", gate: "G2_codereview", source: "user", result: "pass", recordedAt: "2026-01-01T00:00:05.000Z" });
  transitionTask(state, current.id, "wrap");
  recordNoLessons(current, "No durable lesson", "unit test", "2026-01-01T00:00:06.000Z");
  transitionTask(state, current.id, "done");
  assert.equal(current.status, "done");
});

test("rendered workplans are deterministic and gate checks require artifacts/evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-state-"));
  try {
    const current = task(); current.phase = "build"; current.gate = "G2_codereview"; current.decisions[0].status = "approved"; current.tasks[0].status = "done";
    for (const path of Object.values(current.artifacts)) {
      mkdirSync(join(root, path!, ".."), { recursive: true });
      writeFileSync(join(root, path!), "artifact\n");
    }
    const state: WorkflowState = { schemaVersion: 1, tasks: { [current.id]: current } };
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

test("latest post-G1 verification wins and pre-G1 evidence is ignored", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-latest-"));
  try {
    const current = task(); current.phase = "build"; current.gate = "G2_codereview"; current.decisions[0].status = "approved"; current.tasks[0].status = "done";
    for (const path of Object.values(current.artifacts)) { mkdirSync(join(root, path!, ".."), { recursive: true }); writeFileSync(join(root, path!), "artifact\n"); }
    current.evidence.push(
      { kind: "test", area: "root", source: "old pass", result: "pass", recordedAt: "2026-01-01T00:00:00.000Z" },
      { kind: "approval", gate: "G1_review", source: "user", result: "pass", recordedAt: "2026-01-01T00:00:01.000Z" },
      { kind: "test", area: "root", source: "new pass", result: "pass", recordedAt: "2026-01-01T00:00:02.000Z" },
      { kind: "test", area: "root", source: "newer fail", result: "fail", recordedAt: "2026-01-01T00:00:03.000Z" },
      { kind: "review", source: "review", result: "pass", recordedAt: "2026-01-01T00:00:04.000Z" }
    );
    const state: WorkflowState = { schemaVersion: 1, tasks: { [current.id]: current } };
    assert.match(checkGate(root, state, current.id, "G2_codereview").find((item) => item.code === "VERIFY_EVIDENCE")?.message ?? "", /root/);
    current.evidence.push({ kind: "lint", area: "root", source: "latest pass", result: "pass", recordedAt: "2026-01-01T00:00:05.000Z" });
    current.evidence.push({ kind: "test", area: "root", source: "late append with old timestamp", result: "fail", recordedAt: "2026-01-01T00:00:04.500Z" });
    assert.equal(checkGate(root, state, current.id, "G2_codereview").some((item) => item.level === "ERROR"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("atomic gate approval is idempotent and exposes the next action", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-atomic-"));
  try {
    const current = task(); current.status = "blocked_on_user";
    mkdirSync(join(root, ".agents/data/tasks", current.id), { recursive: true });
    writeFileSync(join(root, current.artifacts.intent!), "## 📋 Problem\nx\n## 🗺️ Affected areas\nx\n## 💭 Assumptions\nx\n## ❓ Open questions\nnone\n## 🎯 Scope\nx\n");
    const state: WorkflowState = { schemaVersion: 1, tasks: { [current.id]: current } };
    assert.equal(nextAction(current).classification, "await_user");
    const first = approveAndAdvance(root, state, current.id, "G0_confirm", "explicit user approval", "2026-01-01T00:00:01.000Z");
    assert.equal(first.idempotent, false);
    assert.equal(first.task.phase, "plan");
    assert.equal(first.nextAction.classification, "run_phase");
    const second = approveAndAdvance(root, state, current.id, "G0_confirm", "retry", "2026-01-01T00:00:02.000Z");
    assert.equal(second.idempotent, true);
    assert.equal(current.evidence.filter((item) => item.gate === "G0_confirm").length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("state validation rejects phase-gate and done-status drift", () => {
  const current = task(); const state: WorkflowState = { schemaVersion: 1, tasks: { [current.id]: current } };
  assert.doesNotThrow(() => validateState(state));
  current.gate = "G1_review";
  assert.throws(() => validateState(state), /Invalid task state/);
  current.gate = "G0_confirm"; current.status = "done";
  assert.throws(() => validateState(state), /Invalid task fields/);
  current.status = "active"; current.evidence.push({ kind: "test", source: "bad time", result: "pass", recordedAt: "2026-01-01" });
  assert.throws(() => validateState(state), /Invalid evidence/);
});

test("durable handoff blocks invalid G2 approval guidance and close is terminal without claiming completion", () => {
  const current = task(); current.phase = "build"; current.gate = "G2_codereview"; current.decisions[0].status = "approved";
  const state: WorkflowState = { schemaVersion: 2, tasks: { [current.id]: current } };
  current.status = "blocked_on_user";
  assert.equal(nextAction(current).classification, "blocked");
  assert.equal(nextAction(current).actions?.[0].id, "record_handoff");
  current.status = "active";
  handoffTask(state, current.id, "release_failed", "Claude release evidence failed", "user", "2026-01-01T00:00:01.000Z");
  const blocked = nextAction(current);
  assert.equal(blocked.classification, "blocked"); assert.equal(blocked.actions?.some((item) => item.id === "reopen_g1"), true); assert.equal(blocked.command, undefined);
  closeTask(state, current.id, "Stop bounded remediation", "user", "2026-01-01T00:00:02.000Z");
  const closed = nextAction(current);
  assert.equal(closed.classification, "terminal"); assert.equal(closed.outcome, "closed"); assert.equal(current.phase, "build");
  assert.equal(checkGate(".", state, current.id, "G2_codereview").some((item) => item.code === "TASK_TERMINAL"), true);
  assert.throws(() => approveAndAdvance(".", state, current.id, "G1_review", "retry"), /Terminal or handed-off/);
  assert.throws(() => transitionTask(state, current.id, "wrap"), /Terminal task/);
  assert.match(renderWorkplan(current), /Closure: Stop bounded remediation/);
});

test("supersede links a fresh successor atomically and rejects invalid or conflicting links", () => {
  const predecessor = task(); predecessor.phase = "build"; predecessor.gate = "G2_codereview"; predecessor.decisions[0].status = "approved";
  const successor = task(); successor.id = "2026-0002-successor"; successor.title = "Successor"; successor.artifacts = { intent: `.agents/data/tasks/${successor.id}/intent.md`, design: `.agents/data/tasks/${successor.id}/design.md`, workplan: `.agents/data/tasks/${successor.id}/workplan.md` };
  const state: WorkflowState = { schemaVersion: 2, tasks: { [predecessor.id]: predecessor, [successor.id]: successor } };
  supersedeTask(state, predecessor.id, successor.id, "Move release blocker", "user", "2026-01-01T00:00:01.000Z");
  assert.equal(predecessor.status, "superseded"); assert.equal(predecessor.successorTaskId, successor.id); assert.equal(successor.predecessorTaskId, predecessor.id);
  assert.equal(nextAction(predecessor).classification, "terminal"); assert.doesNotThrow(() => validateState(state));
  assert.equal(supersedeTask(state, predecessor.id, successor.id, "Move release blocker", "user"), predecessor);
  assert.throws(() => supersedeTask(state, predecessor.id, successor.id, "different", "user"), /different metadata/);
  successor.evidence.push({ kind: "approval", gate: "G0_confirm", source: "user", result: "pass", recordedAt: "2026-01-01T00:00:02.000Z" }); successor.phase = "plan"; successor.gate = "G1_review";
  assert.doesNotThrow(() => validateState(state));
  const self = task(); const selfState: WorkflowState = { schemaVersion: 2, tasks: { [self.id]: self } };
  assert.throws(() => supersedeTask(selfState, self.id, self.id, "bad", "user"), /cannot be superseded/);
});

test("reopen G1 invalidates the prior approval before returning to plan", () => {
  const current = task(); current.phase = "build"; current.gate = "G2_codereview"; current.decisions[0].status = "approved";
  current.evidence.push({ kind: "approval", gate: "G1_review", source: "old approval", result: "pass", recordedAt: "2026-01-01T00:00:01.000Z" });
  const state: WorkflowState = { schemaVersion: 2, tasks: { [current.id]: current } };
  handoffTask(state, current.id, "structural_change", "Lifecycle contract changed", "review", "2026-01-01T00:00:02.000Z");
  reopenTask(state, current.id, "plan", "Review new lifecycle", "user", "2026-01-01T00:00:03.000Z");
  assert.equal(current.phase, "plan"); assert.equal(current.gate, "G1_review"); assert.equal(current.status, "active"); assert.equal(current.handoff, undefined);
  assert.equal(current.evidence.at(-1)?.result, "fail");
  assert.throws(() => transitionTask(state, current.id, "build"), /G1 approval/);
});
