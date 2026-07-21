import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyPlan, doctor, planInit, readManifest } from "../../src/installer.js";
import { legacyV021AdapterContents } from "../../src/legacy.js";
import type { InitOptions, PlannedWrite } from "../../src/model.js";
import { applyUpgrade, migrateLegacyBoard, planUpgrade } from "../../src/upgrade.js";

const makeRoot = () => mkdtempSync(join(tmpdir(), "aidlc-upgrade-"));
const options = (root: string): InitOptions => ({ root, agents: ["codex"], all: false, dryRun: false, yes: true, force: false });

test("current installation upgrades without touching project config or state", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(options(root)));
    const config = join(root, ".agents/config.json"); const state = join(root, ".agents/state/aidlc-state.json");
    writeFileSync(config, `${readFileSync(config, "utf8").trim()}\n`);
    const plan = planUpgrade(root);
    assert.equal(plan.some((item) => item.action === "conflict"), false);
    assert.equal(plan.find((item) => item.path === ".agents/config.json")?.action, "preserve");
    assert.equal(plan.find((item) => item.path === ".agents/state/aidlc-state.json")?.action, "preserve");
    assert.equal(plan.find((item) => item.path === ".agents/aidlc/manifest.json")?.action, "update");
    assert.ok(existsSync(state));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("upgrade migrates an existing legacy project config to .agents", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(options(root)));
    rmSync(join(root, ".agents/config.json"));
    mkdirSync(join(root, ".aidlc"), { recursive: true });
    writeFileSync(join(root, ".aidlc/config.json"), '{"schemaVersion":1,"legacy":true}\n');
    const plan = planUpgrade(root);
    assert.equal(plan.find((item) => item.path === ".agents/config.json")?.action, "migrate");
    assert.equal(plan.find((item) => item.path === ".aidlc/config.json")?.action, "delete");
    applyUpgrade(root, plan);
    assert.match(readFileSync(join(root, ".agents/config.json"), "utf8"), /legacy/);
    assert.equal(existsSync(join(root, ".aidlc/config.json")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("current canonical JSON installation removes a leftover BOARD projection", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(options(root)));
    const board = join(root, ".agents/state/BOARD.md");
    writeFileSync(board, "# AI-DLC BOARD\n\n_No tasks in flight._\n");
    const plan = planUpgrade(root);
    assert.equal(plan.find((item) => item.path === ".agents/state/BOARD.md")?.action, "delete");
    applyUpgrade(root, plan);
    assert.equal(existsSync(board), false);
    assert.deepEqual(JSON.parse(readFileSync(join(root, ".agents/state/aidlc-state.json"), "utf8")), { schemaVersion: 1, tasks: {} });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("modified managed core creates a conflict before any upgrade write", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(options(root)));
    const target = join(root, ".agents/aidlc/orchestrator.md");
    writeFileSync(target, `${readFileSync(target, "utf8")}local change\n`);
    const before = readFileSync(target, "utf8"); const plan = planUpgrade(root);
    assert.equal(plan.find((item) => item.path === ".agents/aidlc/orchestrator.md")?.action, "conflict");
    assert.throws(() => applyUpgrade(root, plan), /no files were written/);
    assert.equal(readFileSync(target, "utf8"), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("transaction stages all writes and leaves earlier targets unchanged on symlink rejection", () => {
  const root = makeRoot();
  try {
    writeFileSync(join(root, "a.txt"), "before\n");
    writeFileSync(join(root, "real.txt"), "real\n");
    symlinkSync(join(root, "real.txt"), join(root, "link.txt"));
    const spec = (path: string, content: string): PlannedWrite => ({ path, content, owner: "test", ownershipClass: "managed", action: "update", reason: "test" });
    assert.throws(() => applyUpgrade(root, [spec("a.txt", "after\n"), spec("link.txt", "bad\n")]), /symlink/);
    assert.equal(readFileSync(join(root, "a.txt"), "utf8"), "before\n");
    assert.equal(readFileSync(join(root, "real.txt"), "utf8"), "real\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("successful transaction creates an audit backup", () => {
  const root = makeRoot();
  try {
    writeFileSync(join(root, "a.txt"), "before\n");
    const plan: PlannedWrite[] = [{ path: "a.txt", content: "after\n", owner: "test", ownershipClass: "managed", action: "update", reason: "test" }];
    const result = applyUpgrade(root, plan);
    assert.equal(readFileSync(join(root, "a.txt"), "utf8"), "after\n");
    assert.ok(existsSync(join(root, result.backup, "journal.json")));
    assert.equal(readFileSync(join(root, result.backup, "a.txt"), "utf8"), "before\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("legacy BOARD migration preserves prose and reconstructs approval history", () => {
  const root = makeRoot();
  try {
    mkdirSync(join(root, ".agents/state"), { recursive: true });
    mkdirSync(join(root, ".agents/tasks/in-progress"), { recursive: true });
    const doc = ".agents/tasks/in-progress/01-01-2026-legacy.md";
    writeFileSync(join(root, doc), "---\ntask_id: 2026-0101-legacy\ntype: infra\nlanguage: en\n---\n# Legacy\n");
    writeFileSync(join(root, ".agents/state/BOARD.md"), "# AI-DLC BOARD\n\n| id | title | phase | gate | status | branch | submodules | doc |\n|----|-------|-------|------|--------|--------|------------|-----|\n| `2026-0101-legacy` | Legacy | build | G2_codereview | active | — | root | `.agents/tasks/in-progress/01-01-2026-legacy.md` |\n");
    const migrated = migrateLegacyBoard(root); const task = migrated.state.tasks["2026-0101-legacy"];
    assert.equal(task.phase, "build");
    assert.equal(task.language, "en");
    assert.ok(task.evidence.some((item) => item.gate === "G0_confirm"));
    assert.ok(task.evidence.some((item) => item.gate === "G1_review"));
    assert.ok(migrated.files.some((item) => item.path.endsWith("intent-design.md")));
    assert.ok(migrated.files.some((item) => item.path.endsWith("workplan.md")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recognized v0.2.1 core and adapter migrate end-to-end without conflicts", () => {
  const root = makeRoot();
  try {
    mkdirSync(join(root, ".agents/aidlc/rules"), { recursive: true });
    mkdirSync(join(root, ".agents/state"), { recursive: true });
    mkdirSync(join(root, ".agents/tasks/open"), { recursive: true });
    writeFileSync(join(root, ".agents/aidlc/manifest.json"), '{"schemaVersion":1,"workflow":"AI-DLC","source":"local-package-assets","remoteUpdates":false,"managedBy":"aidlc-workflow"}\n');
    writeFileSync(join(root, ".agents/aidlc/rules/gate-check.md"), "# Gate-check command (AI-DLC · project rule)\n\n> Project-specific executable for the gate self-check. The **generic contract** (what the command must accept/return, when to run it, manual fallback) lives in `.agents/aidlc/conventions.md §3`; this file holds the concrete command for THIS repo.\n\n## Command\n\n## Caveats\n");
    writeFileSync(join(root, "AGENTS.md"), legacyV021AdapterContents["AGENTS.md"]);
    const doc = ".agents/tasks/open/01-01-2026-legacy.md";
    writeFileSync(join(root, doc), "---\ntask_id: 2026-0101-legacy\ntype: infra\nlanguage: en\n---\n# Legacy\n");
    writeFileSync(join(root, ".agents/state/BOARD.md"), `# AI-DLC BOARD\n\n| id | title | phase | gate | status | branch | submodules | doc |\n|----|-------|-------|------|--------|--------|------------|-----|\n| \`2026-0101-legacy\` | Legacy | clarify | G0_confirm | blocked_on_user | — | root | \`${doc}\` |\n`);
    const plan = planUpgrade(root);
    assert.equal(plan.some((item) => item.action === "conflict"), false);
    assert.equal(plan.find((item) => item.path === ".agents/aidlc/rules/gate-check.md")?.action, "update");
    assert.equal(plan.find((item) => item.path === "AGENTS.md")?.action, "update");
    assert.equal(plan.find((item) => item.path === ".agents/state/aidlc-state.json")?.action, "migrate");
    applyUpgrade(root, plan);
    assert.equal(readManifest(root)?.schemaVersion, 2);
    assert.match(doctor(root, true), /^OK:/);
    assert.ok(JSON.parse(readFileSync(join(root, ".agents/state/aidlc-state.json"), "utf8")).tasks["2026-0101-legacy"]);
    assert.equal(existsSync(join(root, ".agents/state/BOARD.md")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("legacy BOARD migration refuses an unrecognized projection", () => {
  const root = makeRoot();
  try {
    mkdirSync(join(root, ".agents/state"), { recursive: true });
    writeFileSync(join(root, ".agents/state/BOARD.md"), "custom state that cannot be migrated\n");
    assert.throws(() => migrateLegacyBoard(root), /refusing lossy migration/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("legacy BOARD migration refuses a malformed task row", () => {
  const root = makeRoot();
  try {
    mkdirSync(join(root, ".agents/state"), { recursive: true });
    writeFileSync(join(root, ".agents/state/BOARD.md"), "# AI-DLC BOARD\n\n| broken | task | row |\n");
    assert.throws(() => migrateLegacyBoard(root), /malformed task row/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
