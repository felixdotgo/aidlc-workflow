
# AI-DLC · Build (Gate G2)

**Precondition:** every `🧩 Decisions` / `🎯 Scope` / `🌿 Branch isolation` box in the workplan (the `<…>.workplan.md` sibling of the task doc at the BOARD row's `doc` path — normally in `open/`, already in `in-progress/` on RESUME) is **resolved** per `conventions.md §6`: `[x]` → build it; `[ ]` + `> change to …` → apply the change and build (re-plan only if the change is structural); `[ ]` with no note → **STOP and ask the user (drop / change / keep) before implementing — never silently build or silently drop.** Begin implementation only once no box is blank-unresolved. (The `🧩 Tasks` boxes stay empty until this phase fills them.)

## Step 0 — Branch isolation (only if opted-in at G1)

Read the `🌿 Branch isolation` choice in the workplan (if it was left blank, it was resolved during the §6 confirmation; default = work directly):
- **"Work directly on the current branch"** → skip this step, keep current behavior. Board `branch` stays `—`.
- **"Create branch `aidlc/<task-id>`"** → per `conventions.md §5`: for each touched submodule, ensure the working tree is clean (commit/stash any other task's WIP first), then `git checkout -b aidlc/<task-id>` (or `git checkout aidlc/<task-id>` if it already exists). Record the branch name in the BOARD `branch` column and the workplan frontmatter. **Build/test runtime stays sequential** — branches isolate code/commits, not the shared docker stack.

## Step 1 — Move the task to `in-progress/` + open the workplan

**G1 GO = the task leaves `open/`:** move the task's file pair `.agents/tasks/open/<DD-MM-YYYY>-<slug>{.md,.workplan.md}` → `.agents/tasks/in-progress/` (`mkdir -p` first) and update the BOARD row's `doc` path in the same step (`conventions.md §2/§8`). Skip the move if the files are already in `in-progress/` (RESUME). If G1 is later **reopened** (e.g. the user vetoes a §10 auto-pass after this move), move the pair back to `open/` and re-point `doc` — file location must keep matching gate state.

Work from the existing workplan `.agents/tasks/in-progress/<DD-MM-YYYY>-<slug>.workplan.md` created at G1. Bump its frontmatter to `phase: build` · `gate: G2_codereview`. Its `🧩 Tasks` section is the live tracker for this phase — do not create a separate todo file. Any prose you add (task notes, status notes) follows the workplan's `language`; conventional-commit subjects stay English.

## Step 2 — Implement (per submodule, one task at a time)

Work submodule-by-submodule so each repo's changes stay cohesive and commit cleanly later.

1. Mark the task `[~]` in the workplan's `🧩 Tasks` section.
2. **Re-anchor on the spec:** if the task touches anything listed in the design's `### 📌 Spec traceability`, re-open the cited spec lines and confirm what you are about to implement matches the verbatim quote. A mismatch already resolved at G1 (a ticked `🧩 Decisions` box) → implement the approved outcome. A NEW mismatch — including existing code that disagrees with the quote — → STOP and surface it to the user as a decision with *follow the spec* as the recommended default (`conventions.md §6` semantics); do not adopt the code or your memory of the spec.
3. Follow the project's conventions for the submodule's detected stack (from `.agents/state/repo-map.md`), in order: the stack convention rule `rules/<stack>-conventions.md` (this dir) if present, then the submodule's own `CLAUDE.md` / `.claude/rules/`, then existing code patterns via `codegraph_explore`. Do not inline stack/project specifics into this phase doc.
4. Edit with the right tool (per `orchestrator.md` Tool Priority): `mcp__serena__*` for whole-symbol changes, `apply_patch`/Edit for a few lines. Run `mcp__codegraph__codegraph_impact` before changing shared/public symbols (no codegraph → grep the symbol's callers instead — the blast-radius check itself is mandatory).
5. Reuse the submodule's own skills/flows where they fit the stack (check its `.claude/` for existing scaffold/bug-fix patterns that already encode the house style).
6. Mark the task `[x]`.

## Step 3 — Narrowest verification (per submodule)

**Before running anything against the stack, follow `conventions.md §7`** (idempotent, check-first, never tear down a shared running stack). The project's concrete lifecycle/exec commands live in `rules/stack-runtime.md`; the exact per-submodule test/lint command lives in `.agents/state/repo-map.md`.

Run the **tightest** command listed for each touched submodule in `.agents/state/repo-map.md` — never the whole-repo suite.

**Self-correction loop (`conventions.md §9` — bounded; the cycle limits live ONLY there):** on failure, diagnose, fix, and re-run the **same** command, within the §9 per-submodule bound. A correct fix that would require a structural change (schema/contract/where-logic-lives) → escalate immediately, don't burn cycles on workarounds. Bound hit → stop iterating and carry a `⛔ Diagnosis` block (what failed, what each cycle tried, best hypothesis, options) into the G2 form.

If a command can't run (service down, env missing), say so and state the residual risk — do not silently skip.

## Step 4 — Code review (Gate G2)

Run a code review scoped to **only** the files changed in this task (Claude Code: invoke the `code-review` skill with the file list; no review tool → do an adversarial self-review pass over the diff and report its findings honestly), **and pass the design's `### 📌 Spec traceability` rows** so the review also checks the code against the spec quotes — not only internal diff correctness. Address correctness findings — including code-vs-spec mismatches — before stopping.

**Bounded per `§9` (review-pass limit lives there):** fix the correctness findings from the first pass, re-run the review once. Findings still open after the final allowed pass → stop iterating and list them in a `⛔ Diagnosis` block in the G2 form instead of looping further.

## Step 5 — Gate self-check + Board + STOP

- Run the gate self-check in `conventions.md §3`; fix any failure first.
- Edit `BOARD.md`: set the task's row `phase=build`, `gate=G2_codereview`, `status=blocked_on_user`; keep the `branch` column in sync with Step 0. Keep build progress in the workplan's `🧩 Tasks` section (`[x]`), not on the board.
- Present the **🟣 Gate G2 form** (`conventions.md §4`): diff summary + test result + code-review outcome + branch, ending with the `👉` cue. **STOP** for the user to review the code. The Orchestrator advances to the wrap phase (`phase-wrap.md`) only on approval.

## Post-conditions (Compartment 2 — self-check before the G2 stop; enforced via `conventions.md §3`)

**Executable:**
- The narrowest test/lint command for **each** touched submodule passed within the §9 bounds — or its skip/failure is surfaced in the G2 form (`⛔ Diagnosis` / residual risk), never silently dropped.

**LLM-judged:**
- Every `🧩 Tasks` box is `[x]` (or its deferral is explicitly surfaced at G2).
- The diff implements exactly the approved `🧩 Decisions` outcomes and matches the design's `📌 Spec traceability` quotes — no scope creep beyond the workplan.
- The changed code follows the touched stack's conventions (`rules/<stack>-conventions.md` (this dir) + the submodule's own rules).
- Code-review correctness findings are addressed (within the §9 review-pass bound) or listed openly in the G2 form.
