import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RevisionConflict, SqliteStateRepository } from "../src/repository.mjs";
import { nextAction } from "../src/lifecycle-core.mjs";
import { providerPreflight } from "../src/providers.mjs";

const task = { id: "T1", title: "First", type: "infra", phase: "clarify", gate: "G0_confirm", status: "active", language: "en", risk: "normal", areas: ["root"], branch: "—", artifacts: { intent: ".agents/data/tasks/T1/intent.md", design: ".agents/data/tasks/T1/design.md", workplan: ".agents/data/tasks/T1/workplan.md" }, decisions: [], tasks: [], evidence: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

test("SQLite repository serializes revisions, indexes, events and idempotent retries", async () => {
  const repository = new SqliteStateRepository(":memory:");
  try {
    const initial = await repository.get("demo");
    assert.equal(initial.revision, 0);
    const first = await repository.apply("demo", 0, "request-1", { type: "upsertTask", taskId: "T1", task }, "/workspace/project");
    assert.equal(first.revision, 1); assert.deepEqual(first.index.taskIds, ["T1"]);
    assert.equal(first.nextActions.T1.classification, "run_phase");
    assert.match(first.nextActions.T1.command, /^node "\/workspace\/project\/\.agents\/aidlc\/scripts\/context\.mjs"/);
    assert.match(first.nextActions.T1.command, /--root "\/workspace\/project"/);
    const retry = await repository.apply("demo", 0, "request-1", { type: "upsertTask", taskId: "T1", task: { ...task, title: "ignored" } }, "/workspace/project");
    assert.deepEqual(retry, first);
    await assert.rejects(() => repository.apply("demo", 0, "request-2", { type: "removeTask", taskId: "T1" }, "/workspace/project"), RevisionConflict);
    const events = await repository.eventsSince("demo");
    assert.equal(events.length, 1); assert.equal(events[0].revision, 1);
  } finally { repository.close(); }
});

test("service mutation responses preserve multi-item continuation and reject premature G2 waits", async () => {
  const repository = new SqliteStateRepository(":memory:");
  try {
    const build = {
      ...task, phase: "build", gate: "G2_codereview", status: "active",
      tasks: [{ id: "T1", label: "First", status: "done" }, { id: "T2", label: "Second", status: "todo" }],
      evidence: [{ kind: "approval", gate: "G1_review", source: "human", result: "pass", recordedAt: "2026-01-01T00:00:01.000Z" }]
    };
    const first = await repository.apply("loop", 0, "build", { type: "upsertTask", taskId: "T1", task: build }, "/workspace/project");
    assert.equal(first.nextActions.T1.itemId, "T2"); assert.equal(first.nextActions.T1.remainingItems, 1);

    await assert.rejects(() => repository.apply("loop", first.revision, "premature", { type: "upsertTask", taskId: "T1", task: { ...build, status: "blocked_on_user" } }, "/workspace/project"), /cannot enter or hold blocked_on_user/);

    const ready = {
      ...build, status: "blocked_on_user", tasks: build.tasks.map((item) => ({ ...item, status: "done" })),
      evidence: [...build.evidence,
        { kind: "test", area: "root", source: "service test", result: "pass", recordedAt: "2026-01-01T00:00:02.000Z" },
        { kind: "review", source: "service review", result: "pass", recordedAt: "2026-01-01T00:00:03.000Z" }
      ]
    };
    const prepared = await repository.apply("loop", first.revision, "ready", { type: "upsertTask", taskId: "T1", task: ready }, "/workspace/project");
    assert.equal(prepared.nextActions.T1.classification, "await_user");

    await assert.rejects(() => repository.apply("loop", prepared.revision, "silent-cancel", { type: "upsertTask", taskId: "T1", task: { ...ready, status: "active" } }, "/workspace/project"), /same-gate approval, audited cancellation, or sourced closure\/handoff/);
    await assert.rejects(() => repository.apply("loop", prepared.revision, "paused-bypass", { type: "upsertTask", taskId: "T1", task: { ...ready, status: "paused" } }, "/workspace/project"), /same-gate approval, audited cancellation, or sourced closure\/handoff/);
    await assert.rejects(() => repository.apply("loop", prepared.revision, "replace-bypass", { type: "replaceState", state: { schemaVersion: 3, tasks: { T1: { ...ready, status: "active" } }, archive: {} } }, "/workspace/project"), /same-gate approval, audited cancellation, or sourced closure\/handoff/);
    await assert.rejects(() => repository.apply("loop", prepared.revision, "remove-bypass", { type: "removeTask", taskId: "T1" }, "/workspace/project"), /cannot be removed while waiting/);
    const validCancellation = { kind: "diagnostic", result: "pass", source: "user rejection message", detail: "Cancelled gate wait at G2_codereview: changes requested", recordedAt: "2026-01-01T00:00:04.000Z" };
    const tampered = structuredClone(ready); tampered.status = "active"; tampered.evidence[1].result = "fail"; tampered.evidence.push(validCancellation);
    await assert.rejects(() => repository.apply("loop", prepared.revision, "tampered-prefix", { type: "upsertTask", taskId: "T1", task: tampered }, "/workspace/project"), /evidence history is append-only/);
    const wrongGate = { ...ready, status: "active", evidence: [...ready.evidence, { ...validCancellation, detail: "Cancelled gate wait at G1_review: changes requested" }] };
    await assert.rejects(() => repository.apply("loop", prepared.revision, "wrong-gate", { type: "upsertTask", taskId: "T1", task: wrongGate }, "/workspace/project"), /same-gate approval, audited cancellation, or sourced closure\/handoff/);
    const cancelled = await repository.apply("loop", prepared.revision, "audited-cancel", { type: "upsertTask", taskId: "T1", task: { ...ready, status: "active", evidence: [...ready.evidence, validCancellation] } }, "/workspace/project");
    assert.equal(cancelled.nextActions.T1.classification, "run_phase");
  } finally { repository.close(); }
});

const exhaustedEvidence = [
  { kind: "approval", gate: "G1_review", source: "human", result: "pass", recordedAt: "2026-01-01T00:00:01.000Z" },
  { kind: "test", area: "root", source: "t", result: "fail", recordedAt: "2026-01-01T00:00:02.000Z" },
  { kind: "test", area: "root", source: "t", result: "fail", recordedAt: "2026-01-01T00:00:03.000Z" },
  { kind: "lint", area: "root", source: "l", result: "fail", recordedAt: "2026-01-01T00:00:04.000Z" },
  { kind: "test", area: "root", source: "t", result: "pass", recordedAt: "2026-01-01T00:00:05.000Z" },
  { kind: "lint", area: "root", source: "l", result: "pass", recordedAt: "2026-01-01T00:00:06.000Z" },
  { kind: "review", source: "r", result: "pass", recordedAt: "2026-01-01T00:00:07.000Z" }
];
const exhaustedWait = { ...task, phase: "build", gate: "G2_codereview", status: "blocked_on_user", tasks: [{ id: "I1", label: "x", status: "done" }], evidence: exhaustedEvidence };

const seedLegacyRow = (state) => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-legacy-"));
  const file = join(dir, "state.db");
  const db = new Database(file);
  db.exec("CREATE TABLE state_workspaces (workspace TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL, task_index TEXT NOT NULL, updated_at TEXT NOT NULL)");
  db.prepare("INSERT INTO state_workspaces VALUES (?, ?, ?, ?, ?)").run("legacy", 7, JSON.stringify(state), JSON.stringify({ schemaVersion: 1, sourceRevision: 7, taskIds: Object.keys(state.tasks), updatedAt: "2026-01-01T00:00:00.000Z" }), "2026-01-01T00:00:00.000Z");
  db.close();
  return { dir, file };
};

