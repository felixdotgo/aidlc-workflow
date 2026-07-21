import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";

const phases = ["clarify", "plan", "build", "wrap", "done"];
const gates = ["none", "G0_confirm", "G1_review", "G2_codereview"];
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

export const validateState = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Workflow state must be an object");
  if (value.schemaVersion !== 1 || !value.tasks || typeof value.tasks !== "object" || Array.isArray(value.tasks)) throw new Error("Unsupported workflow state schema");
  for (const [id, task] of Object.entries(value.tasks)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw new Error(`Invalid task id: ${id}`);
    if (!task || task.id !== id || !phases.includes(task.phase) || !gates.includes(task.gate)) throw new Error(`Invalid task state: ${id}`);
    if (!task.title || !["feature", "bug", "refactor", "infra"].includes(task.type) || !["active", "blocked_on_user", "paused", "done"].includes(task.status)) throw new Error(`Invalid task fields: ${id}`);
    if (!["vi", "en"].includes(task.language) || !["low", "normal", "high", "regulated"].includes(task.risk) || !Array.isArray(task.areas) || !task.areas.length || task.areas.some((area) => typeof area !== "string" || !area)) throw new Error(`Invalid task language, risk, or areas: ${id}`);
    if (!Array.isArray(task.decisions) || !Array.isArray(task.tasks) || !Array.isArray(task.evidence)) throw new Error(`Invalid task collections: ${id}`);
    if (task.decisions.some((item) => !item.id || !item.label || !["unresolved", "approved", "changed", "dropped"].includes(item.status) || (item.status === "changed" && !item.resolution))) throw new Error(`Invalid decisions: ${id}`);
    if (task.tasks.some((item) => !item.id || !item.label || !["todo", "in_progress", "done", "deferred"].includes(item.status))) throw new Error(`Invalid execution tasks: ${id}`);
    if (task.evidence.some((item) => !["approval", "spec", "test", "lint", "review", "diagnostic"].includes(item.kind) || !["pass", "fail", "skip"].includes(item.result) || !item.source || !item.recordedAt)) throw new Error(`Invalid evidence: ${id}`);
    for (const path of Object.values(task.artifacts ?? {})) if (path) {
      const cleaned = normalize(path);
      if (isAbsolute(cleaned) || cleaned === ".." || cleaned.startsWith(`..${separator}`) || !cleaned.startsWith(`.agents${separator}tasks${separator}`)) throw new Error(`Invalid artifact path for ${id}: ${path}`);
    }
  }
  return value;
};

export const statePath = (root) => join(resolve(root), ".agents/state/aidlc-state.json");
export const emptyState = () => ({ schemaVersion: 1, tasks: {} });
export const loadState = (root) => existsSync(statePath(root)) ? validateState(JSON.parse(readFileSync(statePath(root), "utf8"))) : emptyState();

export const saveState = (root, state) => {
  validateState(state);
  const path = statePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
};

const approval = (task, gate) => task.evidence.some((item) => item.kind === "approval" && item.gate === gate && item.result === "pass");
const verification = (task) => task.areas.every((area) => task.evidence.some((item) => ["test", "lint"].includes(item.kind) && item.result === "pass" && (item.area === area || (!item.area && task.areas.length === 1))));
const review = (task) => task.evidence.some((item) => item.kind === "review" && item.result === "pass");

export const transitionDiagnostics = (task, target) => {
  const diagnostics = [];
  const expected = phases.indexOf(task.phase) + 1;
  if (target !== task.phase && phases.indexOf(target) !== expected) diagnostics.push({ level: "ERROR", code: "STATE_TRANSITION", message: `Cannot transition ${task.phase} → ${target}` });
  if (target === "plan" && !approval(task, "G0_confirm")) diagnostics.push({ level: "ERROR", code: "G0_APPROVAL", message: "G0 approval evidence is required" });
  if (target === "build") {
    if (!approval(task, "G1_review")) diagnostics.push({ level: "ERROR", code: "G1_APPROVAL", message: "G1 approval evidence is required" });
    for (const decision of task.decisions) if (decision.status === "unresolved") diagnostics.push({ level: "ERROR", code: "UNRESOLVED_DECISION", message: `Decision ${decision.id} is unresolved` });
  }
  if (target === "wrap") {
    if (!verification(task)) diagnostics.push({ level: "ERROR", code: "VERIFY_EVIDENCE", message: "Passing test or lint evidence is required for every affected area" });
    if (!review(task)) diagnostics.push({ level: "ERROR", code: "REVIEW_EVIDENCE", message: "Passing code-review evidence is required" });
    if (!approval(task, "G2_codereview")) diagnostics.push({ level: "ERROR", code: "G2_APPROVAL", message: "G2 approval evidence is required" });
  }
  return diagnostics;
};

