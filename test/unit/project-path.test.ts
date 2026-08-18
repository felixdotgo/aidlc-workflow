import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveProjectPath, resolveProjectPathWithoutSymlinks } from "../../src/project-path.js";

test("project path helpers reject traversal and preserve contained paths", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-project-path-"));
  try {
    assert.equal(resolveProjectPath(root, ".agents/data/state/aidlc-state.json", "unsafe"), join(root, ".agents/data/state/aidlc-state.json"));
    for (const path of ["", "../outside", "/tmp/outside"]) assert.throws(() => resolveProjectPath(root, path, "unsafe"), /unsafe/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("project path helpers reject an existing symlink component", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-project-symlink-"));
  try {
    const outside = mkdtempSync(join(tmpdir(), "aidlc-project-outside-"));
    mkdirSync(join(root, ".agents/data"), { recursive: true });
    symlinkSync(outside, join(root, ".agents/data", "state"));
    assert.throws(() => resolveProjectPathWithoutSymlinks(root, ".agents/data/state/aidlc-state.json", "unsafe", "symlink"), /symlink/);
    rmSync(outside, { recursive: true, force: true });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
