import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AgentId, FileSpec } from "./model.js";

const adapterFile = (owner: string, path: string, body: string): FileSpec => ({
  path,
  owner,
  content: `<!-- aidlc-installer:${owner}:start -->\n${body}<!-- aidlc-installer:${owner}:end -->\n`
});

const instruction = (agent: string, adapter: AgentId) => [
  `# AI-DLC for ${agent}`,
  "",
  `Treat every requested feature, bug fix, or project change as an AI-DLC task; keep read-only explanations and inspections off-workflow. Read \`.agents/aidlc/orchestrator.md\`, then use bounded \`state.mjs task list\` or \`task find --query <text>\`; never read or dump lifecycle files directly. For a NEW task, use the exact user-supplied canonical ID when present, run \`node .agents/aidlc/scripts/state.mjs task create <id> --title <title>\`, then execute \`.agents/aidlc/phase-clarify.md\`; do not call \`task next\` before the task exists. For an existing task, run \`state.mjs task next <task-id>\` and use the matching phase packet. Before a human gate, run \`gate-check.mjs\`, then \`gate-view.mjs <task-id>\` and relay its output verbatim. When the user explicitly approves the current gate, run the returned atomic \`state.mjs gate approve\` command with that user message as the source. After every lifecycle mutation, parse the returned \`nextAction\`: execute \`run_phase\` before responding, stop at \`await_user\`, \`blocked\`, or \`terminal\`, and treat only \`complete\` as successful completion. Immediately before a task final response, run \`node .agents/aidlc/scripts/task-next.mjs <task-id> --require-stop\`; if it reports \`CONTINUATION_REQUIRED\`, execute the returned command instead of replying. Follow structured blocked actions; never interpret \`terminal\` as a passing gate or release. Never invent or auto-approve a human gate. For other lifecycle mutations, consult \`.agents/config.json\` \`agentState.${adapter}\`; scripted is the safe default and build verification remains mandatory.`,
  "",
  "Workflow install/upgrade operations are human-only. Never query npm for a newer workflow or run npm/npx to install, detect, preview, or upgrade it. Project-configured build, test, and lint commands remain allowed.",
  ""
].join("\n");

const claudeSkill = (phase: string, gate: string) => [
  "---", `name: aidlc-${phase}`, `description: AI-DLC ${phase} phase (${gate}) for Claude Code.`, "allowed-tools: Bash(node .agents/aidlc/scripts/*)", "---", "",
  `# AI-DLC ${phase} (${gate})`, "", `Read \`.agents/aidlc/phase-${phase}.md\` and execute it exactly.`,
  "Resolve `state.mjs task next <task-id>` and use atomic `state.mjs gate approve` when scripts are available. After every lifecycle mutation, parse `nextAction`: execute `run_phase`, stop at `await_user`, `blocked`, or `terminal`, and treat only `complete` as successful completion. Follow structured blocked actions and never treat terminal closure as a passing gate or release. Never invent or bypass human gates or build verification.",
  "Workflow install/upgrade operations are human-only. Never query npm for a newer workflow or run npm/npx to install, detect, preview, or upgrade it. Project-configured build, test, and lint commands remain allowed.", ""
].join("\n");

export const adapters: readonly Adapter[] = [
  {
    id: "claude",
    displayName: "Claude Code",
    detect: (root) => existsSync(join(root, "CLAUDE.md")) || existsSync(join(root, ".claude")),
    files: () => [
      { ...adapterFile("claude", "CLAUDE.md", instruction("Claude Code", "claude")), strategy: "managed-block" },
      ...(["clarify:G0", "plan:G1", "build:G2", "wrap:none", "index:none"] as const).map((entry) => {
        const [phase, gate] = entry.split(":");
        return adapterFile("claude", `.claude/skills/aidlc-${phase}/SKILL.md`, claudeSkill(phase, gate));
      })
    ]
  },
  {
    id: "codex",
    displayName: "Codex",
    detect: (root) => existsSync(join(root, "AGENTS.md")) || existsSync(join(root, ".codex")),
    files: () => [
      { ...adapterFile("codex", "AGENTS.md", instruction("Codex", "codex")), strategy: "managed-block" },
      { path: ".codex/config.toml", owner: "codex", content: "approval_policy = \"never\"\nsandbox_mode = \"workspace-write\"\n" }
    ]
  }
];

export const resolvedAdapters = (): readonly Adapter[] => adapters;
export const resolvedAdaptersForUpgrade = (): readonly Adapter[] => adapters;
export const installableAdapters = (): readonly Adapter[] => adapters;
export const findAdapter = (id: AgentId): Adapter | undefined => adapters.find((adapter) => adapter.id === id);
export const findAdapterForUpgrade = (id: AgentId): Adapter | undefined => adapters.find((adapter) => adapter.id === id);
