import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import type { AgentId, CommandSpec, Profile, ProjectConfig, RiskLevel, StateMutationMode } from "./model.js";

const profile = (id: Profile["topology"], markers: string[] = []): Profile => ({
  schemaVersion: 1,
  id: `topology/${id}`,
  topology: id,
  discovery: { roots: ["."], workspaceMarkers: markers },
  specs: { roots: [] },
  commands: {},
  rules: { include: [] }
});

export const builtInProfiles: Readonly<Record<string, Profile>> = Object.freeze({
  "topology/generic": profile("generic"),
  "topology/single": profile("single"),
  "topology/workspace": profile("workspace", ["package.json", "pnpm-workspace.yaml", "lerna.json"]),
  "topology/git-submodules": profile("git-submodules", [".gitmodules"])
});

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};

const strings = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${label} must be a string array`);
  return value as string[];
};

const command = (value: unknown, label: string): CommandSpec => {
  const item = object(value, label);
  if (typeof item.command !== "string" || !item.command || isAbsolute(item.command)) throw new Error(`${label}.command must be a non-absolute executable name`);
  return { command: item.command, args: strings(item.args ?? [], `${label}.args`) };
};

const commands = (value: unknown, label: string): Record<string, CommandSpec> => {
  if (value === undefined) return {};
  return Object.fromEntries(Object.entries(object(value, label)).map(([key, item]) => [key, command(item, `${label}.${key}`)]));
};

const safeRelative = (path: string, label: string): string => {
  const cleaned = normalize(path);
  if (isAbsolute(cleaned) || cleaned === ".." || cleaned.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) throw new Error(`${label} must stay inside the project`);
  return cleaned;
};

export const validateProfile = (value: unknown, label = "profile"): Profile => {
  const item = object(value, label);
  const topologies = ["generic", "single", "workspace", "git-submodules"];
  if (item.schemaVersion !== 1 || typeof item.id !== "string" || !topologies.includes(String(item.topology))) throw new Error(`${label} has an unsupported schema, id, or topology`);
  const discovery = item.discovery === undefined ? undefined : object(item.discovery, `${label}.discovery`);
  const specs = item.specs === undefined ? undefined : object(item.specs, `${label}.specs`);
  const rules = item.rules === undefined ? undefined : object(item.rules, `${label}.rules`);
  return {
    schemaVersion: 1,
    id: item.id,
    extends: item.extends === undefined ? [] : strings(item.extends, `${label}.extends`),
    topology: item.topology as Profile["topology"],
    discovery: discovery ? {
      roots: strings(discovery.roots ?? [], `${label}.discovery.roots`).map((path) => safeRelative(path, `${label}.discovery.roots`)),
      workspaceMarkers: strings(discovery.workspaceMarkers ?? [], `${label}.discovery.workspaceMarkers`).map((path) => safeRelative(path, `${label}.discovery.workspaceMarkers`))
    } : undefined,
    specs: specs ? { roots: strings(specs.roots ?? [], `${label}.specs.roots`).map((path) => safeRelative(path, `${label}.specs.roots`)) } : undefined,
    commands: commands(item.commands, `${label}.commands`),
    rules: rules ? { include: strings(rules.include ?? [], `${label}.rules.include`).map((path) => safeRelative(path, `${label}.rules.include`)) } : undefined
  };
};

export const defaultConfig = (): ProjectConfig => ({
  schemaVersion: 1,
  extends: ["topology/single"],
  specs: { roots: [] },
  commands: {},
  rules: { include: [] },
  risk: { default: "normal" },
  context: { maxChars: 16_000 },
  agentState: {},
  eval: { runners: {} }
});

export const loadProjectConfig = (root: string): ProjectConfig => {
  const path = join(resolve(root), ".agents/config.json");
  if (!existsSync(path)) return defaultConfig();
  const item = object(JSON.parse(readFileSync(path, "utf8")), ".agents/config.json");
  const risk = object(item.risk ?? {}, "config.risk");
  const context = object(item.context ?? {}, "config.context");
  const evalConfig = object(item.eval ?? {}, "config.eval");
  const levels: RiskLevel[] = ["low", "normal", "high", "regulated"];
  const riskDefault = String(risk.default ?? "normal") as RiskLevel;
  if (item.schemaVersion !== 1 || !levels.includes(riskDefault)) throw new Error("Unsupported project config schema or risk level");
  const agentStateRaw = object(item.agentState ?? {}, "config.agentState");
  const agentIds: AgentId[] = ["claude", "codex", "cursor", "antigravity", "kiro", "generic"];
  const agentState = Object.fromEntries(Object.entries(agentStateRaw).map(([id, mode]) => {
    if (!agentIds.includes(id as AgentId) || (mode !== "native" && mode !== "scripted")) throw new Error("config.agentState must map known adapters to native or scripted");
    return [id, mode as StateMutationMode];
  })) as Partial<Record<AgentId, StateMutationMode>>;
  const maxChars = Number(context.maxChars ?? 16_000);
  if (!Number.isInteger(maxChars) || maxChars < 4_000 || maxChars > 128_000) throw new Error("context.maxChars must be an integer from 4000 to 128000");
  return {
    schemaVersion: 1,
    extends: strings(item.extends ?? ["topology/single"], "config.extends"),
    specs: { roots: strings(object(item.specs ?? {}, "config.specs").roots ?? [], "config.specs.roots").map((entry) => safeRelative(entry, "config.specs.roots")) },
    commands: commands(item.commands, "config.commands"),
    rules: { include: strings(object(item.rules ?? {}, "config.rules").include ?? [], "config.rules.include").map((entry) => safeRelative(entry, "config.rules.include")) },
    risk: { default: riskDefault },
    context: { maxChars },
    agentState,
    eval: { runners: Object.fromEntries(Object.entries(object(evalConfig.runners ?? {}, "config.eval.runners")).map(([id, spec]) => {
      const parsed = command(spec, `config.eval.runners.${id}`);
      const raw = object(spec, `config.eval.runners.${id}`);
      const timeoutMs = Number(raw.timeoutMs ?? 120_000);
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 3_600_000) throw new Error(`config.eval.runners.${id}.timeoutMs is invalid`);
      if (typeof raw.model !== "string" || !raw.model || typeof raw.version !== "string" || !raw.version) throw new Error(`config.eval.runners.${id} requires pinned model and version`);
      return [id, { ...parsed, model: raw.model, version: raw.version, timeoutMs }];
    })) }
  };
};

const readLocalProfile = (root: string, id: string): Profile | undefined => {
  const path = join(resolve(root), ".aidlc/profiles", safeRelative(id, "profile id"), "profile.json");
  if (!existsSync(path)) return undefined;
  if (lstatSync(path).isSymbolicLink() || !realpathSync(path).startsWith(`${realpathSync(resolve(root))}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error(`Profile escapes the project: ${id}`);
  return validateProfile(JSON.parse(readFileSync(path, "utf8")), id);
};

