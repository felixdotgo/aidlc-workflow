import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AgentId, FileSpec } from "./model.js";

const adapterFile = (owner: string, path: string, body: string): FileSpec => ({
  path,
  owner,
  content: `<!-- aidlc-installer:${owner} -->\n${body}`
});

const instruction = (agent: string) => [
  `# AI-DLC for ${agent}`,
  "",
  "Read `.agents/aidlc/orchestrator.md` and the sole lifecycle state `.agents/state/aidlc-state.json` before non-trivial work. Prefer a phase packet produced by `node .agents/aidlc/scripts/context.mjs <task-id> --phase <phase>` over loading every workflow document. Use phase skills under `.agents/skills/`; respect more-specific project rules.",
  "",
  "Workflow upgrades are human-only operations. Never query npm for a newer version and never run `npm`, `npx`, or a package upgrade command, including dry-runs. You may explain the documented command and review output supplied by the user.",
  ""
].join("\n");

export const adapters: readonly Adapter[] = [
  {
    id: "claude",
    displayName: "Claude Code",
    detect: (root) => existsSync(join(root, "CLAUDE.md")) || existsSync(join(root, ".claude")),
    files: () => [{ ...adapterFile("claude", "CLAUDE.md", instruction("Claude Code")), strategy: "managed-block" }, adapterFile("claude", ".claude/skills/aidlc/SKILL.md", instruction("Claude Code"))]
  },
  {
    id: "codex",
    displayName: "Codex",
    detect: (root) => existsSync(join(root, "AGENTS.md")) || existsSync(join(root, ".codex")),
    files: () => [{ ...adapterFile("codex", "AGENTS.md", instruction("Codex")), strategy: "managed-block" }]
  },
  {
    id: "cursor",
    displayName: "Cursor",
    detect: (root) => existsSync(join(root, ".cursor")) || existsSync(join(root, ".cursorrules")),
    files: () => [adapterFile("cursor", ".cursor/rules/aidlc.mdc", `---\ndescription: AI-DLC workflow\nalwaysApply: true\n---\n\n${instruction("Cursor")}`)]
  },
  {
    id: "antigravity",
    displayName: "Google Antigravity",
    detect: (root) => existsSync(join(root, ".agents/rules")) || existsSync(join(root, ".agent")),
    files: () => [adapterFile("antigravity", ".agents/rules/aidlc.md", instruction("Google Antigravity"))]
  },
  {
    id: "kiro",
    displayName: "Kiro",
    detect: (root) => existsSync(join(root, ".kiro")),
    files: () => [adapterFile("kiro", ".kiro/steering/aidlc.md", instruction("Kiro"))]
  },
  {
    id: "generic",
    displayName: "Generic instruction export",
    detect: () => false,
    files: () => [adapterFile("generic", ".agents/aidlc/adapters/generic-instructions.md", instruction("compatible agent"))]
  }
];

export const installableAdapters = (): readonly Adapter[] => adapters.filter((adapter) => adapter.id !== "generic");

export const findAdapter = (id: AgentId): Adapter | undefined => adapters.find((adapter) => adapter.id === id);
