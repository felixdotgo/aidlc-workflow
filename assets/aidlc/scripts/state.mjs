#!/usr/bin/env node
import { acquireStateLock, approveAndAdvance, checkGate, closeTask, handoffTask, listTaskSummaries, loadMemoryRegistry, loadState, loadTask, migrateState, nextAction, option, parseArguments, promoteAgenticMemory, rebuildLessonIndex, recordLesson, recordNoLessons, renderViews, reopenTask, retireAgenticMemory, rootOption, saveState, searchLessons, supersedeTask, transitionTask, validateArguments } from "./lib/runtime.mjs";

const raw = process.argv.slice(2);
const valueOptions = ["--root", "--status", "--limit", "--cursor", "--query", "--title", "--type", "--language", "--risk", "--area", "--mode", "--reason", "--source", "--to", "--kind", "--successor", "--label", "--resolution", "--result", "--gate", "--detail", "--summary", "--prevention", "--example", "--promotion", "--guidance", "--phase", "--priority", "--source-task", "--source-lesson", "--approved-by"];
const parsed = parseArguments(raw, { valueOptions, booleanOptions: ["--include-archive"] });
const args = parsed.positionals;
const [group, action, rawId] = args;
const id = rawId;
const schemas = {
  "state migrate": { minPositionals: 2 },
  "task show": { minPositionals: 2, maxPositionals: 3, valueOptions: ["--status", "--limit", "--cursor"], booleanOptions: ["--include-archive"] },
  "task list": { minPositionals: 2, valueOptions: ["--status", "--limit", "--cursor"], booleanOptions: ["--include-archive"] },
  "task find": { minPositionals: 2, valueOptions: ["--query", "--status", "--limit", "--cursor"], booleanOptions: ["--include-archive"], requiredOptions: ["--query"] },
  "task next": { minPositionals: 3 },
  "task create": { minPositionals: 3, valueOptions: ["--title", "--type", "--language", "--risk", "--area"], requiredOptions: ["--title"] },
  "task transition": { minPositionals: 3, valueOptions: ["--mode", "--reason", "--source", "--to"], requiredOptions: ["--mode", "--reason", "--source", "--to"], usage: "task transition requires --mode audited, --reason, --source, and --to" },
  "task archive": { minPositionals: 3 },
  "task handoff": { minPositionals: 3, valueOptions: ["--kind", "--reason", "--source"], requiredOptions: ["--kind", "--reason", "--source"] },
  "task close": { minPositionals: 3, valueOptions: ["--reason", "--source"], requiredOptions: ["--reason", "--source"] },
  "task supersede": { minPositionals: 3, valueOptions: ["--successor", "--reason", "--source"], requiredOptions: ["--successor", "--reason", "--source"] },
  "task reopen": { minPositionals: 3, valueOptions: ["--to", "--reason", "--source"], requiredOptions: ["--to", "--reason", "--source"] },
  "task status": { minPositionals: 3, valueOptions: ["--status"], requiredOptions: ["--status"] },
  "task item": { minPositionals: 4, valueOptions: ["--status", "--label"], requiredOptions: ["--status"] },
  "decision set": { minPositionals: 4, valueOptions: ["--status", "--label", "--resolution"], requiredOptions: ["--status"] },
  "evidence add": { minPositionals: 3, valueOptions: ["--kind", "--result", "--gate", "--area", "--source", "--detail"], requiredOptions: ["--kind", "--result"] },
  "lesson record": { minPositionals: 4, valueOptions: ["--area", "--summary", "--prevention", "--example", "--promotion", "--source"] },
  "lesson none": { minPositionals: 3, valueOptions: ["--reason", "--source"], requiredOptions: ["--reason", "--source"] },
  "lesson rebuild": { minPositionals: 2 },
  "lesson search": { minPositionals: 2, valueOptions: ["--query", "--area", "--limit"] },
  "memory list": { minPositionals: 2 },
  "memory promote": { minPositionals: 3, valueOptions: ["--summary", "--guidance", "--area", "--phase", "--priority", "--source-task", "--source-lesson", "--approved-by"], requiredOptions: ["--summary", "--guidance"] },
  "memory retire": { minPositionals: 3, valueOptions: ["--reason", "--approved-by"], requiredOptions: ["--reason", "--approved-by"] },
  "gate approve": { minPositionals: 3, valueOptions: ["--gate", "--source"], requiredOptions: ["--gate", "--source"] }
};
const usage = "Usage: state.mjs state migrate | task create|show|list|find|next|status|item|transition|archive|handoff|close|supersede|reopen | decision set | evidence add | lesson record|none|search|rebuild | memory list|promote|retire | gate approve";
const schema = schemas[`${group ?? ""} ${action ?? ""}`];
if (!schema) throw new Error(usage);
validateArguments(parsed, { ...schema, maxPositionals: schema.maxPositionals ?? schema.minPositionals, usage: schema.usage ?? usage });
const root = rootOption(parsed);
const releaseStateLock = acquireStateLock(root);
let released = false;
const releaseOnce = () => { if (!released) { releaseStateLock(); released = true; } };
process.once("exit", releaseOnce);
try {
const state = loadState(root);
const now = () => new Date().toISOString();
const numberOption = (name, fallback) => {
  const rawValue = option(parsed, name);
  if (rawValue === undefined) return fallback;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
};
const summaryOptions = (query) => ({
  includeArchive: parsed.flags.has("--include-archive"),
  statuses: option(parsed, "--status")?.split(",").map((item) => item.trim()).filter(Boolean),
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
  const query = option(parsed, "--query");
  if (!query) throw new Error("task find requires --query");
  console.log(JSON.stringify(listTaskSummaries(state, summaryOptions(query)), null, 2));
} else if (group === "task" && action === "next") {
  const task = loadTask(root, id, state);
  if (!task) throw new Error(`Unknown task: ${id}`);
  console.log(JSON.stringify(nextAction(task), null, 2));
} else if (group === "task" && action === "create") {
  const title = option(parsed, "--title");
  if (!id || !title || loadTask(root, id, state)) throw new Error("task create requires a new id and --title");
  const recordedAt = now();
  const task = state.tasks[id] = {
    id, title, type: option(parsed, "--type") ?? "infra", phase: "clarify", gate: "G0_confirm", status: "active",
    language: option(parsed, "--language") === "en" ? "en" : "vi", risk: option(parsed, "--risk") ?? "normal",
    areas: (option(parsed, "--area") ?? "root").split(",").map((area) => area.trim()).filter(Boolean), branch: "—",
    artifacts: { intent: `.agents/data/tasks/${id}/intent.md`, design: `.agents/data/tasks/${id}/design.md`, workplan: `.agents/data/tasks/${id}/workplan.md` },
    decisions: [], tasks: [], evidence: [], createdAt: recordedAt, updatedAt: recordedAt
  };
  persist([task]); respond(task);
} else if (group === "task" && action === "transition") {
  const mode = option(parsed, "--mode"); const reason = option(parsed, "--reason"); const source = option(parsed, "--source");
  if (mode !== "audited" || !reason?.trim() || !source?.trim()) throw new Error("task transition requires --mode audited, --reason, and --source");
  const from = state.tasks[id]?.phase; const target = option(parsed, "--to"); const task = transitionTask(state, id, target);
  task.evidence.push({ kind: "diagnostic", result: "pass", source, detail: `Audited transition ${from} → ${target}: ${reason}`, recordedAt: now() });
  persist([task]); respond(task);
} else if (group === "task" && action === "archive") {
  const task = transitionTask(state, id, "done"); persist([task], true); respond(task);
} else if (group === "task" && action === "handoff") {
  const task = handoffTask(state, id, option(parsed, "--kind"), option(parsed, "--reason"), option(parsed, "--source"));
  persist([task]); console.log(JSON.stringify({ task, nextAction: nextAction(task) }, null, 2));
} else if (group === "task" && action === "close") {
  const task = closeTask(state, id, option(parsed, "--reason"), option(parsed, "--source"));
  persist([task]); console.log(JSON.stringify({ task, nextAction: nextAction(task) }, null, 2));
} else if (group === "task" && action === "supersede") {
  const task = supersedeTask(state, id, option(parsed, "--successor"), option(parsed, "--reason"), option(parsed, "--source")); const successor = state.tasks[task.successorTaskId];
  persist([task, successor]); console.log(JSON.stringify({ task, successor, nextAction: nextAction(task) }, null, 2));
} else if (group === "task" && action === "reopen") {
  const task = reopenTask(state, id, option(parsed, "--to"), option(parsed, "--reason"), option(parsed, "--source"));
  persist([task]); console.log(JSON.stringify({ task, nextAction: nextAction(task) }, null, 2));
} else if (group === "task" && action === "status") {
  const task = state.tasks[id]; const status = option(parsed, "--status");
  if (!task || !["active", "blocked_on_user", "paused", "done"].includes(status)) throw new Error("task status requires active task id and valid --status");
  if (task.status === "blocked_on_user" && status === "active") throw new Error("Cannot cancel a validated human-gate wait with task status; use an audited lifecycle action");
  if (status === "blocked_on_user") {
    const errors = checkGate(root, state, id, task.gate).filter((item) => item.level === "ERROR");
    if (errors.length) throw new Error(`Gate is not ready: ${errors.map((item) => `${item.code}: ${item.message}`).join("; ")}`);
  }
  task.status = status; task.updatedAt = now(); persist([task]); respond(task);
} else if (group === "task" && action === "item") {
  const itemId = args[3]; const task = state.tasks[id]; const status = option(parsed, "--status");
  if (!task || !itemId || !["todo", "in_progress", "done", "deferred"].includes(status)) throw new Error("task item requires active task id, item id, and valid --status");
  const item = task.tasks.find((entry) => entry.id === itemId);
  if (item) { item.status = status; if (parsed.present.has("--label")) item.label = option(parsed, "--label"); }
  else task.tasks.push({ id: itemId, label: option(parsed, "--label") ?? itemId, status });
  task.updatedAt = now(); persist([task]); respond(task);
} else if (group === "decision" && action === "set") {
  const decisionId = args[3]; const task = state.tasks[id]; const status = option(parsed, "--status");
  if (!task || !decisionId || !["unresolved", "approved", "changed", "dropped"].includes(status)) throw new Error("decision set requires active task id, decision id, and valid --status");
  const current = task.decisions.find((entry) => entry.id === decisionId);
  if (current) { current.status = status; if (parsed.present.has("--label")) current.label = option(parsed, "--label"); if (parsed.present.has("--resolution")) current.resolution = option(parsed, "--resolution"); }
  else task.decisions.push({ id: decisionId, label: option(parsed, "--label") ?? decisionId, status, resolution: option(parsed, "--resolution") });
  task.updatedAt = now(); persist([task]); respond(task);
} else if (group === "evidence" && action === "add") {
  const task = state.tasks[id]; const kind = option(parsed, "--kind"); const result = option(parsed, "--result");
  if (!task || !["spec", "test", "lint", "review", "diagnostic"].includes(kind) || !["pass", "fail", "skip"].includes(result)) throw new Error("evidence add requires active task id, non-approval --kind, and valid --result; approvals use gate approve");
  task.evidence.push({ kind, gate: option(parsed, "--gate"), area: option(parsed, "--area"), result, source: option(parsed, "--source") ?? "local Node.js script", detail: option(parsed, "--detail"), recordedAt: now() });
  task.updatedAt = now(); persist([task]); respond(task);
} else if (group === "lesson" && action === "record") {
  const lessonId = args[3]; const task = state.tasks[id];
  if (!task || !lessonId) throw new Error("lesson record requires active task id and lesson id");
  const source = option(parsed, "--source");
  const lesson = recordLesson(task, { id: lessonId, areas: (option(parsed, "--area") ?? task.areas.join(",")).split(",").map((item) => item.trim()).filter(Boolean), summary: option(parsed, "--summary"), prevention: option(parsed, "--prevention"), example: option(parsed, "--example"), promotion: option(parsed, "--promotion") ?? "not promoted", source });
  persist([task], true); respond(task, { lesson });
} else if (group === "lesson" && action === "none") {
  const task = state.tasks[id]; if (!task) throw new Error("lesson none requires active task id");
  recordNoLessons(task, option(parsed, "--reason"), option(parsed, "--source")); persist([task], true); respond(task, { lessonDisposition: task.lessonDisposition });
} else if (group === "lesson" && action === "rebuild") {
  console.log(JSON.stringify(rebuildLessonIndex(root, state), null, 2));
} else if (group === "lesson" && action === "search") {
  console.log(JSON.stringify(searchLessons(root, state, option(parsed, "--query") ?? "", (option(parsed, "--area") ?? "").split(",").map((item) => item.trim()).filter(Boolean), numberOption("--limit", 5)), null, 2));
} else if (group === "memory" && action === "list") {
  console.log(JSON.stringify(loadMemoryRegistry(root), null, 2));
} else if (group === "memory" && action === "promote") {
  const entry = promoteAgenticMemory(root, {
    id: args[2], summary: option(parsed, "--summary"), guidance: option(parsed, "--guidance"),
    areas: (option(parsed, "--area") ?? "*").split(",").map((item) => item.trim()).filter(Boolean),
    phases: (option(parsed, "--phase") ?? "*").split(",").map((item) => item.trim()).filter(Boolean),
    priority: numberOption("--priority", 50), sourceTaskId: option(parsed, "--source-task"), sourceLessonId: option(parsed, "--source-lesson"), approvedBy: option(parsed, "--approved-by"), approvedAt: now()
  });
  console.log(JSON.stringify(entry, null, 2));
} else if (group === "memory" && action === "retire") {
  const entry = retireAgenticMemory(root, args[2], option(parsed, "--reason"), option(parsed, "--approved-by"));
  console.log(JSON.stringify(entry, null, 2));
} else if (group === "gate" && action === "approve") {
  const gate = option(parsed, "--gate"); const source = option(parsed, "--source");
  if (!id || !gate || !source) throw new Error("gate approve requires active task id, --gate, and explicit --source");
  const result = approveAndAdvance(root, state, id, gate, source); persist([result.task]); console.log(JSON.stringify(result, null, 2));
} else {
  throw new Error("Usage: state.mjs state migrate | task create|show|list|find|next|status|item|transition|archive|handoff|close|supersede|reopen | decision set | evidence add | lesson record|none|search|rebuild | memory list|promote|retire | gate approve");
}
} finally {
  process.off("exit", releaseOnce);
  releaseOnce();
}
