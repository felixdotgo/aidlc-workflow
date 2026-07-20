#!/usr/bin/env node
import { loadState, option, renderViews, rootOption, saveState, transitionTask, withoutOptions } from "./lib/runtime.mjs";

const raw = process.argv.slice(2);
const root = rootOption(raw);
const args = withoutOptions(raw);
const [group, action, id] = args;
const state = loadState(root);
const now = () => new Date().toISOString();

if (group === "task" && action === "show") {
  console.log(JSON.stringify(id ? state.tasks[id] ?? null : state, null, 2));
} else if (group === "task" && action === "create") {
  const title = option(raw, "--title");
  if (!id || !title || state.tasks[id]) throw new Error("task create requires a new id and --title");
  const recordedAt = now();
  state.tasks[id] = {
    id, title, type: option(raw, "--type") ?? "infra", phase: "clarify", gate: "G0_confirm", status: "active",
    language: option(raw, "--language") === "en" ? "en" : "vi", risk: option(raw, "--risk") ?? "normal",
    areas: (option(raw, "--area") ?? "root").split(",").map((area) => area.trim()).filter(Boolean), branch: "—",
    artifacts: { intent: `.agents/tasks/${id}/intent.md`, design: `.agents/tasks/${id}/design.md`, workplan: `.agents/tasks/${id}/workplan.md` },
    decisions: [], tasks: [], evidence: [], createdAt: recordedAt, updatedAt: recordedAt
  };
  saveState(root, state); renderViews(root, state); console.log(JSON.stringify(state.tasks[id], null, 2));
} else if (group === "task" && action === "transition") {
  transitionTask(state, id, option(raw, "--to")); saveState(root, state); renderViews(root, state); console.log(JSON.stringify(state.tasks[id], null, 2));
} else if (group === "task" && action === "archive") {
  transitionTask(state, id, "done"); saveState(root, state); renderViews(root, state); console.log(JSON.stringify(state.tasks[id], null, 2));
} else if (group === "task" && action === "status") {
  const task = state.tasks[id]; const status = option(raw, "--status");
  if (!task || !["active", "blocked_on_user", "paused", "done"].includes(status)) throw new Error("task status requires task id and valid --status");
  task.status = status; task.updatedAt = now(); saveState(root, state); renderViews(root, state);
} else if (group === "task" && action === "item") {
  const itemId = args[3]; const task = state.tasks[id]; const status = option(raw, "--status");
  if (!task || !itemId || !["todo", "in_progress", "done", "deferred"].includes(status)) throw new Error("task item requires task id, item id, and valid --status");
  const item = task.tasks.find((entry) => entry.id === itemId);
  if (item) { item.status = status; if (option(raw, "--label")) item.label = option(raw, "--label"); }
  else task.tasks.push({ id: itemId, label: option(raw, "--label") ?? itemId, status });
  task.updatedAt = now(); saveState(root, state); renderViews(root, state);
} else if (group === "decision" && action === "set") {
  const decisionId = args[3]; const task = state.tasks[id]; const status = option(raw, "--status");
  if (!task || !decisionId || !["unresolved", "approved", "changed", "dropped"].includes(status)) throw new Error("decision set requires task id, decision id, and valid --status");
  const current = task.decisions.find((entry) => entry.id === decisionId);
  if (current) { current.status = status; current.resolution = option(raw, "--resolution"); }
  else task.decisions.push({ id: decisionId, label: option(raw, "--label") ?? decisionId, status, resolution: option(raw, "--resolution") });
  task.updatedAt = now(); saveState(root, state); renderViews(root, state);
} else if (group === "evidence" && action === "add") {
  const task = state.tasks[id]; const kind = option(raw, "--kind"); const result = option(raw, "--result");
  if (!task || !["approval", "spec", "test", "lint", "review", "diagnostic"].includes(kind) || !["pass", "fail", "skip"].includes(result)) throw new Error("evidence add requires task id, valid --kind, and valid --result");
  task.evidence.push({ kind, gate: option(raw, "--gate"), area: option(raw, "--area"), result, source: option(raw, "--source") ?? "local Node.js script", detail: option(raw, "--detail"), recordedAt: now() });
  task.updatedAt = now(); saveState(root, state); renderViews(root, state);
} else {
  throw new Error("Usage: state.mjs task create|show|status|item|transition|archive | decision set | evidence add");
}
