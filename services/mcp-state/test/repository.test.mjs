import assert from "node:assert/strict";
import test from "node:test";
import { RevisionConflict, SqliteStateRepository } from "../src/repository.mjs";

test("SQLite repository serializes revisions, indexes, events and idempotent retries", async () => {
  const repository = new SqliteStateRepository(":memory:");
  try {
    const initial = await repository.get("demo");
    assert.equal(initial.revision, 0);
    const first = await repository.apply("demo", 0, "request-1", { type: "upsertTask", taskId: "T1", task: { title: "First" } });
    assert.equal(first.revision, 1); assert.deepEqual(first.index.taskIds, ["T1"]);
    const retry = await repository.apply("demo", 0, "request-1", { type: "upsertTask", taskId: "T1", task: { title: "ignored" } });
    assert.deepEqual(retry, first);
    await assert.rejects(() => repository.apply("demo", 0, "request-2", { type: "removeTask", taskId: "T1" }), RevisionConflict);
    const events = await repository.eventsSince("demo");
    assert.equal(events.length, 1); assert.equal(events[0].revision, 1);
  } finally { repository.close(); }
});
