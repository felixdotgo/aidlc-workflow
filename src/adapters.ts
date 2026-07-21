import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AgentId, FileSpec } from "./model.js";

const adapterFile = (owner: string, path: string, body: string): FileSpec => ({
  path,
  owner,
  content: `<!-- aidlc-installer:${owner} -->\n${body}`
});

const instruction = (agent: string, adapter: AgentId) => [
  `# AI-DLC for ${agent}`,
  "",
  `Read \`.agents/aidlc/orchestrator.md\` and the sole lifecycle state \`.agents/state/aidlc-state.json\` before non-trivial work. Prefer a phase packet produced by \`node .agents/aidlc/scripts/context.mjs <task-id> --phase <phase>\`; respect more-specific project rules. For lifecycle mutations, consult \`.aidlc/config.json\` \`agentState.${adapter}\`: \`native\` may edit canonical state and task artifacts with native file tools after checking lifecycle invariants; otherwise use the bundled state scripts. \`scripted\` is the safe default. This changes lifecycle transport only: human gates and build verification remain mandatory.`,
  "",
  "Workflow upgrades are human-only operations. Never query npm for a newer version and never run `npm`, `npx`, or a package upgrade command, including dry-runs. You may explain the documented command and review output supplied by the user.",
  ""
].join("\n");

const claudeSkill = (phase: string, gate: string) => [
  "---", `name: aidlc-${phase}`, `description: AI-DLC ${phase} phase (${gate}) for Claude Code.`, "---", "",
  `# AI-DLC ${phase} (${gate})`, "", `Read \`.agents/aidlc/phase-${phase}.md\` and execute it exactly.`,
  "Use `.aidlc/config.json` `agentState.claude`: `native` edits the canonical JSON state/artifacts with Claude file tools after checking phase transition invariants; `scripted` uses the bundled lifecycle scripts. Prefer `node .agents/aidlc/scripts/context.mjs <task-id> --phase <phase>`. Never bypass human gates or build verification.",
  "Workflow upgrades are human-only operations. Never query npm for a newer version and never run `npm`, `npx`, or a package upgrade command, including dry-runs.", ""
].join("\n");

export const adapters: readonly Adapter[] = [
  {
    id: "claude",
    displayName: "Claude Code",
    detect: (root) => existsSync(join(root, "CLAUDE.md")) || existsSync(join(root, ".claude")),
    files: () => [{ ...adapterFile("claude", "CLAUDE.md", instruction("Claude Code", "claude")), strategy: "managed-block" }, ...(["clarify:G0", "plan:G1", "build:G2", "wrap:none", "index:none"] as const).map((entry) => { const [phase, gate] = entry.split(":"); return adapterFile("claude", `.claude/skills/aidlc-${phase}/SKILL.md`, claudeSkill(phase, gate)); })]
  },
  {
    id: "codex",
    displayName: "Codex",
    detect: (root) => existsSync(join(root, "AGENTS.md")) || existsSync(join(root, ".codex")),
    files: () => [{ ...adapterFile("codex", "AGENTS.md", instruction("Codex", "codex")), strategy: "managed-block" }]
  },
  {
    id: "cursor",
    displayName: "Cursor",
    detect: (root) => existsSync(join(root, ".cursor")) || existsSync(join(root, ".cursorrules")),
    files: () => [adapterFile("cursor", ".cursor/rules/aidlc.mdc", `---\ndescription: AI-DLC workflow\nalwaysApply: true\n---\n\n${instruction("Cursor", "cursor")}`)]
  },
  {
    id: "antigravity",
    displayName: "Google Antigravity",
    detect: (root) => existsSync(join(root, ".agents/rules")) || existsSync(join(root, ".agent")),
    files: () => [adapterFile("antigravity", ".agents/rules/aidlc.md", instruction("Google Antigravity", "antigravity"))]
  },
  {
    id: "kiro",
    displayName: "Kiro",
    detect: (root) => existsSync(join(root, ".kiro")),
    files: () => [adapterFile("kiro", ".kiro/steering/aidlc.md", instruction("Kiro", "kiro"))]
  },
  {
    id: "generic",
    displayName: "Generic instruction export",
    detect: () => false,
    files: () => [adapterFile("generic", ".agents/aidlc/adapters/generic-instructions.md", instruction("compatible agent", "generic"))]
  }
];

export const installableAdapters = (): readonly Adapter[] => adapters.filter((adapter) => adapter.id !== "generic");

export const findAdapter = (id: AgentId): Adapter | undefined => adapters.find((adapter) => adapter.id === id);
