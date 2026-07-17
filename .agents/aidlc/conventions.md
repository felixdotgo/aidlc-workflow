# AI-DLC — Shared conventions

> Single source of truth for **emoji UI**, **canonical frontmatter**, **gate self-check**, **branch isolation**, **self-correction bounds (§9)**, and **adaptive gates (§10)**.
> Every phase (`phase-*.md`; surfaced as `aidlc-*` skills in Claude Code) reads and obeys this file **before STOPPING** at any gate. Do not repeat this content in each phase doc or adapter.
> **Language rule (MANDATORY):** *scaffold* and *technical tokens* are ALWAYS English; *prose* MUST follow the artifact's `language` frontmatter (§2).
> - **Always English:** frontmatter keys + enum values, emoji headings + section labels, STOP-form structural labels; and technical tokens — file paths, class/method/variable names, route/endpoint names, enum values, SQL identifiers, shell commands, URLs. Also English: `BOARD.md` / `repo-map.md` / `specs-index.md` (internal state/index) and conventional-commit subjects.
> - **Follows `language`:** all prose — Problem, the "why" of Affected areas, Assumptions, Open questions, Scope / Out-of-scope descriptions, Design prose, Decision rationale + descriptive labels, Task descriptions, Risks / edge cases, Discovery findings, Lesson prose, the "change / follow-up" cells of Files touched, and the `<…>` content you fill into a STOP form.
> - **`language` is set ONCE at G0** from the user's prompt language (`vi` if the prompt is Vietnamese, else `en`) and **every later phase/artifact inherits it** — never re-detect from a G1/G2 prompt (often just a terse gate answer like "GO").

---

## 1. Emoji legend (used for both the chat form and headings inside `.md` files)

- **Gate:** `🟢 G0` (clarify) · `🔵 G1` (plan/review) · `🟣 G2` (build/code-review) · `🟢🔵 G0+G1` (combined, abbreviated pipeline — §10)
- **Adaptive/loop tokens:** `⚡` G1 auto-pass prefix (§10) · `⛔ Diagnosis` escalation block in the G2 form (§9)
- **Section:** `📋 Problem` · `🗺️ Affected areas` · `💭 Assumptions` · `❓ Open questions` · `🎯 Scope` · `🚫 Out of scope` · `🧩 Task breakdown` · `📌 Spec traceability` · `🔗 Cross-service contracts` · `⚠️ Risks / edge cases` · `✅ Review` · `📁 Files touched` · `🌿 Branch` · `🔧 Verify`
- **Status:** `⏳ blocked_on_user` · `⏸ paused` · `✅ done / passed` · `⛔ blocked` · `▶️ active`
- **Response cue:** `👉` — every STOP form **must** end with exactly one `👉 …` line stating what the user needs to do to proceed.

Use emoji **consistently** per the map above — do not invent other emoji for the same item.

---

## 2. Task layout & canonical frontmatter (`.agents/tasks|lessons`)

**Task artifact layout (flat, status-based):** every task lives in `.agents/tasks/<status>/` where `<status>` = `open` (clarify/plan, pre-G1-GO) · `in-progress` (post-G1-GO: build/review/wrap) · `done` (wrapped). A task = its doc `<DD-MM-YYYY>-<slug>.md` (+ sibling workplan `<DD-MM-YYYY>-<slug>.workplan.md` from plan onward), directly in the status dir — **no per-task subfolders**. A bug is just a task with `type: bug` (slug may end in `-bug`); there is no separate bugs dir. Changing status = `mv` the file pair to the new status dir **and** update the BOARD row's `doc` in the same step (clarify creates in `open/`; build moves to `in-progress/` right after the G1 GO; wrap moves to `done/`).

```yaml
---
task_id: <YYYY-MMDD-slug>                 # matches the id on the BOARD
title: <short title>
type: feature | bug | refactor | infra    # enum
phase: clarify | plan | build | wrap | done
gate: none | G0_confirm | G1_review | G2_codereview
status: active | blocked_on_user | paused | done
language: vi | en                         # prose language; set ONCE at G0 from the user's prompt, inherited by every later phase
submodules: [<sub-a>, <sub-b>]            # matches the submodules column on the BOARD
branch: "—"                                # "—" if working directly; "aidlc/<task-id>" if isolation opted-in
created_at: <DD-MM-YYYY HH:MM>
---
```

