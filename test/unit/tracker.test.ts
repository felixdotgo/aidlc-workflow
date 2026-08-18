import assert from "node:assert/strict";
import test from "node:test";
import { executeBacklog, gateUpdate, resolveTracker } from "../../src/tracker.js";

const config = { enabled: true as const, provider: "backlog" as const, spaceUrl: "https://team.backlog.com", project: "TEAM", tokenEnv: "BACKLOG_TOKEN", workflow: "waterfall" as const, mapping: { statuses: { build: 3 } } };

test("tracker stays Git-only without an explicit usable token", async () => {
  const resolution = resolveTracker(config, {});
  let called = false;
  const result = await executeBacklog(resolution, { method: "GET", path: "rateLimit" }, async () => { called = true; throw new Error("must not call"); });
  assert.equal(called, false); assert.equal(result.ok, false);
});

test("Backlog gate writes are mapped and idempotency-labelled", () => {
  assert.deepEqual(gateUpdate(config, "TEAM-1", "build", "event-123"), { method: "PATCH", path: "issues/TEAM-1", form: { statusId: 3, comment: "[aidlc:event-123] build" } });
  const scrum = { ...config, workflow: "scrum" as const, mapping: { gateFieldId: 9 } };
  assert.deepEqual(gateUpdate(scrum, "TEAM-1", "plan", "event-456").form, { customField_9: "plan", comment: "[aidlc:event-456] plan" });
});
