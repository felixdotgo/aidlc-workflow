import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadEvalSuite, releaseReady, resolveRunnerArguments, scoreScenario, type EvalReport, type RunnerResult } from "../../src/eval.js";
import { verifyReleaseEvidence } from "../../src/release.js";

test("bundled economy suite contains the approved 30-scenario distribution", () => {
  const suite = loadEvalSuite();
  assert.equal(suite.length, 30);
  assert.equal(suite.filter((item) => item.category === "clarify").length, 6);
  assert.equal(suite.filter((item) => item.category === "build").length, 8);
  assert.equal(suite.filter((item) => item.category === "upgrade-customization").length, 3);
});

test("scenario scoring and local release gate enforce quality thresholds", () => {
  const scenario = loadEvalSuite()[0];
  const result: RunnerResult = { status: "pass", transcript: `${scenario.requiredTerms.join(" ")} verified`, usage: { contextChars: 100 }, diagnostics: ["gate check passed", "tests passed"] };
  assert.equal(scoreScenario(scenario, result).score, 10);
  const report = (runner: string, passedReleaseGate = true): EvalReport => ({ runner, model: "economy", version: "pinned", scenarios: 30, completionRate: 1, averageScore: 9, structuralCompliance: 1, criticalViolations: 0, medianContextChars: 12_000, contextReduction: 0.64, passedReleaseGate, results: [] });
  assert.equal(releaseReady([report("a")]), true);
  assert.equal(releaseReady([report("a"), report("b")]), true);
  assert.equal(releaseReady([report("a"), report("b", false)]), false);
});

test("runner script paths resolve from the project root without escaping it", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-runner-root-"));
  try {
    assert.deepEqual(resolveRunnerArguments(root, ["./scripts/runner.mjs", "--mode", "safe"]), [join(root, "scripts/runner.mjs"), "--mode", "safe"]);
    assert.throws(() => resolveRunnerArguments(root, ["../runner.mjs"]), /escapes the project root/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("publish evidence accepts one pinned passing runner", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-release-"));
  const report = (runner: string): EvalReport => ({ runner, model: "economy", version: "pinned", scenarios: 30, completionRate: 1, averageScore: 9, structuralCompliance: 1, criticalViolations: 0, medianContextChars: 12_000, contextReduction: 0.64, passedReleaseGate: true, results: [] });
  try {
    const path = join(root, "release.json");
    writeFileSync(path, JSON.stringify({ packageVersion: "2.1.0", createdAt: new Date().toISOString(), reports: [report("a"), report("b")] }));
    assert.equal(verifyReleaseEvidence(path, "2.1.0").reports.length, 2);
    writeFileSync(path, JSON.stringify({ packageVersion: "2.1.0", createdAt: new Date().toISOString(), reports: [report("a")] }));
    assert.equal(verifyReleaseEvidence(path, "2.1.0").reports.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
