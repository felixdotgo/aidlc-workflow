import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import type { Diagnostic, Gate, Phase, TaskState, WorkflowState } from "./model.js";

export const statePath = (root: string): string => join(resolve(root), ".agents/state/aidlc-state.json");
export const emptyState = (): WorkflowState => ({ schemaVersion: 1, tasks: {} });

const phases: Phase[] = ["clarify", "plan", "build", "wrap", "done"];
const gates: Gate[] = ["none", "G0_confirm", "G1_review", "G2_codereview"];

export const validateState = (value: unknown): WorkflowState => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Workflow state must be an object");
  const state = value as Partial<WorkflowState>;
  if (state.schemaVersion !== 1 || !state.tasks || typeof state.tasks !== "object" || Array.isArray(state.tasks)) throw new Error("Unsupported workflow state schema");
  for (const [id, task] of Object.entries(state.tasks)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw new Error(`Invalid task id: ${id}`);
    if (!task || task.id !== id || !phases.includes(task.phase) || !gates.includes(task.gate)) throw new Error(`Invalid task state: ${id}`);
    if (!Array.isArray(task.decisions) || !Array.isArray(task.tasks) || !Array.isArray(task.evidence)) throw new Error(`Invalid task collections: ${id}`);
    if (!task.title || !["feature", "bug", "refactor", "infra"].includes(task.type) || !["active", "blocked_on_user", "paused", "done"].includes(task.status)) throw new Error(`Invalid task fields: ${id}`);
    if (!["vi", "en"].includes(task.language) || !["low", "normal", "high", "regulated"].includes(task.risk) || !Array.isArray(task.areas) || task.areas.some((area) => typeof area !== "string" || !area)) throw new Error(`Invalid task language, risk, or areas: ${id}`);
    if (task.decisions.some((item) => !item.id || !item.label || !["unresolved", "approved", "changed", "dropped"].includes(item.status) || (item.status === "changed" && !item.resolution))) throw new Error(`Invalid decisions: ${id}`);
    if (task.tasks.some((item) => !item.id || !item.label || !["todo", "in_progress", "done", "deferred"].includes(item.status))) throw new Error(`Invalid execution tasks: ${id}`);
    if (task.evidence.some((item) => !["approval", "spec", "test", "lint", "review", "diagnostic"].includes(item.kind) || !["pass", "fail", "skip"].includes(item.result) || !item.source || !item.recordedAt)) throw new Error(`Invalid evidence: ${id}`);
    for (const path of Object.values(task.artifacts)) if (path) {
      const cleaned = normalize(path);
      if (isAbsolute(cleaned) || cleaned === ".." || cleaned.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || !cleaned.startsWith(`.agents${process.platform === "win32" ? "\\" : "/"}tasks${process.platform === "win32" ? "\\" : "/"}`)) throw new Error(`Invalid artifact path for ${id}: ${path}`);
    }
  }
  return state as WorkflowState;
};

export const loadState = (root: string): WorkflowState => {
  const path = statePath(root);
  return existsSync(path) ? validateState(JSON.parse(readFileSync(path, "utf8"))) : emptyState();
};

export const saveState = (root: string, state: WorkflowState): void => {
  validateState(state);
  const path = statePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
};

const approval = (task: TaskState, gate: Gate): boolean => task.evidence.some((item) => item.kind === "approval" && item.gate === gate && item.result === "pass");
const verification = (task: TaskState): boolean => task.areas.every((area) => task.evidence.some((item) => (item.kind === "test" || item.kind === "lint") && item.result === "pass" && (item.area === area || (!item.area && task.areas.length === 1))));
const review = (task: TaskState): boolean => task.evidence.some((item) => item.kind === "review" && item.result === "pass");

export const transitionDiagnostics = (task: TaskState, target: Phase): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const expected = phases.indexOf(task.phase) + 1;
  if (target !== task.phase && phases.indexOf(target) !== expected) diagnostics.push({ level: "ERROR", code: "STATE_TRANSITION", message: `Cannot transition ${task.phase} → ${target}` });
  if (target === "plan" && !approval(task, "G0_confirm")) diagnostics.push({ level: "ERROR", code: "G0_APPROVAL", message: "G0 approval evidence is required" });
  if (target === "build") {
    if (!approval(task, "G1_review")) diagnostics.push({ level: "ERROR", code: "G1_APPROVAL", message: "G1 approval evidence is required" });
    for (const decision of task.decisions) if (decision.status === "unresolved") diagnostics.push({ level: "ERROR", code: "UNRESOLVED_DECISION", message: `Decision ${decision.id} is unresolved` });
  }
  if (target === "wrap") {
    if (!verification(task)) diagnostics.push({ level: "ERROR", code: "VERIFY_EVIDENCE", message: "Passing test or lint evidence is required" });
    if (!review(task)) diagnostics.push({ level: "ERROR", code: "REVIEW_EVIDENCE", message: "Passing code-review evidence is required" });
    if (!approval(task, "G2_codereview")) diagnostics.push({ level: "ERROR", code: "G2_APPROVAL", message: "G2 approval evidence is required" });
  }
  return diagnostics;
};

const phaseGate = (phase: Phase): Gate => phase === "clarify" ? "G0_confirm" : phase === "plan" ? "G1_review" : phase === "build" ? "G2_codereview" : "none";

export const transitionTask = (state: WorkflowState, id: string, target: Phase): TaskState => {
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

export const renderWorkplan = (task: TaskState): string => {
  const decisions = task.decisions.length ? task.decisions.map((item) => `- [${item.status === "approved" ? "x" : " "}] ${item.id} — ${item.label}${item.resolution ? ` — ${item.resolution}` : ""}`).join("\n") : "- None";
  const tasks = task.tasks.length ? task.tasks.map((item) => `- [${item.status === "done" ? "x" : item.status === "in_progress" ? "~" : " "}] ${item.id} — ${item.label}`).join("\n") : "- None";
  return `# Workplan — ${task.title} (\`${task.id}\`)\n\n> Generated from canonical JSON state.\n\n## 🧩 Decisions (Gate G1 — approve before build)\n${decisions}\n\n## 🧩 Tasks (Gate G2 — build execution)\n${tasks}\n`;
};

export const renderViews = (root: string, state = loadState(root)): void => {
  for (const task of Object.values(state.tasks)) {
    if (!task.artifacts.workplan) continue;
    const path = join(resolve(root), task.artifacts.workplan);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderWorkplan(task), "utf8");
  }
};