test("an exhausted repair bound cannot enter a G2 wait, and legacy stamps stay migration-owned", async () => {
  const repository = new SqliteStateRepository(":memory:");
  try {
    assert.equal(nextAction(exhaustedWait).classification, "blocked");
    await assert.rejects(() => repository.apply("w", 0, "enter", { type: "upsertTask", taskId: "T1", task: exhaustedWait }, "/workspace/project"), /cannot enter or hold blocked_on_user/);
    await assert.rejects(() => repository.apply("w", 0, "import-v3", { type: "replaceState", state: { schemaVersion: 3, tasks: { T1: exhaustedWait }, archive: {} } }, "/workspace/project"), /cannot enter or hold blocked_on_user/);
    await assert.rejects(() => repository.apply("w", 0, "forge-stamp", { type: "replaceState", state: { schemaVersion: 4, tasks: { T1: { ...exhaustedWait, legacyG2Wait: { migratedAt: "2026-01-01T00:00:00.000Z", source: "schema-v4-migration" } } }, archive: {} } }, "/workspace/project"), /migration-owned/);
  } finally { repository.close(); }
});

test("a stored pre-v4 row is stamped deterministically and the stamped wait stays approvable but tamper-proof", async () => {
  const { dir, file } = seedLegacyRow({ schemaVersion: 3, tasks: { T1: exhaustedWait }, archive: {} });
  const repository = new SqliteStateRepository(file);
  try {
    const snap = await repository.get("legacy");
    assert.equal(snap.state.schemaVersion, 4);
    assert.deepEqual(snap.state.tasks.T1.legacyG2Wait, { migratedAt: exhaustedWait.updatedAt, source: "schema-v4-migration" });
    assert.equal(nextAction(snap.state.tasks.T1).classification, "await_user");
    const echoed = await repository.apply("legacy", 7, "echo", { type: "replaceState", state: snap.state }, "/workspace/project");
    assert.equal(echoed.state.schemaVersion, 4);
    const tampered = structuredClone(echoed.state);
    tampered.tasks.T1.legacyG2Wait = { migratedAt: "2027-01-01T00:00:00.000Z", source: "schema-v4-migration" };
    await assert.rejects(() => repository.apply("legacy", echoed.revision, "tamper", { type: "replaceState", state: tampered }, "/workspace/project"), /migration-owned/);
  } finally { repository.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("a legacy gateless wrap wait accepts exactly the recovery the cores recommend", async () => {
  const gateless = { ...task, phase: "wrap", gate: "none", status: "blocked_on_user", tasks: [{ id: "I1", label: "x", status: "done" }], evidence: [...exhaustedEvidence.slice(0, 1), { kind: "test", area: "root", source: "t", result: "pass", recordedAt: "2026-01-01T00:00:02.000Z" }, { kind: "review", source: "r", result: "pass", recordedAt: "2026-01-01T00:00:03.000Z" }, { kind: "approval", gate: "G2_codereview", source: "human", result: "pass", recordedAt: "2026-01-01T00:00:04.000Z" }] };
  {
    const { dir, file } = seedLegacyRow({ schemaVersion: 3, tasks: { T1: gateless }, archive: {} });
    const repository = new SqliteStateRepository(file);
    try {
      const snap = await repository.get("legacy");
      assert.equal(nextAction(snap.state.tasks.T1).classification, "run_phase");
      await assert.rejects(() => repository.apply("legacy", 7, "recover-and-rewrite", { type: "upsertTask", taskId: "T1", task: { ...snap.state.tasks.T1, status: "active", artifacts: {} } }, "/workspace/project"), /may only return the wait to active/);
      const recovered = await repository.apply("legacy", 7, "recover", { type: "upsertTask", taskId: "T1", task: { ...snap.state.tasks.T1, status: "active" } }, "/workspace/project");
      assert.equal(recovered.state.tasks.T1.status, "active");
      assert.equal(recovered.nextActions.T1.classification, "run_phase");
    } finally { repository.close(); rmSync(dir, { recursive: true, force: true }); }
  }
  {
    const { dir, file } = seedLegacyRow({ schemaVersion: 3, tasks: { T1: gateless }, archive: {} });
    const repository = new SqliteStateRepository(file);
    try {
      await assert.rejects(() => repository.apply("legacy", 7, "hop", { type: "upsertTask", taskId: "T1", task: { ...gateless, status: "paused" } }, "/workspace/project"), /cannot leave none/);
    } finally { repository.close(); rmSync(dir, { recursive: true, force: true }); }
  }
});

test("a parked wait is frozen except evidence, while sourced closure and handoff exits are honoured", async () => {
  const ready = { ...task, phase: "build", gate: "G2_codereview", status: "blocked_on_user", tasks: [{ id: "I1", label: "x", status: "done" }], evidence: exhaustedEvidence.filter((item) => item.result === "pass") };
  const seed = async (repository) => repository.apply("w", 0, "seed", { type: "upsertTask", taskId: "T1", task: ready }, "/workspace/project");
  {
    const repository = new SqliteStateRepository(":memory:");
    try {
      const seeded = await seed(repository);
      assert.equal(seeded.nextActions.T1.classification, "await_user");
      await assert.rejects(() => repository.apply("w", seeded.revision, "wipe", { type: "upsertTask", taskId: "T1", task: { ...ready, artifacts: {} } }, "/workspace/project"), /frozen while waiting/);
      await assert.rejects(() => repository.apply("w", seeded.revision, "reopen-item", { type: "upsertTask", taskId: "T1", task: { ...ready, tasks: [{ id: "I1", label: "x", status: "todo" }] } }, "/workspace/project"), /frozen while waiting/);
      const handedOff = await repository.apply("w", seeded.revision, "handoff", { type: "upsertTask", taskId: "T1", task: { ...ready, status: "paused", handoff: { kind: "g2_failed", reason: "human rejected the diff", source: "user message", recordedAt: "2026-01-01T00:00:08.000Z" } } }, "/workspace/project");
      assert.equal(handedOff.state.tasks.T1.status, "paused");
    } finally { repository.close(); }
  }
  {
    const repository = new SqliteStateRepository(":memory:");
    try {
      const seeded = await seed(repository);
      const closed = await repository.apply("w", seeded.revision, "close", { type: "upsertTask", taskId: "T1", task: { ...ready, status: "closed", closure: { reason: "stop remediation", source: "user message", recordedAt: "2026-01-01T00:00:08.000Z" } } }, "/workspace/project");
      assert.equal(closed.nextActions.T1.classification, "terminal");
    } finally { repository.close(); }
  }
});

test("service transitions preserve lifecycle gates and provider preflights redact credentials", async () => {
  const repository = new SqliteStateRepository(":memory:");
  try {
    const first = await repository.apply("demo", 0, "create", { type: "upsertTask", taskId: "T1", task }, "/workspace/project");
    await assert.rejects(() => repository.apply("demo", first.revision, "skip-g0", { type: "transition", taskId: "T1", target: "plan" }, "/workspace/project"), /G0 approval/);
    const original = { baseUrl: process.env.JIRA_BASE_URL, token: process.env.JIRA_TOKEN };
    process.env.JIRA_BASE_URL = "https://jira.example.test"; process.env.JIRA_TOKEN = "never-return-this";
    try {
      const preflight = providerPreflight("jira", "PROJ-1", "update", { summary: "safe" });
      assert.deepEqual(preflight.credentialEnv, ["JIRA_BASE_URL", "JIRA_TOKEN"]);
      assert.equal(JSON.stringify(preflight).includes("never-return-this"), false);
      assert.equal(JSON.stringify(preflight).includes("Authorization"), false);
    } finally {
      if (original.baseUrl === undefined) delete process.env.JIRA_BASE_URL; else process.env.JIRA_BASE_URL = original.baseUrl;
      if (original.token === undefined) delete process.env.JIRA_TOKEN; else process.env.JIRA_TOKEN = original.token;
    }
  } finally { repository.close(); }
});

test("concurrent writes never produce last-write-wins state", async () => {
  const repository = new SqliteStateRepository(":memory:");
  try {
    const [left, right] = await Promise.allSettled([
      repository.apply("concurrent", 0, "left", { type: "upsertTask", taskId: "T1", task }, "/workspace/project"),
      repository.apply("concurrent", 0, "right", { type: "upsertTask", taskId: "T2", task: { ...task, id: "T2", artifacts: { intent: ".agents/data/tasks/T2/intent.md", design: ".agents/data/tasks/T2/design.md", workplan: ".agents/data/tasks/T2/workplan.md" } } }, "/workspace/project")
    ]);
    assert.equal([left, right].filter((item) => item.status === "fulfilled").length, 1);
    assert.equal([left, right].filter((item) => item.status === "rejected" && item.reason instanceof RevisionConflict).length, 1);
    assert.equal((await repository.get("concurrent")).revision, 1);
  } finally { repository.close(); }
});