- **Every** enum value must be spelled exactly as above — do not add or change values. *(A repo's executable §3 gate-check may mirror these enums — see `rules/gate-check.md` for this repo's mirroring caveat; changing an enum here requires updating that checker too.)*
- `language` is decided at G0 (clarify) from the user's prompt and copied unchanged into every downstream artifact (design, workplan, lesson) of the same task — see the Language rule at the top.
- `task_id`, `submodules`, `branch` must **match** the corresponding row on `BOARD.md`.
- **`BOARD.md` is local, gitignored state** — one copy per developer, never committed. When it is missing, **seed it from `.agents/aidlc/templates/board.md` verbatim** before adding rows; never re-author its scaffold from memory (`templates/board.md` is the source of truth for the board format).

---

## 3. Gate self-check (REQUIRED — run right before STOPPING; fix everything before passing the gate)

Each phase self-checks — clarify/plan/build right before presenting the gate form, wrap right before reporting `✅ done`.

**Executable half FIRST:** before presenting ANY gate, read the project rule `rules/gate-check.md` (if it exists) and run the gate-check command it declares. **Contract:** the command takes `<task-id>`, exits `0` = pass (warnings allowed) / `1` = at least one **ERROR** — fix every ERROR before presenting the gate; mention any remaining **WARN** in the STOP form. Respect the rule's caveats (e.g. wrap timing). Boxes marked `⚙` below are (mostly) covered by the command — when the rule is absent or the command cannot run, check them by hand and say so in the form. The remaining boxes are LLM-judged: assess them honestly; the S3 eval showed small models over-report compliance, which is exactly why the executable half exists.

- [ ] `⚙` The artifact has **ALL** required headings of its template (script checks presence; "no extra invented sections" stays manual).
- [ ] `⚙` Frontmatter has every §2 field, all enum values valid.
- [ ] `⚙` The `BOARD.md` row uses the correct enums (`phase`/`gate`/`status`) + the `branch` column has a value (`—` or a branch name).
- [ ] `⚙` Every cross-link (doc ↔ workplan) exists and shares the same `task_id`.
- [ ] `⚙` Headings use the correct emoji per §1 (script); all scaffold text is in English (manual).
- [ ] Prose is written in the task's `language`; scaffold + technical tokens (path/class/route/enum/cmd) stay English.
- [ ] **Content fidelity (from plan onward — G0 intent briefs are exempt):** every enumeration / count / value-set the artifact relies on traces to the **design's** `📌 Spec traceability` rows (verbatim quote, `file:line` / rule ID, or an explicit non-spec source) and matches them — a summary is never a substitute for the quote. That section lives ONLY in the design; the workplan satisfies this via its cross-link to the design — never add a `📌` section to intent briefs or workplans.
- [ ] **No silent spec override (from plan onward):** every code↔spec conflict found so far is surfaced as a workplan `🧩 Decisions` box (full rule: `phase-plan.md` Step 3) — never resolved silently in favor of the code.
- [ ] The current phase doc's own **`## Post-conditions`** section holds: every **Executable** item ran and passed (or its skip/failure is surfaced in the STOP form with residual risk), and every **LLM-judged** item was assessed honestly.

If **any** box fails → fix the artifact, do **NOT** present the gate. This is the guard against AI drift — the `⚙` boxes are enforced by the executable gate-check (`rules/gate-check.md`); the rest rely on phase discipline.

---

## 4. Canonical STOP form per gate (chat)

Unified layout; replace the content inside `<…>`. Always end with a `👉` line.

**🟢 Gate G0:**
```markdown
## 🟢 Gate G0 — Confirm intent · `<task-id>`
**📋 Problem:** <1–2 sentences>
**🎯 Scope In:** <…> · **🚫 Out:** <…>
**❓ Open questions:**
 1. <q> *(default: <default>)*
**📁 Doc:** `.agents/tasks/open/<…>.md`

👉 Reply `ok` to approve · or edit the doc directly / state changes.
```

