import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Diagnostic, Gate, TaskState, WorkflowState } from "./model.js";
import { transitionDiagnostics } from "./state.js";

const artifactDiagnostics = (root: string, task: TaskState, names: Array<keyof TaskState["artifacts"]>): Diagnostic[] => names.flatMap((name) => {
  const path = task.artifacts[name];
  if (!path) return [{ level: "ERROR", code: "ARTIFACT_REFERENCE", message: `${String(name)} artifact is not referenced` } satisfies Diagnostic];
  return existsSync(join(resolve(root), path)) ? [] : [{ level: "ERROR", code: "ARTIFACT_MISSING", message: `${path} does not exist` } satisfies Diagnostic];
});

export const checkGate = (root: string, state: WorkflowState, taskId: string, gate: Gate): Diagnostic[] => {
  const task = state.tasks[taskId];
  if (!task) return [{ level: "ERROR", code: "TASK_UNKNOWN", message: `Unknown task: ${taskId}` }];
  const diagnostics: Diagnostic[] = [];
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
    if (task.tasks.some((item) => item.status !== "done" && item.status !== "deferred")) diagnostics.push({ level: "ERROR", code: "TASKS_OPEN", message: "Build tasks remain open" });
    for (const area of task.areas) if (!task.evidence.some((item) => (item.kind === "test" || item.kind === "lint") && item.result === "pass" && (item.area === area || (!item.area && task.areas.length === 1)))) diagnostics.push({ level: "ERROR", code: "VERIFY_EVIDENCE", message: `No passing verification evidence for ${area}` });
    if (!task.evidence.some((item) => item.kind === "review" && item.result === "pass")) diagnostics.push({ level: "ERROR", code: "REVIEW_EVIDENCE", message: "No passing review evidence" });
  }
  if (!diagnostics.length) diagnostics.push({ level: "INFO", code: "GATE_OK", message: `${gate} checks passed for ${taskId}` });
  return diagnostics;
};

export const formatDiagnostics = (diagnostics: Diagnostic[]): string => diagnostics.map((item) => `${item.level} ${item.code}: ${item.message}`).join("\n");
