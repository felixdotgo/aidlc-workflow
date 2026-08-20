#!/usr/bin/env node
import { acquireStateLock, approveAndAdvance, checkGate, closeTask, handoffTask, listTaskSummaries, loadMemoryRegistry, loadState, loadTask, migrateState, nextAction, option, promoteAgenticMemory, rebuildLessonIndex, recordLesson, recordNoLessons, renderViews, reopenTask, retireAgenticMemory, rootOption, saveState, searchLessons, supersedeTask, transitionTask, withoutOptions } from "./lib/runtime.mjs";

const raw = process.argv.slice(2);
const root = rootOption(raw);
const args = withoutOptions(raw);
const [group, action, rawId] = args;
const id = rawId?.startsWith("--") ? undefined : rawId;
const releaseStateLock = acquireStateLock(root);
process.once("exit", releaseStateLock);
const state = loadState(root);
const now = () => new Date().toISOString();
const numberOption = (name, fallback) => {
  const rawValue = option(raw, name);
  if (rawValue === undefined) return fallback;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
};
const summaryOptions = (query) => ({
  includeArchive: raw.includes("--include-archive"),
  statuses: option(raw, "--status")?.split(",").map((item) => item.trim()).filter(Boolean),
  query,
  limit: numberOption("--limit", 20),
  cursor: numberOption("--cursor", 0)
});
const persist = (tasks, rebuildLessons = false) => {
  const archived = saveState(root, state);
  if (rebuildLessons || archived.length) rebuildLessonIndex(root, state);
  renderViews(root, state, tasks.filter(Boolean));
};
const respond = (task, result = {}) => console.log(JSON.stringify({ task, ...result, nextAction: nextAction(task) }, null, 2));