**🔵 Gate G1:**
```markdown
## 🔵 Gate G1 — Review plan · `<task-id>`
**🧩 Summary:** <2–3 lines: main solution + submodules touched>
**✅ Workplan:** `.agents/tasks/open/<…>.workplan.md` (`<n>` decision boxes to tick)
**🌿 Branch isolation:** <yes/no — awaiting the user's choice in the workplan>

👉 Tick `[x]` to approve · add `> change to …` to adjust · leave a box blank to decide — I'll confirm any blanks with you before building (no need to tick everything). See §6.
```

**⚡ G1 auto-pass variant (§10):** same 🔵 layout, but the title becomes `## ⚡🔵 Gate G1 auto-passed (§10) · <task-id>` and the `👉` line is replaced by:
```markdown
👉 §10 criteria met (0 decisions · ≤1 submodule · no schema/contract/migration · 🌿 default) — proceeding to build NOW. Reply anytime to veto or adjust; that reopens G1.
```

**🟢🔵 Combined Gate G0+G1 (abbreviated pipeline, §10):**
```markdown
## 🟢🔵 Gate G0+G1 — Confirm intent & plan · `<task-id>`
**📋 Problem:** <1–2 sentences>
**🎯 Scope In:** <…> · **🚫 Out:** <…>
**🧩 Summary:** <2–3 lines: main solution + submodules touched>
**✅ Workplan:** `.agents/tasks/open/<…>.workplan.md` (`<n>` decision boxes to tick)
**🌿 Branch isolation:** <yes/no — awaiting the user's choice in the workplan>

👉 One reply resolves both gates: `ok` approves intent+plan (then build starts) · tick/`> change` the workplan boxes per §6 · or state changes to the problem/scope.
```

**🟣 Gate G2:**
```markdown
## 🟣 Gate G2 — Review code · `<task-id>`
**📁 Changed:** <n files across m submodules>
**🔧 Test/lint:** <result of the narrowest command, or why it could not run + residual risk>
**✅ Code-review:** <pass / points addressed>
**🌿 Branch:** <aidlc/<task-id> | working directly>

👉 Approve to wrap (commit + close the task) · or point out what to fix.
```

---

## 5. Branch isolation rules (branch-per-submodule)

