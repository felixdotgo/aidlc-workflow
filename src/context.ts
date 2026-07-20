import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Phase, Profile, ProjectConfig, TaskState } from "./model.js";
import { includedRuleFiles, resolveProfiles } from "./profiles.js";

const assetRoot = fileURLToPath(new URL("../assets/.agents/aidlc", import.meta.url));

const phaseFile = (phase: Phase): string => phase === "done" ? "phase-wrap.md" : `phase-${phase}.md`;
const readAsset = (path: string): string => readFileSync(join(assetRoot, path), "utf8");
const compactTask = (task: TaskState): string => JSON.stringify({
  id: task.id,
  title: task.title,
  type: task.type,
  phase: task.phase,
  gate: task.gate,
  risk: task.risk,
  areas: task.areas,
  decisions: task.decisions,
  tasks: task.tasks,
  evidence: task.evidence.slice(-12),
  artifacts: task.artifacts
}, null, 2);

const profileSummary = (profiles: Profile[]): string => profiles.map((item) => JSON.stringify({ id: item.id, topology: item.topology, discovery: item.discovery, specs: item.specs, commands: item.commands })).join("\n");

export interface ContextPacket {
  content: string;
  chars: number;
  estimatedTokens: number;
  omittedRules: string[];
}

export const compileContext = (root: string, config: ProjectConfig, task: TaskState, phase: Phase): ContextPacket => {
  const profiles = resolveProfiles(root, config.extends);
  const profileRules = profiles.flatMap((item) => item.rules?.include ?? []);
  const ruleFiles = includedRuleFiles(root, [...profileRules, ...config.rules.include]);
  const taskState = compactTask(task);
  const invariants = "- Never omit approved decisions, spec anchors, safety constraints, or verification evidence.\n- Workflow upgrades are user-only npm/npx operations. Agents never run or detect upgrades.";
  if (taskState.length + invariants.length + 160 > config.context.maxChars) throw new Error("Context budget is too small for canonical task state and mandatory invariants");
  const required = [
    `# AI-DLC phase packet — ${phase}`,
    "## Phase contract",
    readAsset(phaseFile(phase)),
    "## Canonical task state",
    taskState,
    "## Resolved profiles",
    profileSummary(profiles),
    "## Project configuration",
    JSON.stringify({ specs: config.specs, commands: config.commands, risk: config.risk, context: config.context }, null, 2),
    "## Invariants",
    invariants
  ].join("\n\n");
  let content = required;
  const omittedRules: string[] = [];
  for (const path of ruleFiles) {
    const relative = path.slice(resolve(root).length + 1);
    const block = `\n\n## Project rule — ${relative}\n${readFileSync(path, "utf8")}`;
    if (content.length + block.length <= config.context.maxChars) content += block;
    else omittedRules.push(relative);
  }
  if (content.length > config.context.maxChars) {
    const essentialTail = `\n\n## Invariants\n${invariants}\n\n## Context budget warning\nThe phase contract was truncated; canonical state and invariants were preserved.`;
    const phaseContract = readAsset(phaseFile(phase));
    const prefix = `# AI-DLC phase packet — ${phase}\n\n## Canonical task state\n${taskState}\n\n## Phase contract (truncated)\n`;
    content = `${prefix}${phaseContract.slice(0, Math.max(0, config.context.maxChars - prefix.length - essentialTail.length))}${essentialTail}`;
  }
  return { content, chars: content.length, estimatedTokens: Math.ceil(content.length / 4), omittedRules };
};

export const writeableContextFormat = (packet: ContextPacket, format: "markdown" | "json"): string => format === "json" ? `${JSON.stringify(packet, null, 2)}\n` : `${packet.content}\n\n---\nchars: ${packet.chars} · estimated tokens: ${packet.estimatedTokens} · omitted rules: ${packet.omittedRules.length}\n`;

export const contextAssetsAvailable = (): boolean => existsSync(assetRoot);
