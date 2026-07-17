import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { applyPlan, doctor, planInit, planUninstall } from "../../src/installer.js";
import type { InitOptions } from "../../src/model.js";

const makeRoot = () => mkdtempSync(join(tmpdir(), "aidlc-workflow-"));
const baseOptions = (root: string): InitOptions => ({ root, agents: ["cursor"], all: false, dryRun: false, yes: true, force: false });

test("plans and installs only local workflow assets", () => {
  const root = makeRoot();
  try {
    const plan = planInit(baseOptions(root));
    assert.equal(plan.some((item) => item.action === "conflict"), false);
    assert.ok(plan.some((item) => item.path === ".cursor/rules/aidlc.mdc"));
    assert.ok(plan.every((item) => !/https?:\/\/|aws/i.test(item.content)));
    applyPlan(root, plan);
    assert.match(readFileSync(join(root, ".agents/aidlc/manifest.json"), "utf8"), /"remoteUpdates": false/);
    assert.ok(plan.some((item) => item.path === ".agents/aidlc/orchestrator.md"));
    assert.ok(plan.some((item) => item.path === ".agents/skills/aidlc-build/SKILL.md"));
    assert.ok(plan.some((item) => item.path === ".agents/state/BOARD.md"));
    assert.match(readFileSync(join(root, ".cursor/rules/aidlc.mdc"), "utf8"), /alwaysApply: true/);
    assert.match(doctor(root), /^OK:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renders a tested integration file for every official adapter", () => {
  const root = makeRoot();
  try {
    const plan = planInit({ ...baseOptions(root), all: true });
    for (const path of [
      "CLAUDE.md",
      ".claude/skills/aidlc/SKILL.md",
      "AGENTS.md",
      ".cursor/rules/aidlc.mdc",
      ".agents/rules/aidlc.md",
      ".kiro/steering/aidlc.md"
    ]) {
      const file = plan.find((item) => item.path === path);
      assert.ok(file, `missing ${path}`);
      assert.match(file.content, /Read `.agents\/aidlc\/orchestrator.md`/);
      assert.match(file.content, /\n# AI-DLC/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an adapter without a dedicated contract", () => {
  const root = makeRoot();
  try {
    assert.throws(() => planInit({ ...baseOptions(root), agents: ["unknown" as "cursor"] }), /Unsupported adapter/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("package source and local workflow assets have no remote URL or runtime fetch call", () => {
  const source = [
    ...readdirSync(resolve("src")).filter((entry) => entry.endsWith(".ts")).map((entry) => resolve("src", entry)),
    resolve(".agents/aidlc/orchestrator.md"),
    resolve(".agents/aidlc/phase-build.md")
  ]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test("protects an unmanaged non-merge adapter file until force is explicit", () => {
  const root = makeRoot();
  try {
    mkdirSync(join(root, ".cursor", "rules"), { recursive: true });
    writeFileSync(join(root, ".cursor/rules/aidlc.mdc"), "# Existing instructions\n");
    const plan = planInit({ ...baseOptions(root), agents: ["cursor"] });
    assert.equal(plan.find((item) => item.path === ".cursor/rules/aidlc.mdc")?.action, "conflict");
    const forced = planInit({ ...baseOptions(root), agents: ["cursor"], force: true });
    assert.equal(forced.find((item) => item.path === ".cursor/rules/aidlc.mdc")?.action, "update");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recognizes the manifest ownership field on later updates", () => {
  const root = makeRoot();
  try {
    const first = planInit(baseOptions(root));
    applyPlan(root, first);
    writeFileSync(join(root, ".agents/aidlc/manifest.json"), '{\n  "managedBy": "aidlc-workflow",\n  "schemaVersion": 0\n}\n');
    assert.equal(planInit(baseOptions(root)).find((item) => item.path === ".agents/aidlc/manifest.json")?.action, "update");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI previews by default and writes only with --yes", () => {
  const root = makeRoot();
  try {
    const cli = resolve("dist/src/cli.js");
    const preview = execFileSync(process.execPath, [cli, "init", root, "--agent", "kiro"], { encoding: "utf8" });
    assert.match(preview, /Preview only/);
    assert.throws(() => readFileSync(join(root, ".agents/aidlc/manifest.json"), "utf8"));
    const installed = execFileSync(process.execPath, [cli, "init", root, "--agent", "kiro", "--yes"], { encoding: "utf8" });
    assert.match(installed, /Installed local AI-DLC workflow assets/);
    assert.match(readFileSync(join(root, ".kiro/steering/aidlc.md"), "utf8"), /AI-DLC for Kiro/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI auto-selects exactly one detected agent", () => {
  const root = makeRoot();
  try {
    mkdirSync(join(root, ".kiro"), { recursive: true });
    const cli = resolve("dist/src/cli.js");
    const output = execFileSync(process.execPath, [cli, "init", root, "--yes"], { encoding: "utf8" });
    assert.match(output, /Auto-selected detected agent: kiro/);
    assert.match(readFileSync(join(root, ".kiro/steering/aidlc.md"), "utf8"), /AI-DLC for Kiro/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uninstall removes verified assets but preserves the task board", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(baseOptions(root)));
    const board = join(root, ".agents/state/BOARD.md");
    const cursorRule = join(root, ".cursor/rules/aidlc.mdc");
    const removal = planUninstall(root);
    assert.equal(removal.find((item) => item.path === ".agents/state/BOARD.md")?.action, "skip");
    assert.equal(removal.find((item) => item.path === ".cursor/rules/aidlc.mdc")?.action, "delete");
    applyPlan(root, removal);
    assert.ok(existsSync(board));
    assert.equal(existsSync(cursorRule), false);
    assert.equal(existsSync(join(root, ".agents/aidlc/manifest.json")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uninstall preserves a modified managed adapter file", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(baseOptions(root)));
    const cursorRule = join(root, ".cursor/rules/aidlc.mdc");
    writeFileSync(cursorRule, `${readFileSync(cursorRule, "utf8")}# Local addition\n`);
    const removal = planUninstall(root);
    assert.equal(removal.find((item) => item.path === ".cursor/rules/aidlc.mdc")?.action, "skip");
    assert.equal(removal.find((item) => item.path === ".agents/aidlc/manifest.json")?.action, "skip");
    applyPlan(root, removal);
    assert.match(readFileSync(cursorRule, "utf8"), /Local addition/);
    assert.ok(existsSync(join(root, ".agents/aidlc/manifest.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("merges the Claude prompt block without replacing existing instructions", () => {
  const root = makeRoot();
  try {
    writeFileSync(join(root, "CLAUDE.md"), "# Team rules\n");
    const plan = planInit({ ...baseOptions(root), agents: ["claude"] });
    applyPlan(root, plan);
    const content = readFileSync(join(root, "CLAUDE.md"), "utf8");
    assert.match(content, /# Team rules/);
    assert.match(content, /aidlc-installer:claude/);
    assert.match(content, /\.agents\/aidlc\/orchestrator.md/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
