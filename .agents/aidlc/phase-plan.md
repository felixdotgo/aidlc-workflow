
# AI-DLC · Plan (Gate G1)

Precondition: the task's G0 intent brief is **confirmed**. Read its doc (the BOARD row's `doc` path — `.agents/tasks/open/<DD-MM-YYYY>-<slug>.md`) first — note its `language` frontmatter and write **all prose** (design + workplan) in that language; do NOT re-detect from the (often terse) G1 prompt. Scaffold + technical tokens stay English.

## Step 1 — Discovery fan-out (parallel, summaries only)

Launch subagents **in one message** (parallel) so context is offloaded and only summaries return (no subagent support → do each agent's job inline, sequentially, with the same scopes). Choose agents by impact:

- **Spec agent** (`Explore`): read ONLY the specs matched in `.agents/state/specs-index.md` for this task → return requirements, acceptance criteria, business rules, constraints, **plus a Spec anchor**: every enumeration, value-set, count, and quantified business rule relevant to the task, quoted **verbatim** with its source (`file:line` or rule ID) — "summaries only" does NOT apply to the anchor; the quote is the payload, never a compressed list or a bare count. If no spec is indexed for the task, the anchor is `none indexed` (state it explicitly; never reconstruct one from memory or from existing code). Do not read unmatched specs.
- **Code agent — one per affected submodule** (`Explore`, codegraph-first): use `mcp__codegraph__codegraph_explore` to map impacted files/symbols, existing patterns and **reuse candidates**, integration points (routes, providers, services), and risks. Return a tight file/symbol list, not full dumps.
- **Backlog agent** (optional): if the request references a Backlog issue/URL, fetch it (`mcp__backlog__get_issue`, nested `get_document`; no Backlog MCP → fetch the issue URL directly or ask the user to paste its content) → merge requirements.

Keep each agent scoped to one ownership area. Prefer codegraph over raw reads (token lever).

## Step 2 — Design (append to the task doc)

Append the canonical template `templates/design.md` (in `templates/` of this dir) below the `<!-- DESIGN -->` marker and fill it; bump the doc frontmatter to `phase: plan` · `gate: G1_review`. Do not re-author the structure from memory. The **task breakdown does NOT live here** — it goes in the workplan (Step 3).

Fill the design's `### 📌 Spec traceability` section from the Spec anchor — one row per enumeration/count/value-set the design relies on, per the template's inline guidance. If the design's values or count differ from the quoted spec, fix the design or raise a Decision (Step 3); never adjust the quote to fit the design. This section lives **only** in the design — the intent brief and workplan never get one.

Reuse the project's existing per-stack conventions (`rules/<stack>-conventions.md` in this dir) and any per-submodule skills/rules (each submodule's own `.claude/`). Do not invent new layers.

## Step 3 — Workplan (Gate G1 + build tracker)

Create the workplan **next to the task doc** (same dir as the BOARD row's `doc` path — `open/` on a first plan; a re-plan of a moved task writes beside the doc's current location, never a second copy in `open/`), named `<same basename>.workplan.md`, by copying `templates/workplan.md` (in `templates/` of this dir) verbatim and filling it — it is the **source of truth** for the workplan format (frontmatter + emoji headings + the mandatory `🌿 Branch isolation` section). Copy the doc's `language` value into the workplan frontmatter and write its prose in that language. This single artifact serves **both** gates: its `🧩 Decisions` / `🎯 Scope` / `🌿 Branch isolation` boxes are the G1 review surface; its `🧩 Tasks` / `🔧 Verify` sections are the G2 build tracker.

- **Decisions:** one checkbox for every real design decision the user could disagree with (metric semantics, schema shape, where logic lives, prompt/policy). Mechanical items don't need boxes. **Two cases are ALWAYS Decision boxes, never "mechanical":** (a) existing code contradicts the Spec anchor (different values/count/behavior) → quote both sides in the box, with *follow the spec* as the recommended default — never silently adopt the code as canonical; (b) a spec enumeration/count can be read in more than one way → quote the ambiguous line and list the candidate readings for the user to pick.
- **Branch isolation:** **always** present (it's the opt-in point before build).
- **Tasks:** author the per-submodule breakdown here, all left `[ ]` — they are execution items the reviewer does NOT tick at G1; the build phase flips them.

## Step 4 — Gate self-check

Run the checklist in `conventions.md §3`. Fix any failure before stopping.

## Step 5 — Board + STOP (or auto-pass)

Exactly ONE of the three paths below applies:

- **⚡ G1 auto-pass (criteria + board state: `conventions.md §10`):** if the finished workplan meets ALL §10 auto-pass criteria (incl. pre-ticking `🌿` to the default) → do NOT stop: present the **⚡ variant of the 🔵 G1 form (§4)** and continue straight into the build phase in the same turn. Skip the two bullets below.
- **🟢🔵 Combined stop (abbreviated pipeline, §10):** if this plan run was combined with clarify → present the **combined 🟢🔵 G0+G1 form (§4)**, board row per §10, and **STOP** (the combined stop never auto-passes).
- **Normal stop (otherwise):** edit `BOARD.md`: set this task's row `phase=plan`, `gate=G1_review`, `status=blocked_on_user`. Leave `branch=—` (filled at build if the user opts into isolation). Present the **🔵 Gate G1 form** (`conventions.md §4`): design summary + workplan file path + the `👉` cue. **STOP.** The Orchestrator advances to the build phase (`phase-build.md`) on the user's GO, resolving every `🧩 Decisions` / `🎯 Scope` / `🌿 Branch isolation` box per `conventions.md §6` — `[x]` builds, `> change to …` notes are applied (re-plan only if structural), and any blank-no-note box is **surfaced and confirmed with the user before build** (never silently built or dropped). The `🧩 Tasks` boxes stay empty — they are filled during build. If the user edits the workplan directly, treat their edits as decisions — never revert them.

## Post-conditions (Compartment 2 — self-check before the G1 stop; enforced via `conventions.md §3`)

**Executable:**
- The workplan file `<same basename>.workplan.md` exists next to the task doc (same dir as the BOARD row's `doc` path); the task doc's frontmatter is bumped to `phase: plan · gate: G1_review`; both share the same `task_id`.

**LLM-judged:**
- Spec fidelity: covered by §3's *Content fidelity* + *No silent spec override* boxes (not restated here).
- `🧩 Decisions` holds only real judgement calls (mechanical items have no box); each `🧩 Tasks` item names its submodule and target path; `🔧 Verify` lists the narrowest command per touched submodule.
- The design reuses existing patterns/conventions (`rules/` in this dir, submodule skills) instead of inventing new layers.