if (group === "state" && action === "migrate") {
  console.log(JSON.stringify(migrateState(root, state), null, 2));
} else if (group === "task" && action === "show") {
  if (id) console.log(JSON.stringify(loadTask(root, id, state) ?? null, null, 2));
  else console.log(JSON.stringify(listTaskSummaries(state, summaryOptions()), null, 2));
} else if (group === "task" && action === "list") {
  console.log(JSON.stringify(listTaskSummaries(state, summaryOptions()), null, 2));
} else if (group === "task" && action === "find") {
  const query = option(raw, "--query");
  if (!query) throw new Error("task find requires --query");
  console.log(JSON.stringify(listTaskSummaries(state, summaryOptions(query)), null, 2));
} else if (group === "task" && action === "next") {
  const task = loadTask(root, id, state);
  if (!task) throw new Error(`Unknown task: ${id}`);
  console.log(JSON.stringify(nextAction(task), null, 2));
} else if (group === "task" && action === "create") {
  const title = option(raw, "--title");
  if (!id || !title || loadTask(root, id, state)) throw new Error("task create requires a new id and --title");
  const recordedAt = now();
  const task = state.tasks[id] = {
    id, title, type: option(raw, "--type") ?? "infra", phase: "clarify", gate: "G0_confirm", status: "active",
    language: option(raw, "--language") === "en" ? "en" : "vi", risk: option(raw, "--risk") ?? "normal",
    areas: (option(raw, "--area") ?? "root").split(",").map((area) => area.trim()).filter(Boolean), branch: "—",
    artifacts: { intent: `.agents/data/tasks/${id}/intent.md`, design: `.agents/data/tasks/${id}/design.md`, workplan: `.agents/data/tasks/${id}/workplan.md` },
    decisions: [], tasks: [], evidence: [], createdAt: recordedAt, updatedAt: recordedAt
  };
  persist([task]); respond(task);
} else if (group === "task" && action === "transition") {
  const mode = option(raw, "--mode"); const reason = option(raw, "--reason"); const source = option(raw, "--source");
  if (mode !== "audited" || !reason?.trim() || !source?.trim()) throw new Error("task transition requires --mode audited, --reason, and --source");
  const from = state.tasks[id]?.phase; const target = option(raw, "--to"); const task = transitionTask(state, id, target);
  task.evidence.push({ kind: "diagnostic", result: "pass", source, detail: `Audited transition ${from} → ${target}: ${reason}`, recordedAt: now() });
  persist([task]); respond(task);
} else if (group === "task" && action === "archive") {
  const task = transitionTask(state, id, "done"); persist([task], true); respond(task);
} else if (group === "task" && action === "handoff") {
  const task = handoffTask(state, id, option(raw, "--kind"), option(raw, "--reason"), option(raw, "--source"));
  persist([task]); console.log(JSON.stringify({ task, nextAction: nextAction(task) }, null, 2));
} else if (group === "task" && action === "close") {
  const task = closeTask(state, id, option(raw, "--reason"), option(raw, "--source"));
  persist([task]); console.log(JSON.stringify({ task, nextAction: nextAction(task) }, null, 2));
} else if (group === "task" && action === "supersede") {
  const task = supersedeTask(state, id, option(raw, "--successor"), option(raw, "--reason"), option(raw, "--source")); const successor = state.tasks[task.successorTaskId];
  persist([task, successor]); console.log(JSON.stringify({ task, successor, nextAction: nextAction(task) }, null, 2));
} else if (group === "task" && action === "reopen") {
  const task = reopenTask(state, id, option(raw, "--to"), option(raw, "--reason"), option(raw, "--source"));
  persist([task]); console.log(JSON.stringify({ task, nextAction: nextAction(task) }, null, 2));
} else if (group === "task" && action === "status") {
  const task = state.tasks[id]; const status = option(raw, "--status");
  if (!task || !["active", "blocked_on_user", "paused", "done"].includes(status)) throw new Error("task status requires active task id and valid --status");
  if (task.status === "blocked_on_user" && status === "active") throw new Error("Cannot cancel a validated human-gate wait with task status; use an audited lifecycle action");
  if (status === "blocked_on_user") {
    const errors = checkGate(root, state, id, task.gate).filter((item) => item.level === "ERROR");
    if (errors.length) throw new Error(`Gate is not ready: ${errors.map((item) => `${item.code}: ${item.message}`).join("; ")}`);
  }
  task.status = status; task.updatedAt = now(); persist([task]); respond(task);
} else if (group === "task" && action === "item") {
  const itemId = args[3]; const task = state.tasks[id]; const status = option(raw, "--status");
  if (!task || !itemId || !["todo", "in_progress", "done", "deferred"].includes(status)) throw new Error("task item requires active task id, item id, and valid --status");
  const item = task.tasks.find((entry) => entry.id === itemId);
  if (item) { item.status = status; if (option(raw, "--label")) item.label = option(raw, "--label"); }
  else task.tasks.push({ id: itemId, label: option(raw, "--label") ?? itemId, status });
  task.updatedAt = now(); persist([task]); respond(task);
} else if (group === "decision" && action === "set") {
  const decisionId = args[3]; const task = state.tasks[id]; const status = option(raw, "--status");
  if (!task || !decisionId || !["unresolved", "approved", "changed", "dropped"].includes(status)) throw new Error("decision set requires active task id, decision id, and valid --status");
  const current = task.decisions.find((entry) => entry.id === decisionId);
  if (current) { current.status = status; current.resolution = option(raw, "--resolution"); }
  else task.decisions.push({ id: decisionId, label: option(raw, "--label") ?? decisionId, status, resolution: option(raw, "--resolution") });
  task.updatedAt = now(); persist([task]); respond(task);
} else if (group === "evidence" && action === "add") {
  const task = state.tasks[id]; const kind = option(raw, "--kind"); const result = option(raw, "--result");
  if (!task || !["spec", "test", "lint", "review", "diagnostic"].includes(kind) || !["pass", "fail", "skip"].includes(result)) throw new Error("evidence add requires active task id, non-approval --kind, and valid --result; approvals use gate approve");
  task.evidence.push({ kind, gate: option(raw, "--gate"), area: option(raw, "--area"), result, source: option(raw, "--source") ?? "local Node.js script", detail: option(raw, "--detail"), recordedAt: now() });
  task.updatedAt = now(); persist([task]); respond(task);
} else if (group === "lesson" && action === "record") {
  const lessonId = args[3]; const task = state.tasks[id];
  if (!task || !lessonId) throw new Error("lesson record requires active task id and lesson id");
  const source = option(raw, "--source");
  const lesson = recordLesson(task, { id: lessonId, areas: (option(raw, "--area") ?? task.areas.join(",")).split(",").map((item) => item.trim()).filter(Boolean), summary: option(raw, "--summary"), prevention: option(raw, "--prevention"), example: option(raw, "--example"), promotion: option(raw, "--promotion") ?? "not promoted", source });
  persist([task], true); respond(task, { lesson });
} else if (group === "lesson" && action === "none") {
  const task = state.tasks[id]; if (!task) throw new Error("lesson none requires active task id");
  recordNoLessons(task, option(raw, "--reason"), option(raw, "--source")); persist([task], true); respond(task, { lessonDisposition: task.lessonDisposition });
} else if (group === "lesson" && action === "rebuild") {
  console.log(JSON.stringify(rebuildLessonIndex(root, state), null, 2));
} else if (group === "lesson" && action === "search") {
  console.log(JSON.stringify(searchLessons(root, state, option(raw, "--query") ?? "", (option(raw, "--area") ?? "").split(",").map((item) => item.trim()).filter(Boolean), numberOption("--limit", 5)), null, 2));
} else if (group === "memory" && action === "list") {
  console.log(JSON.stringify(loadMemoryRegistry(root), null, 2));
} else if (group === "memory" && action === "promote") {
  const entry = promoteAgenticMemory(root, {
    id: args[2], summary: option(raw, "--summary"), guidance: option(raw, "--guidance"),
    areas: (option(raw, "--area") ?? "*").split(",").map((item) => item.trim()).filter(Boolean),
    phases: (option(raw, "--phase") ?? "*").split(",").map((item) => item.trim()).filter(Boolean),
    priority: numberOption("--priority", 50), sourceTaskId: option(raw, "--source-task"), sourceLessonId: option(raw, "--source-lesson"), approvedBy: option(raw, "--approved-by"), approvedAt: now()
  });
  console.log(JSON.stringify(entry, null, 2));
} else if (group === "memory" && action === "retire") {
  const entry = retireAgenticMemory(root, args[2], option(raw, "--reason"), option(raw, "--approved-by"));
  console.log(JSON.stringify(entry, null, 2));
} else if (group === "gate" && action === "approve") {
  const gate = option(raw, "--gate"); const source = option(raw, "--source");
  if (!id || !gate || !source) throw new Error("gate approve requires active task id, --gate, and explicit --source");
  const result = approveAndAdvance(root, state, id, gate, source); persist([result.task]); console.log(JSON.stringify(result, null, 2));
} else {
  throw new Error("Usage: state.mjs state migrate | task create|show|list|find|next|status|item|transition|archive|handoff|close|supersede|reopen | decision set | evidence add | lesson record|none|search|rebuild | memory list|promote|retire | gate approve");
}
