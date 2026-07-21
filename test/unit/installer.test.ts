import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { adapters } from "../../src/adapters.js";
import { applyPlan, doctor, planInit, planUninstall, readManifest, status } from "../../src/installer.js";
import type { InitOptions } from "../../src/model.js";

const makeRoot = () => mkdtempSync(join(tmpdir(), "aidlc-v1-"));
const options = (root: string): InitOptions => ({ root, agents: ["cursor"], all: false, dryRun: false, yes: true, force: false });

test("package exposes only the npx-oriented workflow binary name", () => {
  const manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  assert.deepEqual(manifest.bin, { "aidlc-workflow": "dist/src/cli.js" });
});

test("installs bundled assets with manifest v2 and separate project/state ownership", () => {
  const root = makeRoot();
  try {
    const plan = planInit(options(root));
    assert.equal(plan.some((item) => item.action === "conflict"), false);
    assert.equal(plan.find((item) => item.path === ".agents/config.json")?.ownershipClass, "project");
    assert.equal(plan.find((item) => item.path === ".agents/state/aidlc-state.json")?.ownershipClass, "state");
    applyPlan(root, plan);
    const manifest = readManifest(root);
    assert.equal(manifest?.schemaVersion, 2);
    assert.equal(manifest?.packageVersion, "2.1.0");
    assert.equal(manifest?.remoteUpdates, false);
    assert.ok(manifest?.files[".agents/aidlc/orchestrator.md"]);
    assert.ok(manifest?.files[".agents/aidlc/templates/model-contract.md"]);
    assert.ok(manifest?.files[".agents/aidlc/scripts/state.mjs"]);
    assert.ok(manifest?.files[".agents/aidlc/scripts/lib/runtime.mjs"]);
    assert.equal(manifest?.files[".agents/state/BOARD.md"], undefined);
    assert.equal(existsSync(join(root, ".agents/state/BOARD.md")), false);
    assert.match(readFileSync(join(root, ".agents/aidlc/templates/model-contract.md"), "utf8"), /COSTARS/);
    assert.match(doctor(root), /^OK:/);
    assert.match(status(root), /installed version: 2.1.0/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("official adapters carry the human-only upgrade boundary", () => {
  for (const adapter of adapters) for (const file of adapter.files()) {
    assert.match(file.content, /Never query npm/);
    assert.match(file.content, /never run `npm`, `npx`, or a package upgrade command/);
    assert.match(file.content, /node \.agents\/aidlc\/scripts\/context\.mjs/);
  }
});

test("re-init refreshes owned assets while preserving project config and state", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(options(root)));
    const config = join(root, ".agents/config.json");
    const state = join(root, ".agents/state/aidlc-state.json");
    writeFileSync(config, '{"schemaVersion":1,"custom":true}\n');
    writeFileSync(state, '{"schemaVersion":1,"tasks":{"kept":{}}}\n');
    const plan = planInit(options(root));
    assert.equal(plan.some((item) => item.action === "conflict"), false);
    assert.ok(["skip", "update"].includes(plan.find((item) => item.path === ".agents/aidlc/manifest.json")?.action ?? ""));
    assert.equal(plan.find((item) => item.path === ".agents/config.json")?.action, "preserve");
    assert.equal(plan.find((item) => item.path === ".agents/state/aidlc-state.json")?.action, "preserve");
    applyPlan(root, plan);
    assert.match(readFileSync(config, "utf8"), /custom/);
    assert.match(readFileSync(state, "utf8"), /kept/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("init cannot bypass the explicit human-only upgrade path", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(options(root)));
    const path = join(root, ".agents/aidlc/manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8")); manifest.packageVersion = "0.9.0";
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => planInit(options(root)), /Only a human may upgrade/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("modified managed core conflicts while explicit initial force can replace unmanaged files", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(options(root)));
    const core = join(root, ".agents/aidlc/orchestrator.md");
    writeFileSync(core, `${readFileSync(core, "utf8")}\nlocal edit\n`);
    assert.equal(planInit(options(root)).find((item) => item.path === ".agents/aidlc/orchestrator.md")?.action, "conflict");

    const other = makeRoot();
    try {
      mkdirSync(join(other, ".cursor/rules"), { recursive: true });
      writeFileSync(join(other, ".cursor/rules/aidlc-core.mdc"), "unmanaged\n");
      assert.equal(planInit(options(other)).find((item) => item.path === ".cursor/rules/aidlc-core.mdc")?.action, "conflict");
      assert.equal(planInit({ ...options(other), force: true }).find((item) => item.path === ".cursor/rules/aidlc-core.mdc")?.action, "update");
    } finally { rmSync(other, { recursive: true, force: true }); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("uninstall removes unchanged managed assets and preserves state/config", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(options(root)));
    const plan = planUninstall(root);
    assert.equal(plan.some((item) => item.path.startsWith(".agents/state/")), false);
    applyPlan(root, plan);
    assert.equal(existsSync(join(root, ".agents/aidlc/manifest.json")), false);
    assert.ok(existsSync(join(root, ".agents/config.json")));
    assert.ok(existsSync(join(root, ".agents/state/aidlc-state.json")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("uninstall preserves a modified managed adapter and ownership manifest", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(options(root)));
    const adapter = join(root, ".cursor/rules/aidlc-core.mdc");
    writeFileSync(adapter, `${readFileSync(adapter, "utf8")}local edit\n`);
    const plan = planUninstall(root);
    assert.equal(plan.find((item) => item.path === ".cursor/rules/aidlc-core.mdc")?.action, "preserve");
    assert.equal(plan.find((item) => item.path === ".agents/aidlc/manifest.json")?.action, "preserve");
    applyPlan(root, plan);
    assert.ok(existsSync(adapter));
    assert.ok(existsSync(join(root, ".agents/aidlc/manifest.json")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("package implementation contains no runtime remote fetch", () => {
  const files = [resolve("src/installer.ts"), resolve("src/upgrade.ts"), resolve("src/workflow.ts"), resolve(".agents/aidlc/orchestrator.md")];
  const content = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(content, /\bfetch\s*\(/);
  assert.doesNotMatch(content, /npm\s+view/);
});

test("doctor strict validates project config and canonical state", () => {
  const root = makeRoot();
  try {
    applyPlan(root, planInit(options(root)));
    writeFileSync(join(root, ".agents/config.json"), '{"schemaVersion":99}\n');
    assert.match(doctor(root, true), /^ERROR: local config\/state is invalid/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("bundled JSON schemas are valid JSON and avoid remote schema resolution", () => {
  const names = ["config", "state", "profile", "manifest"];
  for (const name of names) {
    const content = readFileSync(resolve(`.agents/aidlc/schemas/${name}.schema.json`), "utf8");
    assert.doesNotThrow(() => JSON.parse(content));
    assert.doesNotMatch(content, /https?:\/\//);
  }
});
