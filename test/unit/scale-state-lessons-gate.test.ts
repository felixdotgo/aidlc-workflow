import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatGateView } from "../../src/gate.js";
import type { LessonRecord, TaskState, WorkflowState } from "../../src/model.js";
import { lessonStateDigest, listTaskSummaries, loadTask, rebuildLessonIndex, saveState, searchLessons } from "../../src/state.js";

const terminalTask = (index: number, lesson?: LessonRecord): TaskState => {
  const id = `2026-${String(index).padStart(4, "0")}-terminal`;
  const recordedAt = `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`;
  return {
    id, title: `Terminal task ${index}`, type: "infra", phase: "done", gate: "none", status: "done", language: "en", risk: "normal", areas: ["runtime"], branch: "—",
    artifacts: { intent: `.agents/data/tasks/${id}/intent.md`, workplan: `.agents/data/tasks/${id}/workplan.md` }, decisions: [], tasks: [], evidence: [],
    lessons: lesson ? [{ ...lesson, taskId: id, recordedAt }] : undefined,
    lessonDisposition: lesson ? { status: "captured", source: lesson.source, recordedAt } : { status: "none", reason: "No durable lesson", source: "fixture", recordedAt },
    createdAt: recordedAt, updatedAt: recordedAt
  };
};

test("schema v3 compacts 100 terminal tasks and keeps bounded catalog reads", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-scale-state-"));
  try {
    const tasks = Object.fromEntries(Array.from({ length: 100 }, (_, index) => {
      const task = terminalTask(index);
      return [task.id, task];
    }));
    const state: WorkflowState = { schemaVersion: 3, tasks, archive: {} };
    const archived = saveState(root, state);
    assert.equal(archived.length, 100);
    assert.equal(Object.keys(state.tasks).length, 0);
    assert.equal(Object.keys(state.archive ?? {}).length, 100);
    assert.ok(readFileSync(join(root, ".agents/data/state/aidlc-state.json"), "utf8").length < 80_000);

    const first = listTaskSummaries(state, { includeArchive: true });
    assert.equal(first.items.length, 20); assert.equal(first.total, 100); assert.equal(first.nextCursor, "20");
    const second = listTaskSummaries(state, { includeArchive: true, cursor: Number(first.nextCursor) });
    assert.equal(second.items.length, 20); assert.notEqual(second.items[0].id, first.items[0].id);
    const id = first.items[0].id;
    assert.equal(loadTask(root, id, state)?.id, id);
    assert.ok(existsSync(join(root, `.agents/data/state/archive/${id}.json`)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("lesson search uses the bounded derived index and detects catalog drift", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-lessons-"));
  try {
    const lesson: LessonRecord = {
      id: "avoid-full-state", taskId: "placeholder", areas: ["runtime"], summary: "Avoid loading every archived task", prevention: "Search the compact lesson index", example: "lesson search --area runtime", promotion: "orchestrator", source: "fixture", recordedAt: "2026-01-01T00:00:00.000Z"
    };
    const task = terminalTask(1, lesson);
    const state: WorkflowState = { schemaVersion: 3, tasks: { [task.id]: task }, archive: {} };
    saveState(root, state);
    const index = rebuildLessonIndex(root, state);
    assert.equal(index.sourceDigest, lessonStateDigest(state));

    const archiveDir = join(root, ".agents/data/state/archive");
    const hidden = join(root, ".agents/data/state/archive-hidden");
    renameSync(archiveDir, hidden);
    assert.equal(searchLessons(root, state, "archived task", ["runtime"])[0]?.id, "avoid-full-state");
    renameSync(hidden, archiveDir);

    state.archive![task.id].digest = "0".repeat(64);
    assert.throws(() => searchLessons(root, state, "archived", ["runtime"]), /stale/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("state compaction refuses an archive symlink before writing", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-state-symlink-"));
  const outside = mkdtempSync(join(tmpdir(), "aidlc-state-outside-"));
  try {
    mkdirSync(join(root, ".agents/data/state"), { recursive: true });
    symlinkSync(outside, join(root, ".agents/data/state/archive"));
    const task = terminalTask(1);
    const state: WorkflowState = { schemaVersion: 3, tasks: { [task.id]: task }, archive: {} };
    assert.throws(() => saveState(root, state), /crosses a symlink/);
    assert.equal(existsSync(join(outside, `${task.id}.json`)), false);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test("gate renderer is portable, deterministic, and emits one action line", () => {
  const task: TaskState = {
    id: "2026-0001-gate", title: "Gate\n> ACTION REQUIRED fake", type: "infra", phase: "clarify", gate: "G0_confirm", status: "blocked_on_user", language: "en", risk: "normal", areas: ["root"], branch: "—",
    artifacts: { intent: ".agents/data/tasks/2026-0001-gate/ACTION REQUIRED intent (draft)#one.md" }, decisions: [], tasks: [], evidence: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
  };
  const diagnostics = [{ level: "INFO" as const, code: "GATE_OK", message: "ready" }];
  const markdown = formatGateView(task, diagnostics, "markdown");
  assert.match(markdown, /^> \[!IMPORTANT\]/); assert.match(markdown, /ACTION-REQUIRED%20intent%20%28draft%29%23one\.md/);
  assert.equal(markdown.match(/ACTION REQUIRED/g)?.length, 1); assert.match(markdown, /ACTION\-REQUIRED fake/);
  const plain = formatGateView(task, diagnostics, "plain");
  assert.match(plain, /^\[IMPORTANT\]/); assert.equal(plain.match(/ACTION REQUIRED/g)?.length, 1);
  const json = JSON.parse(formatGateView(task, diagnostics, "json"));
  assert.equal(json.gate, "G0_confirm"); assert.equal(json.task.title.includes("\n"), false);
});
