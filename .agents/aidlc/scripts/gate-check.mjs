#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const id = process.argv[2];
const root = resolve(process.argv[3] ?? ".");
const errors = [];
const warnings = [];
const error = (code, message) => errors.push(`ERROR ${code}: ${message}`);
const warn = (code, message) => warnings.push(`WARN ${code}: ${message}`);

if (!id) error("TASK_ID", "Usage: gate-check.mjs <task-id> [root]");
const statePath = `${root}/.agents/state/aidlc-state.json`;
if (id && existsSync(statePath)) {
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const task = state?.tasks?.[id];
    if (state?.schemaVersion !== 1) error("STATE_SCHEMA", "Unsupported canonical state schema");
    if (!task) error("TASK_UNKNOWN", `No canonical task ${id}`);
    else {
      if (!task.title || !Array.isArray(task.areas) || !task.areas.length) error("TASK_FIELDS", "Title and affected areas are required");
      if (!Array.isArray(task.decisions) || !Array.isArray(task.tasks) || !Array.isArray(task.evidence)) error("TASK_COLLECTIONS", "Decisions, tasks, and evidence must be arrays");
      for (const [name, path] of Object.entries(task.artifacts ?? {})) if (path && !existsSync(`${root}/${path}`)) error("ARTIFACT_MISSING", `${name}: ${path}`);
      if (task.gate === "G1_review") for (const decision of task.decisions ?? []) if (decision.status === "unresolved") error("UNRESOLVED_DECISION", decision.id);
      if (task.gate === "G2_codereview") {
        if ((task.tasks ?? []).some((item) => !["done", "deferred"].includes(item.status))) error("TASKS_OPEN", "Build tasks remain open");
        if (!(task.evidence ?? []).some((item) => ["test", "lint"].includes(item.kind) && item.result === "pass")) error("VERIFY_EVIDENCE", "No passing verification evidence");
        if (!(task.evidence ?? []).some((item) => item.kind === "review" && item.result === "pass")) error("REVIEW_EVIDENCE", "No passing review evidence");
      }
    }
  } catch (cause) {
    error("STATE_JSON", cause instanceof Error ? cause.message : String(cause));
  }
  console.log([...errors, ...warnings, ...(!errors.length ? [`INFO GATE_OK: structural checks passed for ${id}`] : [])].join("\n"));
  process.exit(errors.length ? 1 : 0);
}
const boardPath = `${root}/.agents/state/BOARD.md`;
if (!existsSync(boardPath)) error("BOARD_MISSING", ".agents/state/BOARD.md does not exist");

let row;
if (existsSync(boardPath) && id) {
  row = readFileSync(boardPath, "utf8").split("\n").find((line) => line.startsWith("|") && line.includes(`\`${id}\``));
  if (!row) error("BOARD_ROW", `No BOARD row for ${id}`);
}

if (row) {
  const cells = row.split("|").slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, ""));
  if (cells.length !== 8) error("BOARD_COLUMNS", `Expected 8 columns, found ${cells.length}`);
  const [, , phase, gate, status, branch, , doc] = cells;
  if (!["clarify", "plan", "build", "wrap"].includes(phase)) error("BOARD_PHASE", `Invalid phase ${phase}`);
  if (!["none", "G0_confirm", "G1_review", "G2_codereview"].includes(gate)) error("BOARD_GATE", `Invalid gate ${gate}`);
  if (!["active", "blocked_on_user", "paused"].includes(status)) error("BOARD_STATUS", `Invalid status ${status}`);
  if (!branch) error("BOARD_BRANCH", "Branch column is empty");
  const docPath = `${root}/${doc}`;
  if (!existsSync(docPath)) error("DOC_MISSING", `${doc} does not exist`);
  else {
    const content = readFileSync(docPath, "utf8");
    const frontmatter = Object.fromEntries((content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "").split("\n").flatMap((line) => {
      const at = line.indexOf(":");
      return at < 0 ? [] : [[line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "")]];
    }));
    for (const field of ["task_id", "title", "type", "phase", "gate", "status", "language", "submodules", "branch", "created_at"]) if (!frontmatter[field]) error("FRONTMATTER", `Missing ${field}`);
    if (frontmatter.task_id !== id) error("TASK_ID_MISMATCH", `Doc task_id is ${frontmatter.task_id}`);
    for (const heading of ["## 📋 Problem", "## 🗺️ Affected areas", "## 💭 Assumptions", "## ❓ Open questions", "## 🎯 Scope"]) if (!content.includes(heading)) error("HEADING", `Missing ${heading}`);
    if (["plan", "build", "wrap"].includes(phase)) for (const heading of ["## Design", "### 🧩 Solution per submodule", "### 📌 Spec traceability", "### 🔗 Cross-service contracts", "### ⚠️ Risks / edge cases"]) if (!content.includes(heading)) error("DESIGN_HEADING", `Missing ${heading}`);
    if (["plan", "build", "wrap"].includes(phase)) {
      const workplanPath = docPath.replace(/\.md$/, ".workplan.md");
      if (!existsSync(workplanPath)) error("WORKPLAN_MISSING", workplanPath.slice(root.length + 1));
      else {
        const workplan = readFileSync(workplanPath, "utf8");
        for (const heading of ["## 🧩 Decisions", "## 🎯 Scope", "## 🚫 Out of scope", "## 🌿 Branch isolation", "## 🧩 Tasks", "## 🔧 Verify", "## 📁 Files touched"]) if (!workplan.includes(heading)) error("WORKPLAN_HEADING", `Missing ${heading}`);
        if (workplan.match(/^- \[ \](?!.*change to)/m) && phase === "build") warn("BLANK_BOX", "Build workplan contains blank boxes; verify they are task boxes or resolved alternatives");
      }
    }
  }
}

console.log([...errors, ...warnings, ...(!errors.length ? [`INFO GATE_OK: structural checks passed for ${id}`] : [])].join("\n"));
process.exitCode = errors.length ? 1 : 0;
