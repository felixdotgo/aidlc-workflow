import { failEntry, loadState, loadTask, nextAction, parseArguments, rootOption, validateArguments } from "./lib/runtime.mjs";

try {
  const raw = process.argv.slice(2);
  const parsed = parseArguments(raw, { valueOptions: ["--root"], booleanOptions: ["--require-stop"] });
  validateArguments(parsed, { minPositionals: 1, booleanOptions: ["--require-stop"], usage: "Usage: task-next.mjs <task-id> [--root <path>] [--require-stop]" });
  const root = rootOption(parsed);
  const [id] = parsed.positionals;
  const task = loadTask(root, id, loadState(root));
  if (!task) throw new Error(`Unknown task: ${id}`);
  const action = nextAction(task, root);
  console.log(JSON.stringify({ ok: true, result: { id: task.id, phase: task.phase, gate: task.gate, status: task.status }, nextAction: action }, null, 2));
  if (parsed.flags.has("--require-stop") && action.classification === "run_phase") {
    console.error(`CONTINUATION_REQUIRED: ${action.command}`);
    console.error("note: exit code 2 is the continuation guard working as intended (an expected pause, not a failure); execute the command above instead of replying.");
    process.exitCode = 2;
  }
} catch (error) { failEntry(error); }
