
# AI-DLC · Wrap

**Precondition:** the user approved the code at G2. Only commit/push when the user has asked for it — confirm first if unsure.

## Step 1 — Commit per submodule

Each submodule is its **own git repo** (its own remote). For every touched submodule, commit **inside that submodule dir** with a conventional message:

```
<type>(<scope>): <what>
```
`type` ∈ feat | fix | refactor | chore | test. Reuse a per-submodule `git-commit` skill's analysis/staging where the submodule provides one.

- **If branch isolation was opted-in** (BOARD `branch` = `aidlc/<task-id>`): the submodule is already on that branch (created in the build phase Step 0) — commit there. After committing, ask the user whether to `git push -u origin aidlc/<task-id>` and open a PR. **Never push automatically.**
- **If not** (`branch` = `—`): commit on the current branch; branch first only if on the default branch and the user expects a PR.

> Submodule pointer: after committing in a submodule, the **parent** repo's recorded SHA changes. Ask the user whether to also bump the pointer in the parent (`git add <path/to/submodule>`) — don't assume.

## Step 2 — Backlog (if linked)

If the task referenced a Backlog issue, update it (`mcp__backlog__update_issue`; no Backlog MCP → give the user the summary comment to post manually): set status, add an implementation-summary comment (files changed, key decisions, how to test). If the task has a sibling "Create UI screen" subtask, reuse the `sync-api-to-ui` pattern to push API info across.

## Step 3 — Lessons

If a durable user correction surfaced during this task (likely to recur, affects future work), write `.agents/lessons/<DD-MM-YYYY>-<slug>.md` by copying `templates/lesson.md` (in `templates/` of this dir) and filling it (frontmatter + mistake pattern + prevention rule + example). Set `language` to the task's value and write the prose in that language; scaffold + technical tokens stay English. Promote repo-wide ones into `.agents/gotchas.md`. Skip for one-off/conversational corrections (per `orchestrator.md` Gates & Artifacts).

**Promotion into the active rule set (Compartment 3 → 2):** if the lesson is **checkable** (a rule/tool could catch the mistake) or has **recurred** across tasks, don't leave it as prose — propose promoting it, picking the strongest fitting target:
- **(a)** a line in `rules/<stack>-conventions.md` or the relevant `phase-*.md`'s `## Post-conditions` (both in this dir) — for stack/workflow rules AI must follow;
- **(b)** an item in the gate self-check (`conventions.md §3`) — for artifact-quality rules that apply at every gate;
- **(c)** an **executable check** (lint rule/config, small script wired into the narrowest verify command) — strongest, for anything deterministically checkable.

Show the user the **exact proposed edit** (target file + wording) and apply it **only on their approval** — new rules are admitted deliberately, never silently. Record the outcome in the lesson's `**Promotion:**` line (target path · `proposed, declined` · `not promoted — <why>`).

## Step 4 — Close & archive the task

The board is loaded every turn (hook-injected or read at turn start) — done tasks must leave it (`conventions.md §8`):

- **Archive the row:** remove the task's row from `BOARD.md`; append it (with `phase=done`, `gate=none`, `status=done`, `branch` kept as-is for audit) to `.agents/state/ARCHIVE.md` — same table format; if the file is missing, create it with a `# AI-DLC ARCHIVE` heading + the same table header. If the board's table becomes empty, restore the `_No tasks in flight._` line.
- **Archive the artifacts:** move the task's file pair `.agents/tasks/in-progress/<DD-MM-YYYY>-<slug>{.md,.workplan.md}` → `.agents/tasks/done/` (`mkdir -p` first); update the archived row's `doc` path accordingly. Lessons stay in `.agents/lessons/`.
- Report (`✅ done`): commits made (per submodule + branch), pushed/PR (y/n), Backlog updated (y/n), lessons captured (y/n), **spec traceability upheld** (per the build phase's spec-aware code-review at G2 — relay that result and note any gate-approved deviation; wrap does not re-verify), and any residual risk.

## Post-conditions (Compartment 2 — self-check before reporting done; enforced via `conventions.md §3`)

**Executable:**
- Each touched submodule has its conventional commit (when the user asked to commit); the task's row is removed from `BOARD.md` and appended to `.agents/state/ARCHIVE.md`; the task's doc + `.workplan.md` files are moved to `.agents/tasks/done/`.

**LLM-judged:**
- Commit messages describe the actual diff (type/scope/what all accurate).
- Lessons were captured only for durable corrections, and **every promotion proposal was shown to and approved by the user before being written** — no rule admitted silently.
- The final report states commits, push/PR status, Backlog status, lessons/promotions, and residual risk faithfully.