const phaseGate = (phase) => phase === "clarify" ? "G0_confirm" : phase === "plan" ? "G1_review" : phase === "build" ? "G2_codereview" : "none";

export const transitionTask = (state, id, target) => {
  const task = state.tasks[id];
  if (!task) throw new Error(`Unknown task: ${id}`);
  const errors = transitionDiagnostics(task, target).filter((item) => item.level === "ERROR");
  if (errors.length) throw new Error(errors.map((item) => item.message).join("; "));
  task.phase = target;
  task.gate = phaseGate(target);
  task.status = target === "done" ? "done" : "active";
  task.updatedAt = new Date().toISOString();
  return task;
};

export const renderWorkplan = (task) => {
  const decisions = task.decisions.length ? task.decisions.map((item) => `- [${item.status === "approved" ? "x" : " "}] ${item.id} — ${item.label}${item.resolution ? ` — ${item.resolution}` : ""}`).join("\n") : "- None";
  const tasks = task.tasks.length ? task.tasks.map((item) => `- [${item.status === "done" ? "x" : item.status === "in_progress" ? "~" : " "}] ${item.id} — ${item.label}`).join("\n") : "- None";
  return `# Workplan — ${task.title} (\`${task.id}\`)\n\n> Generated from canonical JSON state.\n\n## 🧩 Decisions (Gate G1 — approve before build)\n${decisions}\n\n## 🧩 Tasks (Gate G2 — build execution)\n${tasks}\n`;
};

export const renderViews = (root, state = loadState(root)) => {
  for (const task of Object.values(state.tasks)) {
    if (!task.artifacts.workplan) continue;
    const path = join(resolve(root), task.artifacts.workplan);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderWorkplan(task), "utf8");
  }
};

const artifactDiagnostics = (root, task, names) => names.flatMap((name) => {
  const path = task.artifacts[name];
  if (!path) return [{ level: "ERROR", code: "ARTIFACT_REFERENCE", message: `${name} artifact is not referenced` }];
  return existsSync(join(resolve(root), path)) ? [] : [{ level: "ERROR", code: "ARTIFACT_MISSING", message: `${path} does not exist` }];
});

export const checkGate = (root, state, taskId, gate) => {
  const task = state.tasks[taskId];
  if (!task) return [{ level: "ERROR", code: "TASK_UNKNOWN", message: `Unknown task: ${taskId}` }];
  const diagnostics = [];
  if (task.gate !== gate) diagnostics.push({ level: "ERROR", code: "GATE_STATE", message: `Task is at ${task.gate}, not ${gate}` });
  if (task.id !== taskId) diagnostics.push({ level: "ERROR", code: "TASK_ID", message: "Task key and id differ" });
  if (!task.title.trim() || !task.areas.length) diagnostics.push({ level: "ERROR", code: "TASK_FIELDS", message: "Task title and affected areas are required" });
  if (gate === "G0_confirm") {
    diagnostics.push(...artifactDiagnostics(root, task, ["intent"]));
    const path = task.artifacts.intent && join(resolve(root), task.artifacts.intent);
    if (path && existsSync(path)) for (const heading of ["## 📋 Problem", "## 🗺️ Affected areas", "## 💭 Assumptions", "## ❓ Open questions", "## 🎯 Scope"]) if (!readFileSync(path, "utf8").includes(heading)) diagnostics.push({ level: "ERROR", code: "INTENT_HEADING", message: `Intent is missing ${heading}` });
  }
  if (gate === "G1_review") {
    diagnostics.push(...artifactDiagnostics(root, task, ["intent", "design", "workplan"]));
    diagnostics.push(...transitionDiagnostics(task, "build").filter((item) => item.code === "UNRESOLVED_DECISION"));
    const path = task.artifacts.design && join(resolve(root), task.artifacts.design);
    if (path && existsSync(path)) for (const heading of ["## 🧩 Solution per affected area", "## 📌 Spec traceability", "## 🔗 Cross-service contracts", "## ⚠️ Risks / edge cases"]) if (!readFileSync(path, "utf8").includes(heading)) diagnostics.push({ level: "ERROR", code: "DESIGN_HEADING", message: `Design is missing ${heading}` });
  }
  if (gate === "G2_codereview") {
    diagnostics.push(...artifactDiagnostics(root, task, ["intent", "design", "workplan"]));
    if (task.tasks.some((item) => !["done", "deferred"].includes(item.status))) diagnostics.push({ level: "ERROR", code: "TASKS_OPEN", message: "Build tasks remain open" });
    for (const area of task.areas) if (!task.evidence.some((item) => ["test", "lint"].includes(item.kind) && item.result === "pass" && (item.area === area || (!item.area && task.areas.length === 1)))) diagnostics.push({ level: "ERROR", code: "VERIFY_EVIDENCE", message: `No passing verification evidence for ${area}` });
    if (!review(task)) diagnostics.push({ level: "ERROR", code: "REVIEW_EVIDENCE", message: "No passing review evidence" });
  }
  if (!diagnostics.length) diagnostics.push({ level: "INFO", code: "GATE_OK", message: `${gate} checks passed for ${taskId}` });
  return diagnostics;
};