- **Mechanism:** each opted-in task → create branch `aidlc/<task-id>` **in every touched submodule** (each submodule is its own git repo). The parent stays on the current branch.
- **Decision point:** the **G1** workplan (`🌿 Branch isolation` section). Default = work directly on the current branch.
- **Build (`phase-build.md` Step 0):** if opted-in → ensure the working tree is clean (commit/stash other tasks' WIP) → `git checkout -b aidlc/<task-id>` (or `git checkout` if the branch already exists) in each submodule → record the branch name in the BOARD `branch` column + the workplan header.
- **Wrap (`phase-wrap.md`):** conventional commit **on that branch**; after committing, ask the user whether to `git push -u origin aidlc/<task-id>` + open a PR (never push automatically). The parent pointer bump stays interactive.
- **SWITCH between isolated tasks:** commit/stash the current task's WIP → `git checkout` the `aidlc/<other-id>` branch in the relevant submodules.
- **Key limitation:** the shared stack (db/cache/ports) → **build & test runtime stays SEQUENTIAL** (never run two builds at once). Branches isolate **code/commits only**, not runtime.

---

## 6. Workplan box semantics (G1 resolution)

G1 is a **resolution** gate, not a tick-everything gate. When the user replies GO (`ok` / `build` / edits + proceed), resolve **each** box in `🧩 Decisions` / `🎯 Scope` / `🌿 Branch isolation`:

| Box state | Meaning | Action |
|-----------|---------|--------|
| `[x]` | Approved | Build it. |
| `[ ]` + `> change to …` note | "Do it differently" | **Apply the change and build.** Re-plan (revise design/workplan, re-present G1) **only if** the change is structural — a large schema/contract/where-logic-lives shift. |
| `[ ]`, **no note** | Unresolved | **Do NOT build and do NOT silently drop.** Surface every such box in one compact list (each with its recommended/default option) and **ask** the user to decide per item: drop / change / keep-and-approve. Build starts only once none remain blank-unresolved. |

- The user's GO message may itself resolve the blanks (e.g. "build, drop everything I didn't tick") → honor it and skip the ask. The ask only fires for blanks the GO didn't address.
- A blank `🌿 Branch isolation` is part of the same ask, with "work directly on the current branch" shown as the default suggestion (it stays the documented default — confirmed, not auto-applied). *(Exception: in a §10 auto-pass the planner pre-ticks this default in the workplan and discloses it in the ⚡ form — auto-pass never leaves the box blank.)*
- `🧩 Tasks` boxes are **never** part of this — they stay empty at G1 and are flipped during build.
- The gate still requires an explicit GO **and** every decision resolved. The only change vs a hard AND-gate is ergonomic: blanks trigger a focused confirmation instead of a silent deadlock. *(Exception: the §10 G1 auto-pass substitutes the announce-and-proceed ⚡ form for the explicit GO — legal only because its criteria guarantee zero unresolved boxes by construction; any user objection reopens G1 as this normal gate.)*

---

## 7. Runtime & stack operations (REQUIRED — applies whenever a task needs the local stack)

This is the **generic principle**; the project's concrete lifecycle/exec commands live in `.agents/aidlc/rules/stack-runtime.md`. The runtime is **idempotent & non-destructive**: never rebuild or tear down a running techstack to "reset" it. Before running any migration/test/build command against the stack:

1. **Check first (read-only):** see which services are already up (e.g. `docker compose ps`). **Never** start with a lifecycle command.
2. **Already up → use it as-is.** Run migrations/tests against the running service using the project's exec commands (`.agents/aidlc/rules/stack-runtime.md`).
3. **Not up & you need it started →** use the project's canonical lifecycle wrapper (`.agents/aidlc/rules/stack-runtime.md`). **Do NOT** run raw `docker compose up` to bring up the stack.
4. **Do NOT** tear down / `restart` / recreate the whole techstack. The stack shares db/cache/ports (see §5) — a restart destroys data and breaks other tasks/devs. Tear-down/restart only when the **user explicitly asks**.
5. **Submodules with their own compose** → use that submodule's documented commands; do not touch the root stack.

If the stack is down and the task only needs verification, you may state the residual risk and skip rather than bringing the whole stack up — surface the choice, don't silently restart.

---

## 8. Board format & update conventions (`BOARD.md` / `ARCHIVE.md`)

The board holds **in-flight tasks only** — it is injected into context every turn, so its size is a per-turn cost. There is **no** `Active`/`Updated` header: multiple sessions may work in parallel, each on its own row; a session identifies its task by the row's `status` + conversation context.

### Column enums (spell exactly — do not add values)
- **phase**: `clarify` → `plan` → `build` → `wrap` → `done`
- **gate**: `none` · `G0_confirm` (after clarify) · `G1_review` (after plan) · `G2_codereview` (after build)
- **status**: `active` (being worked in a session right now) · `blocked_on_user` (waiting at a gate) · `paused` (deliberately parked) · `done` (only ever written in `ARCHIVE.md`)
- **id**: `YYYY-MMDD-<slug>` — e.g. `2026-0625-add-streak`
- **branch**: `—` (working directly on the current branch) · or `aidlc/<task-id>` if branch isolation is opted-in at G1 (see §5)
- **submodules**: comma-separated list (e.g. `<sub-a>, <sub-b>`)
- **doc**: the task's main artifact at its **current** location — `.agents/tasks/<status>/<DD-MM-YYYY>-<slug>.md`; whichever phase moves the file pair (build: `open→in-progress` · wrap: `in-progress→done`) updates this column in the same step

### Update conventions
1. **Create task** (clarify Step 6): seed `BOARD.md` from `.agents/aidlc/templates/board.md` verbatim if missing → remove the `_No tasks in flight._` line if present → add one row (`branch` starts as `—`; set to `aidlc/<id>` at build if opted-in).
2. **Change state**: edit only that task's row (`phase`/`gate`/`status`). Working on it → `status: active`; stopping at a gate → `status: blocked_on_user`; parking it → `status: paused`. Never touch other tasks' rows — parallel sessions may own them.
3. **Complete** (wrap Step 4): **archive, don't keep** — move the row (as `phase=done, gate=none, status=done`) to `.agents/state/ARCHIVE.md` and move the task's doc + `.workplan.md` files to `.agents/tasks/done/` (update the archived row's `doc` path). If the board's table becomes empty, restore the `_No tasks in flight._` line. `ARCHIVE.md` is not injected — it costs nothing per turn.
4. Detailed build progress lives in the workplan (`.agents/tasks/<status>/<…>.workplan.md`), never duplicated on the board.

---

## 9. Self-correction loop (build) — bounded, never open-ended

Generate → verify → fix is a **bounded loop** with explicit halting conditions (AI-DLC principle: every self-correcting loop must have one; when it can't converge, it escalates to a human instead of iterating forever).

- **Executable verification (test/lint):** on failure, diagnose and fix, then re-run the **same** narrowest command — at most **3 fix-and-rerun cycles per submodule**.
- **Code review:** at most **2 review passes total** — run the review, fix the correctness findings, re-run once. Findings still open after pass 2 → escalate.
- **Scope guard:** fixes inside the loop stay within the task's approved scope. If a correct fix requires a **structural** change (schema / cross-service contract / where-logic-lives) → escalate **immediately**; do not spend remaining cycles on workarounds.
- **Escalate, don't loop:** when a bound is hit, STOP at the 🟣 G2 form with a `⛔ Diagnosis` block: what failed, what each cycle tried, the best current hypothesis, and the options for the user. Never mark the task done past a failed bound, never silently keep iterating.

---

## 10. Adaptive gates — G1 auto-pass & abbreviated pipeline

Gates start human-gated and open up **only** within the narrow, checkable criteria below (safe-increment principle: widen autonomy as verification matures, never by default). **G2 is ALWAYS a human gate** — code review is LLM-judged, and a stage verified only by LLM-judged post-conditions never self-halts. **Small do-er models never use this section** (per `orchestrator.md` Core Working Rules): no G1 auto-pass, no abbreviated pipeline — every gate is a normal human stop.

### G1 auto-pass (announce-and-proceed)
After a normal G0 confirmation, if the finished workplan satisfies **ALL** of:
1. **0 boxes** in `🧩 Decisions` (no real design decision the user could disagree with),
2. **≤ 1** touched submodule,
3. **no** schema / cross-service contract / migration change,
4. `🌿 Branch isolation` pre-resolved by the planner to the default (`Work directly`, ticked in the workplan — never left blank; §6),

then do **not** stop at G1: present the **⚡ auto-pass variant of the 🔵 G1 form (§4)** and continue straight into build **in the same turn**. The workplan is still written in full (audit trail). The user can veto at any time — an objection reopens G1 as a normal gate. Any criterion unmet → normal human G1.

**Board state during auto-pass:** the row is set to `phase=plan, gate=G1_review, status=active` — the one legal gate-row-with-`active` combination, meaning "G1 auto-passed, build running in this session". Build's G2 stop then sets `blocked_on_user` as usual; if the session aborts mid-build, the row stays `active` and the next session RESUMEs it.

### Abbreviated pipeline (combined G0+G1 stop)
For a small task — `type: bug` with a clear reproduction, or a trivial single-submodule change — clarify and plan MAY run back-to-back in one turn with **one combined stop**:
- Produce the intent brief AND the design + workplan, then present **one combined 🟢🔵 G0+G1 form (§4)**.
- Board: the row is written once, already at `phase=plan, gate=G1_review, status=blocked_on_user` (the combined gate covers G0 — the intent brief is part of what the single stop reviews).
- **All artifacts are still produced** — only the number of stops changes. If clarify surfaces a real open question with no safe default → fall back to a normal G0 stop.
- The combined stop **never auto-passes** — the user has not yet confirmed intent, so it always waits for an affirmative reply; that reply resolves both gates at once (then §6 semantics apply to the workplan boxes).
