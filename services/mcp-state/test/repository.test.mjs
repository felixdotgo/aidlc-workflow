import assert from "node:assert/strict";
import test from "node:test";
import { RevisionConflict, SqliteStateRepository } from "../src/repository.mjs";
import { providerPreflight } from "../src/providers.mjs";

const task = { id: "T1", title: "First", type: "infra", phase: "clarify", gate: "G0_confirm", status: "active", language: "en", risk: "normal", areas: ["root"], branch: "—", artifacts: { intent: ".agents/data/tasks/T1/intent.md", design: ".agents/data/tasks/T1/design.md", workplan: ".agents/data/tasks/T1/workplan.md" }, decisions: [], tasks: [], evidence: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

test("SQLite repository serializes revisions, indexes, events and idempotent retries", async () => {
  const repository = new SqliteStateRepository(":memory:");
  try {
    const initial = await repository.get("demo");
    assert.equal(initial.revision, 0);
    const first = await repository.apply("demo", 0, "request-1", { type: "upsertTask", taskId: "T1", task });
    assert.equal(first.revision, 1); assert.deepEqual(first.index.taskIds, ["T1"]);
    assert.equal(first.nextActions.T1.classification, "run_phase");
    const retry = await repository.apply("demo", 0, "request-1", { type: "upsertTask", taskId: "T1", task: { ...task, title: "ignored" } });
    assert.deepEqual(retry, first);
    await assert.rejects(() => repository.apply("demo", 0, "request-2", { type: "removeTask", taskId: "T1" }), RevisionConflict);
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
    const first = await repository.apply("loop", 0, "build", { type: "upsertTask", taskId: "T1", task: build });
    assert.equal(first.nextActions.T1.itemId, "T2"); assert.equal(first.nextActions.T1.remainingItems, 1);

    await assert.rejects(() => repository.apply("loop", first.revision, "premature", { type: "upsertTask", taskId: "T1", task: { ...build, status: "blocked_on_user" } }), /cannot enter blocked_on_user/);

    const ready = {
      ...build, status: "blocked_on_user", tasks: build.tasks.map((item) => ({ ...item, status: "done" })),
      evidence: [...build.evidence,
        { kind: "test", area: "root", source: "service test", result: "pass", recordedAt: "2026-01-01T00:00:02.000Z" },
        { kind: "review", source: "service review", result: "pass", recordedAt: "2026-01-01T00:00:03.000Z" }
      ]
    };
    const prepared = await repository.apply("loop", first.revision, "ready", { type: "upsertTask", taskId: "T1", task: ready });
    assert.equal(prepared.nextActions.T1.classification, "await_user");

    await assert.rejects(() => repository.apply("loop", prepared.revision, "silent-cancel", { type: "upsertTask", taskId: "T1", task: { ...ready, status: "active" } }), /Cancelled gate wait/);
    const cancelled = await repository.apply("loop", prepared.revision, "audited-cancel", { type: "upsertTask", taskId: "T1", task: { ...ready, status: "active", evidence: [...ready.evidence, { kind: "diagnostic", result: "pass", source: "user rejection message", detail: "Cancelled gate wait at G2_codereview: changes requested", recordedAt: "2026-01-01T00:00:04.000Z" }] } });
    assert.equal(cancelled.nextActions.T1.classification, "run_phase");
  } finally { repository.close(); }
});

test("service transitions preserve lifecycle gates and provider preflights redact credentials", async () => {
  const repository = new SqliteStateRepository(":memory:");
  try {
    const first = await repository.apply("demo", 0, "create", { type: "upsertTask", taskId: "T1", task });
    await assert.rejects(() => repository.apply("demo", first.revision, "skip-g0", { type: "transition", taskId: "T1", target: "plan" }), /G0 approval/);
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
      repository.apply("concurrent", 0, "left", { type: "upsertTask", taskId: "T1", task }),
      repository.apply("concurrent", 0, "right", { type: "upsertTask", taskId: "T2", task: { ...task, id: "T2", artifacts: { intent: ".agents/data/tasks/T2/intent.md", design: ".agents/data/tasks/T2/design.md", workplan: ".agents/data/tasks/T2/workplan.md" } } })
    ]);
    assert.equal([left, right].filter((item) => item.status === "fulfilled").length, 1);
    assert.equal([left, right].filter((item) => item.status === "rejected" && item.reason instanceof RevisionConflict).length, 1);
    assert.equal((await repository.get("concurrent")).revision, 1);
  } finally { repository.close(); }
});
