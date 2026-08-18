import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compileContext } from "../../src/context.js";
import type { AgenticMemoryEntry, TaskState, WorkflowState } from "../../src/model.js";
import { defaultConfig } from "../../src/profiles.js";
import { loadMemoryRegistry, migrateState, promoteAgenticMemory, retireAgenticMemory, saveState } from "../../src/state.js";

const task = (id = "2026-0001-memory"): TaskState => ({
  id, title: "Memory source", type: "infra", phase: "build", gate: "G2_codereview", status: "active", language: "en", risk: "normal", areas: ["runtime"], branch: "—",
  artifacts: { intent: `.agents/data/tasks/${id}/intent.md`, design: `.agents/data/tasks/${id}/design.md`, workplan: `.agents/data/tasks/${id}/workplan.md` }, decisions: [], tasks: [], evidence: [],
  lessons: [{ id: "rule-source", taskId: id, areas: ["runtime"], summary: "Keep rules ahead of advisory memory", prevention: "Load project rules before memory", example: "context packet", promotion: "candidate", source: "unit fixture", recordedAt: "2026-01-01T00:00:00.000Z" }],
  lessonDisposition: { status: "captured", source: "unit fixture", recordedAt: "2026-01-01T00:00:00.000Z" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
});

const entry = (): AgenticMemoryEntry => ({
  id: "rules-first", summary: "Rules precede advisory memory", guidance: "Treat project rules as higher precedence.", areas: ["runtime"], phases: ["build"], priority: 90,
  sourceTaskId: "2026-0001-memory", sourceLessonId: "rule-source", approvedBy: "explicit human approval", approvedAt: "2026-01-02T00:00:00.000Z"
});

test("agentic memory promotion is source-backed, scoped, ordered, and audited on retirement", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-memory-"));
  try {
    const source = task(); saveState(root, { schemaVersion: 3, tasks: { [source.id]: source }, archive: {} });
    assert.throws(() => promoteAgenticMemory(root, { ...entry(), sourceLessonId: "missing" }), /source lesson is missing/);
    promoteAgenticMemory(root, entry());
    assert.equal(loadMemoryRegistry(root).entries[0]?.id, "rules-first");

    mkdirSync(join(root, ".agents/project/rules"), { recursive: true });
    writeFileSync(join(root, ".agents/project/rules/runtime.md"), "Project rules are mandatory.");
    const config = defaultConfig(); config.rules.include = [".agents/project/rules/runtime.md"];
    const packet = compileContext(root, config, source, "build");
    assert.ok(packet.content.indexOf("Project rules are mandatory.") < packet.content.indexOf("## Advisory project memory"));
    assert.match(packet.content, /rules-first/);

    retireAgenticMemory(root, "rules-first", "superseded by an executable check", "explicit human approval", "2026-01-03T00:00:00.000Z");
    const registry = loadMemoryRegistry(root);
    assert.equal(registry.entries.length, 0); assert.equal(registry.retired[0]?.retiredBy, "explicit human approval");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("explicit migration compacts legacy terminal tasks and is idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-migrate-"));
  try {
    const active = task("2026-0002-active");
    const terminal = { ...task("2026-0003-terminal"), phase: "done" as const, gate: "none" as const, status: "done" as const, lessonDisposition: { status: "none" as const, reason: "none", source: "fixture", recordedAt: "2026-01-01T00:00:00.000Z" }, lessons: undefined };
    const legacy: WorkflowState = { schemaVersion: 2, tasks: { [active.id]: active, [terminal.id]: terminal } };
    mkdirSync(join(root, ".agents/data/state"), { recursive: true });
    writeFileSync(join(root, ".agents/data/state/aidlc-state.json"), `${JSON.stringify(legacy, null, 2)}\n`);
    assert.equal(migrateState(root).migrated, true);
    assert.equal(migrateState(root).migrated, false);
    const compact = JSON.parse(readFileSync(join(root, ".agents/data/state/aidlc-state.json"), "utf8"));
    assert.equal(compact.schemaVersion, 3); assert.equal(compact.tasks[active.id].id, active.id); assert.equal(compact.archive[terminal.id].status, "done");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
