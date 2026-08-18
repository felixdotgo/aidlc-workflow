import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendTaskLedgerEvent, createLedgerEvent, loadTaskLedger, loadTrackedState, reduceTaskLedger, taskEventsPath } from "../../src/ledger.js";
import type { TaskState } from "../../src/model.js";

const task = (title = "Ledger task"): TaskState => ({
  id: "2026-0814-ledger", title, type: "infra", phase: "clarify", gate: "G0_confirm", status: "active", language: "en", risk: "normal", areas: ["root"], branch: "feature/ledger",
  artifacts: { intent: ".agents/data/tasks/2026-0814-ledger/intent.md" }, decisions: [], tasks: [], evidence: [],
  createdAt: "2026-08-14T00:00:00.000Z", updatedAt: "2026-08-14T00:00:00.000Z"
});

test("tracked ledger reduces an append-only task chain", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-ledger-"));
  try {
    const first = appendTaskLedgerEvent(root, task(), "alice");
    const secondTask = { ...task("Updated"), updatedAt: "2026-08-14T00:01:00.000Z" };
    const second = appendTaskLedgerEvent(root, secondTask, "alice");
    assert.equal(second.parentDigest, first.digest);
    const reduced = reduceTaskLedger(loadTaskLedger(root, secondTask.id));
    assert.equal(reduced?.task.title, "Updated");
    assert.equal(reduced?.headDigest, second.digest);
    assert.equal(loadTrackedState(root)?.tasks[secondTask.id]?.title, "Updated");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("tracked ledger rejects concurrent sibling events for one task", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-ledger-conflict-"));
  try {
    const rootEvent = createLedgerEvent(task(), null, "alice", "2026-08-14T00:00:00.000Z", "root-event");
    const left = createLedgerEvent({ ...task("Left"), updatedAt: "2026-08-14T00:01:00.000Z" }, rootEvent.digest, "alice", "2026-08-14T00:01:00.000Z", "left-event");
    const right = createLedgerEvent({ ...task("Right"), updatedAt: "2026-08-14T00:02:00.000Z" }, rootEvent.digest, "bob", "2026-08-14T00:02:00.000Z", "right-event");
    const directory = taskEventsPath(root, task().id);
    mkdirSync(directory, { recursive: true });
    for (const event of [rootEvent, left, right]) {
      const path = join(directory, `${event.id}.json`);
      writeFileSync(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "w" });
    }
    assert.throws(() => reduceTaskLedger(loadTaskLedger(root, task().id)), /Concurrent ledger events/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
