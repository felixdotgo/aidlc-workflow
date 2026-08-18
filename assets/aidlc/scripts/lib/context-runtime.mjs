import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, normalize, resolve } from "node:path";
import { loadMemoryRegistry, nextAction, selectAgenticMemory } from "./store.mjs";

const separator = process.platform === "win32" ? "\\" : "/";

export const option = (args, name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};

export const rootOption = (args) => resolve(option(args, "--root") ?? ".");

export const withoutOptions = (args) => {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--root") index += 1;
    else result.push(args[index]);
  }
  return result;
};

const safeRelative = (path, label) => {
  const cleaned = normalize(path);
  if (isAbsolute(cleaned) || cleaned === ".." || cleaned.startsWith(`..${separator}`)) throw new Error(`${label} must stay inside the project`);
  return cleaned;
};

const object = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
};

const strings = (value, label) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${label} must be a string array`);
  return value;
};

const command = (value, label) => {
  const item = object(value, label);
  if (typeof item.command !== "string" || !item.command || isAbsolute(item.command)) throw new Error(`${label}.command must be a non-absolute executable name`);
  return { command: item.command, args: strings(item.args ?? [], `${label}.args`) };
};

const commands = (value, label) => value === undefined ? {} : Object.fromEntries(Object.entries(object(value, label)).map(([key, item]) => [key, command(item, `${label}.${key}`)]));

const validateProfile = (value, label) => {
  const item = object(value, label);
  const idPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
  if (item.schemaVersion !== 1 || typeof item.id !== "string" || !idPattern.test(item.id) || typeof item.topology !== "string" || !idPattern.test(item.topology)) throw new Error(`${label} has an unsupported schema, id, or topology`);
  const discovery = item.discovery === undefined ? undefined : object(item.discovery, `${label}.discovery`);
  const specs = item.specs === undefined ? undefined : object(item.specs, `${label}.specs`);
  const rules = item.rules === undefined ? undefined : object(item.rules, `${label}.rules`);
  return {
    schemaVersion: 1, id: item.id, extends: item.extends === undefined ? [] : strings(item.extends, `${label}.extends`), topology: item.topology,
    discovery: discovery ? { roots: strings(discovery.roots ?? [], `${label}.discovery.roots`).map((path) => safeRelative(path, `${label}.discovery.roots`)), workspaceMarkers: strings(discovery.workspaceMarkers ?? [], `${label}.discovery.workspaceMarkers`).map((path) => safeRelative(path, `${label}.discovery.workspaceMarkers`)) } : undefined,
    specs: specs ? { roots: strings(specs.roots ?? [], `${label}.specs.roots`).map((path) => safeRelative(path, `${label}.specs.roots`)) } : undefined,
    commands: commands(item.commands, `${label}.commands`), rules: rules ? { include: strings(rules.include ?? [], `${label}.rules.include`).map((path) => safeRelative(path, `${label}.rules.include`)) } : undefined
  };
};

const profile = (id, markers = []) => ({ schemaVersion: 1, id: `topology/${id}`, topology: id, discovery: { roots: ["."], workspaceMarkers: markers }, specs: { roots: [] }, commands: {}, rules: { include: [] } });
const builtInProfiles = {
  "topology/generic": profile("generic"),
  "topology/single": profile("single"),
  "topology/workspace": profile("workspace", ["package.json", "pnpm-workspace.yaml", "lerna.json"]),
  "topology/git-submodules": profile("git-submodules", [".gitmodules"])
};

const profileAlias = (id) => builtInProfiles[id] ? id : builtInProfiles[`topology/${id}`] ? `topology/${id}` : id;

const loadConfig = (root) => {
  const path = join(resolve(root), ".agents/config.json");
  const item = existsSync(path) ? object(JSON.parse(readFileSync(path, "utf8")), ".agents/config.json") : {};
  if (item.schemaVersion !== undefined && ![1, 2].includes(item.schemaVersion)) throw new Error("Unsupported project config schema");
  const risk = object(item.risk ?? {}, "config.risk");
  const context = object(item.context ?? {}, "config.context");
  const riskDefault = String(risk.default ?? "normal");
  if (!["low", "normal", "high", "regulated"].includes(riskDefault)) throw new Error("Unsupported project risk level");
  const maxChars = Number(context.maxChars ?? 16000);
  if (!Number.isInteger(maxChars) || maxChars < 4000 || maxChars > 128000) throw new Error("context.maxChars must be an integer from 4000 to 128000");
  return {
    extends: strings(item.extends ?? ["topology/single"], "config.extends"),
    specs: { roots: strings(object(item.specs ?? {}, "config.specs").roots ?? [], "config.specs.roots").map((entry) => safeRelative(entry, "config.specs.roots")) },
    commands: commands(item.commands, "config.commands"),
    rules: { include: strings(object(item.rules ?? {}, "config.rules").include ?? [], "config.rules.include").map((entry) => safeRelative(entry, "config.rules.include")) },
    risk: { default: riskDefault }, context: { maxChars }, gates: { G1: { autoPass: { enabled: Boolean(item.gates?.G1?.autoPass?.enabled ?? false) } } }
  };
};

const loadProfile = (root, id) => {
  const resolvedId = profileAlias(id);
  if (builtInProfiles[resolvedId]) return builtInProfiles[resolvedId];
  const path = join(resolve(root), ".agents/project/profiles", safeRelative(id, "profile id"), "profile.json");
  if (!existsSync(path)) throw new Error(`Unknown profile: ${id}`);
  if (lstatSync(path).isSymbolicLink() || !realpathSync(path).startsWith(`${realpathSync(resolve(root))}${separator}`)) throw new Error(`Profile escapes the project: ${id}`);
  const value = validateProfile(JSON.parse(readFileSync(path, "utf8")), id);
  if (value.id !== id) throw new Error(`Invalid profile id: ${id}`);
  return value;
};

const resolveProfiles = (root, ids) => {
  const resolved = [];
  const visiting = new Set();
  const visit = (id) => {
    const resolvedId = profileAlias(id);
    if (resolved.some((entry) => entry.id === resolvedId)) return;
    if (visiting.has(resolvedId)) throw new Error(`Profile cycle detected at ${resolvedId}`);
    visiting.add(resolvedId);
    const current = loadProfile(root, resolvedId);
    for (const parent of current.extends ?? []) visit(parent);
    visiting.delete(resolvedId);
    resolved.push(current);
  };
  ids.forEach(visit);
  return resolved;
};

const stable = (values) => [...new Set(values)];
const resolveEffectiveConfig = (root, config) => {
  const profiles = resolveProfiles(root, config.extends);
  return { profiles, discovery: { roots: stable(profiles.flatMap((item) => item.discovery?.roots ?? ["."])), workspaceMarkers: stable(profiles.flatMap((item) => item.discovery?.workspaceMarkers ?? [])) }, specs: { roots: stable([...profiles.flatMap((item) => item.specs?.roots ?? []), ...config.specs.roots]) }, commands: Object.assign({}, ...profiles.map((item) => item.commands ?? {}), config.commands), rules: { include: stable([...profiles.flatMap((item) => item.rules?.include ?? []), ...config.rules.include]) }, risk: config.risk, context: config.context, gates: config.gates };
};

const includedRuleFiles = (root, patterns) => {
  const project = resolve(root);
  const realProject = realpathSync(project);
  const inside = (path) => !lstatSync(path).isSymbolicLink() && realpathSync(path).startsWith(`${realProject}${separator}`);
  const files = new Set();
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
  return [...files].sort();
};

const requiredEvidence = (task) => task.evidence.filter((item, index, entries) => {
  const key = `${item.kind}:${item.area ?? ""}:${item.gate ?? ""}`;
  return !entries.slice(index + 1).some((candidate) => `${candidate.kind}:${candidate.area ?? ""}:${candidate.gate ?? ""}` === key);
}).map(({ detail, ...item }) => item);

export const compileContext = (root, task, phase = task.phase, options = {}) => {
  const config = loadConfig(root);
  const effective = resolveEffectiveConfig(root, config);
  const profiles = effective.profiles;
  const rules = includedRuleFiles(root, effective.rules.include);
  if (options.itemId && !task.tasks.some((item) => item.id === options.itemId)) throw new Error(`Unknown task item: ${options.itemId}`);
  const compact = JSON.stringify({ id: task.id, title: task.title, type: task.type, phase: task.phase, gate: task.gate, status: task.status, risk: task.risk, areas: task.areas, handoff: task.handoff, closure: task.closure, predecessorTaskId: task.predecessorTaskId, successorTaskId: task.successorTaskId, decisions: task.decisions.map(({ id, label, status }) => ({ id, label, status })), tasks: options.itemId ? task.tasks.filter((item) => item.id === options.itemId) : task.tasks, evidence: requiredEvidence(task), lessonDisposition: task.lessonDisposition, artifacts: task.artifacts }, null, 2);
  const invariants = "- Continue after a non-terminal transition; yield only at a human gate, real blocker, or completion.\n- Never omit approved decisions, spec anchors, safety constraints, or applicable verification evidence.\n- Agents may run configured build/test/lint commands, but workflow installation and upgrades remain human-only npm/npx operations.";
  const phasePath = join(resolve(root), ".agents/aidlc", phase === "done" ? "phase-wrap.md" : `phase-${phase}.md`);
  const phaseContract = readFileSync(phasePath, "utf8");
  let content = [`# AI-DLC phase packet — ${phase}`, `mode: ${options.mode ?? "standard"}${options.itemId ? ` · item: ${options.itemId}` : ""}`, "## Next action / stop contract", JSON.stringify(nextAction(task), null, 2), "## Phase contract", phaseContract, "## Canonical task state", compact, "## Resolved profiles", profiles.map((item) => JSON.stringify({ id: item.id, topology: item.topology, discovery: item.discovery, specs: item.specs, commands: item.commands })).join("\n"), "## Effective project configuration", JSON.stringify({ discovery: effective.discovery, specs: effective.specs, commands: effective.commands, risk: effective.risk, context: effective.context, gates: effective.gates }, null, 2), "## Invariants", invariants].join("\n\n");
  if (content.length > config.context.maxChars) throw new Error("Context budget is too small for the full phase contract, next action, canonical task state, and mandatory invariants");
  const omittedRules = [];
  for (const path of rules) {
    const relative = path.slice(resolve(root).length + 1);
    const block = `\n\n## Project rule — ${relative}\n${readFileSync(path, "utf8")}`;
    if (content.length + block.length <= config.context.maxChars) content += block;
    else omittedRules.push(relative);
  }
  try {
    const memory = selectAgenticMemory(loadMemoryRegistry(root), task.areas, phase === "done" ? "wrap" : phase, config.context.maxChars - content.length - "\n\n## Advisory project memory\n".length);
    if (memory.length) content += `\n\n## Advisory project memory\n${memory.map((entry) => `- ${entry.id} — ${entry.summary} — guidance: ${entry.guidance} — source: ${entry.sourceTaskId}/${entry.sourceLessonId}`).join("\n")}`;
  } catch (error) { omittedRules.push(`memory:unavailable:${error instanceof Error ? error.message : String(error)}`); }
  return { content, chars: content.length, estimatedTokens: Math.ceil(content.length / 4), omittedRules };
};
