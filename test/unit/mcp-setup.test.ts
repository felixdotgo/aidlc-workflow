import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyMcpSetup, planMcpSetup } from "../../src/mcp-setup.js";

const options = (root: string, dryRun: boolean) => ({ root, template: join(process.cwd(), "services/mcp-state"), dryRun, deployment: "docker" as const, storage: "sqlite" as const, bind: "localhost" as const, workspace: "demo", pollMs: 30_000, tokenEnv: "AIDLC_MCP_TOKEN", providers: ["jira"], enable: false });

test("MCP setup previews safely and scaffolds Docker while keeping MCP disabled", () => {
  const root = mkdtempSync(join(tmpdir(), "aidlc-mcp-setup-"));
  try {
    const preview = planMcpSetup(options(root, true));
    assert.equal(preview.config.enabled, false); assert.equal(existsSync(join(root, ".agents/mcp-state")), false);
    const applied = applyMcpSetup(options(root, false));
    assert.equal(applied.target, join(root, ".agents/mcp-state"));
    assert.equal(existsSync(join(applied.target, "compose.yaml")), true);
    assert.match(readFileSync(join(root, ".agents/config.json"), "utf8"), /"enabled": false/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