export const formatDiagnostics = (diagnostics) => diagnostics.map((item) => `${item.level} ${item.code}: ${item.message}`).join("\n");

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
  const topologies = ["generic", "single", "workspace", "git-submodules"];
  if (item.schemaVersion !== 1 || typeof item.id !== "string" || !topologies.includes(String(item.topology))) throw new Error(`${label} has an unsupported schema, id, or topology`);
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
  if (item.schemaVersion !== undefined && item.schemaVersion !== 1) throw new Error("Unsupported project config schema");
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
    risk: { default: riskDefault }, context: { maxChars }
  };
};

const loadProfile = (root, id) => {
  const resolvedId = profileAlias(id);
  if (builtInProfiles[resolvedId]) return builtInProfiles[resolvedId];
  const path = join(resolve(root), ".aidlc/profiles", safeRelative(id, "profile id"), "profile.json");
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

export const compileContext = (root, task, phase = task.phase) => {
  const config = loadConfig(root);
  const profiles = resolveProfiles(root, config.extends);
  const rules = includedRuleFiles(root, [...profiles.flatMap((item) => item.rules?.include ?? []), ...(config.rules.include ?? [])]);
  const compact = JSON.stringify({ id: task.id, title: task.title, type: task.type, phase: task.phase, gate: task.gate, risk: task.risk, areas: task.areas, decisions: task.decisions, tasks: task.tasks, evidence: task.evidence.slice(-12), artifacts: task.artifacts }, null, 2);
  const invariants = "- Never omit approved decisions, spec anchors, safety constraints, or verification evidence.\n- Workflow upgrades are user-only npm/npx operations. Agents never run or detect upgrades.";
  const phasePath = join(resolve(root), ".agents/aidlc", phase === "done" ? "phase-wrap.md" : `phase-${phase}.md`);
  const phaseContract = readFileSync(phasePath, "utf8");
  let content = [`# AI-DLC phase packet — ${phase}`, "## Phase contract", phaseContract, "## Canonical task state", compact, "## Resolved profiles", profiles.map((item) => JSON.stringify({ id: item.id, topology: item.topology, discovery: item.discovery, specs: item.specs, commands: item.commands })).join("\n"), "## Project configuration", JSON.stringify({ specs: config.specs, commands: config.commands, risk: config.risk, context: config.context }, null, 2), "## Invariants", invariants].join("\n\n");
  const omittedRules = [];
  for (const path of rules) {
    const relative = path.slice(resolve(root).length + 1);
    const block = `\n\n## Project rule — ${relative}\n${readFileSync(path, "utf8")}`;
    if (content.length + block.length <= config.context.maxChars) content += block;
    else omittedRules.push(relative);
  }
  if (compact.length + invariants.length + 160 > config.context.maxChars) throw new Error("Context budget is too small for canonical task state and mandatory invariants");
  if (content.length > config.context.maxChars) {
    const tail = `\n\n## Invariants\n${invariants}\n\n## Context budget warning\nThe phase contract was truncated; canonical state and invariants were preserved.`;
    const prefix = `# AI-DLC phase packet — ${phase}\n\n## Canonical task state\n${compact}\n\n## Phase contract (truncated)\n`;
    content = `${prefix}${phaseContract.slice(0, Math.max(0, config.context.maxChars - prefix.length - tail.length))}${tail}`;
  }
  return { content, chars: content.length, estimatedTokens: Math.ceil(content.length / 4), omittedRules };
};
