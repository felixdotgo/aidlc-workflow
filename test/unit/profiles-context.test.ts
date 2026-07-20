import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compileContext } from "../../src/context.js";
import type { TaskState } from "../../src/model.js";
import { defaultConfig, includedRuleFiles, loadProjectConfig, resolveProfiles, validateProfile } from "../../src/profiles.js";

const task: TaskState = {
  id: "ctx", title: "Context", type: "infra", phase: "build", gate: "G2_codereview", status: "active", language: "en", risk: "normal", areas: ["root"], branch: "—",
  artifacts: {}, decisions: [{ id: "D", label: "Keep invariant", status: "approved" }], tasks: [], evidence: [], createdAt: "x", updatedAt: "x"
};

test("config and profiles are dependency-free, composable, and traversal-safe", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-profile-"));
  try {
    mkdirSync(join(root, ".aidlc/profiles/local/rules"), { recursive: true });
    writeFileSync(join(root, ".aidlc/profiles/local/profile.json"), JSON.stringify({ schemaVersion: 1, id: "local", extends: ["topology/single"], topology: "single", rules: { include: [".aidlc/rules/*.md"] } }));
    mkdirSync(join(root, ".aidlc/rules"), { recursive: true });
    writeFileSync(join(root, ".aidlc/rules/a.md"), "# A\n");
    writeFileSync(join(root, ".aidlc/config.json"), JSON.stringify({ ...defaultConfig(), extends: ["local"], rules: { include: [".aidlc/rules/*.md"] } }));
    assert.deepEqual(resolveProfiles(root, loadProjectConfig(root).extends).map((item) => item.id), ["topology/single", "local"]);
    assert.equal(includedRuleFiles(root, [".aidlc/rules/*.md"]).length, 1);
    const outside = mkdtempSync(join(tmpdir(), "aidlc-outside-"));
    try {
      writeFileSync(join(outside, "escape.md"), "secret");
      symlinkSync(join(outside, "escape.md"), join(root, ".aidlc/rules/escape.md"));
      assert.equal(includedRuleFiles(root, [".aidlc/rules/*.md"]).length, 1);
    } finally { rmSync(outside, { recursive: true, force: true }); }
    assert.throws(() => validateProfile({ schemaVersion: 1, id: "bad", topology: "single", specs: { roots: ["../secret"] } }), /inside the project/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("context packet includes canonical decisions and honors the configured budget", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-context-"));
  try {
    const config = defaultConfig(); config.context.maxChars = 8_000;
    const packet = compileContext(root, config, task, "build");
    assert.ok(packet.chars <= 8_000);
    assert.match(packet.content, /Keep invariant/);
    assert.match(packet.content, /Agents never run or detect upgrades/);
    assert.ok(packet.estimatedTokens > 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("context compiler refuses to truncate canonical decisions and invariants", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-context-large-"));
  try {
    const config = defaultConfig(); config.context.maxChars = 4_000;
    const oversized = { ...task, decisions: Array.from({ length: 80 }, (_, index) => ({ id: `D${index}`, label: "x".repeat(100), status: "approved" as const })) };
    assert.throws(() => compileContext(root, config, oversized, "build"), /too small/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