export const resolveProfiles = (root: string, ids: string[]): Profile[] => {
  const resolved: Profile[] = [];
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (resolved.some((entry) => entry.id === id)) return;
    if (visiting.has(id)) throw new Error(`Profile cycle detected at ${id}`);
    visiting.add(id);
    const current = builtInProfiles[id] ?? readLocalProfile(root, id);
    if (!current) throw new Error(`Unknown profile: ${id}`);
    for (const parent of current.extends ?? []) visit(parent);
    visiting.delete(id);
    resolved.push(current);
  };
  ids.forEach(visit);
  return resolved;
};

export const includedRuleFiles = (root: string, patterns: string[]): string[] => {
  const project = resolve(root);
  const realProject = realpathSync(project);
  const inside = (path: string): boolean => {
    if (lstatSync(path).isSymbolicLink()) return false;
    return realpathSync(path).startsWith(`${realProject}${process.platform === "win32" ? "\\" : "/"}`);
  };
  const files = new Set<string>();
  for (const pattern of patterns) {
    const safe = safeRelative(pattern, "rule include");
    if (safe.endsWith("/*.md")) {
      const directory = join(project, safe.slice(0, -5));
      if (existsSync(directory) && inside(directory)) for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (entry.endsWith(".md") && existsSync(path) && inside(path)) files.add(path);
      }
    } else {
      const target = join(project, safe);
      if (existsSync(target) && inside(target)) files.add(target);
    }
  }
  return [...files].filter((path) => dirname(path).startsWith(project) || path.startsWith(project)).sort();
};
