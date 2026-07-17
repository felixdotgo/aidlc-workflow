
# AI-DLC · Clarify (Gate G0)

Goal: a shared, confirmed understanding **before** spending tokens on discovery. Stay cheap — read the index, not the code.

## Steps

1. **Read only the index:** `.agents/state/specs-index.md` and `.agents/state/repo-map.md`. If `.agents/state/repo-map.md` is missing, run `phase-index.md` first.
2. **Classify intent:** `feature` | `bug` | `refactor` | `infra`.
3. **Map impact from the index:** match the request's keywords against `.agents/state/specs-index.md` rows and `.agents/state/repo-map.md` submodules → candidate submodule(s) + spec area(s). You MAY read the first ~30 lines of at most 1–2 matched specs to disambiguate — never full files here.
   - **Screen-code / app-name shortcut:** if the request contains a screen-code token matching the project's prefix pattern `[A-Z]{2,3}_\d{1,3}` or a feature-area name/alias listed in the **Feature areas / screen-code map** of `.agents/state/repo-map.md`, resolve it directly to that area's backend submodule + spec repo, then locate the specific screen spec under that spec repo. This map is the canonical anchor for scope — prefer it over fuzzy keyword matching when a screen code/app name is present.
4. **Derive ids/paths:**
   - Task id = `YYYY-MMDD-<slug>` (e.g. `2026-0625-add-streak`).
   - Doc path = `.agents/tasks/open/<DD-MM-YYYY>-<slug>.md` (layout rule: `conventions.md §2`).
5. **Write the intent brief** by copying the canonical template `templates/intent.md` (in `templates/` of this dir) verbatim and filling it. Do **not** re-author the structure from memory — the template is the source of truth (frontmatter + emoji headings). Write it to the doc path.
   - **Set `language` here — this is the ONE place it is detected:** `vi` if the user's request is written in Vietnamese, otherwise `en`. Fill **all prose** (Problem, Assumptions, Open questions, Scope, the "why" of Affected areas) in that language; keep scaffold + technical tokens English. Every later phase inherits this value — see the Language rule in `conventions.md`.
6. **Register on the board:** edit `.agents/state/BOARD.md`. **If it does not exist** (BOARD is local, gitignored state — see `conventions.md`), first create it by copying `templates/board.md` **verbatim**; never re-author the scaffold from memory. Then remove the `_No tasks in flight._` line if present and add a row `| `<id>` | <title> | clarify | G0_confirm | blocked_on_user | — | <submodules> | <doc path> |` (the `branch` column = `—`; the isolation choice happens at G1). Board conventions: `conventions.md §8`. *(Abbreviated pipeline (§10): skip this step here — the row is written once by the plan half, already at `phase=plan, gate=G1_review`.)*
7. **Gate self-check** — run the checklist in `conventions.md §3`. Fix any failure before stopping.
8. **STOP at G0.** Present the **🟢 Gate G0 form** (`conventions.md §4`): short summary + open questions with recommended defaults, ending with the `👉` cue. Do **not** start discovery or edits. The Orchestrator advances to the plan phase (`phase-plan.md`) only on an affirmative/edited reply. *(Exception — abbreviated pipeline, `§10`: for a qualifying small task, skip this stop, continue into the plan phase in the same turn, and stop once at the combined 🟢🔵 G0+G1 form; the board row is then written once at `phase=plan` per §10.)*

## Notes
- Keep the brief tight; depth belongs in the plan phase.
- If the request is trivial / read-only / a question, it is OFF-WORKFLOW — answer directly and do not create a task (the Orchestrator decides this before entering this phase).
- **Abbreviated pipeline (small tasks):** qualifying tasks (criteria + mechanics: `conventions.md §10`) run clarify+plan back-to-back with ONE combined 🟢🔵 stop (§4 form); a real open question with no safe default → normal G0 stop.

## Post-conditions (Compartment 2 — self-check before the G0 stop; enforced via `conventions.md §3`)

**Executable:**
- The intent brief exists at the derived doc path, and `BOARD.md` has exactly one row for this `task_id`.

**LLM-judged:**
- The problem restatement would let a teammate with zero chat context pick the task up.
- Every affected submodule maps to a `.agents/state/repo-map.md` row; every spec pointer resolves in `.agents/state/specs-index.md` or is explicitly `none indexed`.
- Every open question ships a safe default; no question re-asks something the user already stated.
- Scope In/Out is decidable — no boundary-less "improve/refactor X".
