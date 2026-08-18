import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const cli = resolve("dist/dev/evaluator/cli.js");

test("repository evaluator CLI reads development config and writes non-overwriting evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-dev-eval-cli-"));
  try {
    const runner = join(root, "runner.mjs"); const config = join(root, "config.json");
    writeFileSync(runner, 'process.stdin.once("data", () => process.stdout.write(JSON.stringify({ transport: "completed", transcript: "ok", events: [] })));\n');
    writeFileSync(config, JSON.stringify({ runners: { fixture: { command: "node", args: [runner], adapter: "codex", model: "fixture", version: "local", protocolVersion: 2, evidenceKind: "simulated" } }, suites: {}, policy: {} }));
    const listed = spawnSync(process.execPath, [cli, "list", "--config", config], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr); assert.deepEqual(JSON.parse(listed.stdout).runners, ["fixture"]);
    const output = ".agents/data/evaluation/fixture.json";
    const run = spawnSync(process.execPath, [cli, "run", "--config", config, "--runner", "fixture", "--scenario", "clarify-read-only", "--output", output, "--root", root], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const rerun = spawnSync(process.execPath, [cli, "run", "--config", config, "--runner", "fixture", "--scenario", "clarify-read-only", "--output", output, "--root", root], { encoding: "utf8" });
    assert.equal(rerun.status, 1); assert.match(rerun.stderr, /Refusing to overwrite/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
