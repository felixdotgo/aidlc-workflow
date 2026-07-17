# AI-DLC Orchestrator & common rules — 1799-dojo

Operating rules for **any AI agent** in this monorepo, regardless of tool (Claude Code, Codex CLI, Cursor, Gemini CLI, …). The **AI-DLC Orchestrator** is the default workflow; the rest are shared principles it (and ad-hoc work) follow. This file is the canonical source — tool entrypoints (`CLAUDE.md`, `AGENTS.md`) only point here.

**Layout:** this dir (`.agents/aidlc/`) = tracked workflow **definition** (this file, `conventions.md`, `phase-*.md`, `templates/`, `rules/`). `.agents/state/` = local gitignored **state** (`BOARD.md`, `ARCHIVE.md`, `repo-map.md`, `specs-index.md`). `.agents/tasks|lessons` + `.agents/gotchas.md` = local artifacts.

## Language

Conversation & output: English/Vietnamese (unless the user asks otherwise).

---

## AI-DLC Orchestrator (auto)

This repo runs an **autonomous AI-DLC workflow** driven by the **AI-DLC BOARD** (`.agents/state/BOARD.md`). If your tool injects the BOARD automatically (Claude Code does, via hook), use the injected copy; **otherwise read that file at the start of every turn**. Drive the workflow yourself — **never tell the user to run a phase manually**.

On EVERY request, before acting:

1. **Read the BOARD** and classify the request:
   - **NEW** — matches no task → start one. · **RESUME** — continues the task this session is working (its row + conversation context; e.g. a gate answer) → advance. · **SWITCH** — names/implies another task → resume that one (set its row `status: active`). · **OFF-WORKFLOW** — trivial/read-only/a question → answer directly, no task.
2. **Route to the current phase and execute its playbook** — `phase-clarify.md` (G0) → `phase-plan.md` (G1) → `phase-build.md` (G2) → `phase-wrap.md`, all in this dir. (Claude Code: the `aidlc-*` skills auto-trigger and point to these same files; other tools: open the file and follow it.) Run `phase-index.md` first if `.agents/state/repo-map.md` is missing or specs/submodules changed.
   - **Adaptive (small tasks):** combined 🟢🔵 G0+G1 stop, or G1 auto-pass, per `conventions.md §10`. **G2 is always a human gate.**
3. **After each phase, update the task's row in `.agents/state/BOARD.md`** (phase/gate/status), per `conventions.md §8`. The board is the single source of truth and holds **in-flight tasks only** — done tasks are archived at wrap (`.agents/state/ARCHIVE.md` + `.agents/tasks/done/`), never left on the board.
4. **Honor the 3 gates — STOP and set `status: blocked_on_user`:** G0 = user confirms problem+scope · G1 = user resolves the workplan decisions + gives GO (`[x]` approve · `> change` adjust · blank → AI confirms before build; see `conventions.md §6`) · G2 = user reviews code (after a code review ran). Advance only on an affirmative/edited reply — the sole exception is the G1 auto-pass of `conventions.md §10` (announce-and-proceed under its strict criteria); G0 and G2 never advance without the user.
5. **Multi-task is sequential (per session).** Track many, execute one at a time. If a NEW request arrives while the current task is mid-phase (not at a gate), ask before pausing it (`status: paused`) to switch — never run two builds at once. Optional **branch isolation** (per-submodule `aidlc/<task-id>`, opted-in at G1) lets paused tasks keep clean separate commits/PRs; switching = commit/stash WIP then `git checkout` the other task's branches. Runtime stays sequential (shared docker). See `conventions.md §5`.

Phases reuse **Core Working Rules**, **Gates & Artifacts**, and **Tool Priority** below. **Artifacts:** every task lives flat in `.agents/tasks/<status>/` (`open`/`in-progress`/`done`) as `<DD-MM-YYYY>-<slug>.md` + sibling `<…>.workplan.md` — canonical layout rule: `conventions.md §2`; lessons → `.agents/lessons/`, board/index state → `.agents/state/`. **Project stack/runtime conventions** (read on demand by build, kept OUT of the generic phase docs) → `rules/` in this dir (`<stack>-conventions.md`, `stack-runtime.md`).

---

## Core Working Rules

1. Classify the request **read-only vs mutating**. For read-only (review, explain, assess), do not create/edit/delete files unless explicitly authorized.
2. **Inspect before acting** — relevant files, configs, schemas, specs (codegraph-first). Don't change files you haven't read.
3. Make the **smallest correct change** that fits existing project style.
4. Run the **narrowest meaningful** test/lint/build after changes. If you can't, say why and state the residual risk. **Stack/runtime lifecycle** (up/down/restart) goes through `./dojo` (e.g. `./dojo docker:up`); check `docker compose ps` before starting anything and never restart/tear down the running techstack to "reset" it — see `conventions.md §7`.
5. **Never mark done without proof.** Diff behavior vs `main` when relevant. Ask: "would a staff engineer approve this?"
6. For non-trivial work, prefer the **elegant** solution over a hacky one; don't over-engineer trivial fixes.
7. **Ambiguous or risky → ask.** Off-track → stop and re-plan. Use Plan mode when available; otherwise inspect, then write a brief concrete plan before substantial action.

- **Small do-er models** (haiku, gpt-5-mini, deepseek-r1): same rules, but inspect only directly-relevant files and skip heavyweight analysis (5-Whys / 6-Hats / LDJ) unless clearly useful. **Gates never adapt for small models** — no `conventions.md §10` G1 auto-pass, no abbreviated pipeline; every gate is a normal human stop. Always run the executable gate-check (project rule `rules/gate-check.md`) before presenting a gate — the 17-07-2026 eval showed small models over-report checklist compliance.
- **Conflicts:** follow the user's latest explicit request first, then the most specific local instruction. Missing tool/MCP → use the closest fallback and say so.

---

## Gates & Artifacts

- **Review gate** — before behavior-changing work with real design decisions the user could disagree with, write a checklist to `.agents/tasks/open/<DD>-<MM>-<YYYY>-<slug>.workplan.md` (for ad-hoc non-AIDLC work a standalone `.workplan.md` with no sibling doc/board row is fine) and wait until every box is **resolved** (`[x]` approve · a `> change` note · or an explicit drop), confirming any still-blank boxes before proceeding. Skip for read-only, single obvious fixes, or a user-specified shape. Never revert the user's direct edits to a checklist.
- **Canonical templates + self-check** — every AI-DLC artifact is copied from `templates/*.md` in this dir (source of truth: frontmatter + emoji headings), never re-authored from memory. Before STOPPING at any gate, run the **gate self-check** (`conventions.md §3` — executable half via the command in `rules/gate-check.md`, applies to ALL models) and use the **emoji STOP form** (`conventions.md §4`).
- **Lessons** — after a durable, likely-to-recur correction, record `.agents/lessons/<DD>-<MM>-<YYYY>-<slug>.md` (mistake → prevention rule → example); promote repo-wide ones to `.agents/gotchas.md`. Not for one-offs or conversational nits.
- **Bug reports** — only for ambiguous / production-impacting / recurring / out-of-scope bugs. A bug is just a task: `.agents/tasks/open/<DD>-<MM>-<YYYY>-<slug>.md` with frontmatter `type: bug` (slug may end in `-bug`; body: summary, impact, repro, expected/actual, evidence, root cause, fix) **plus a BOARD row** (`phase=clarify`, `status=paused` if not being worked now) so it stays visible to future sessions; confirm before fixing. Small in-scope bugs: fix inline and note it.
- **Subagents** — offload bounded research/parallel analysis; give each one ownership area + expected output; keep the critical implementation path in the main agent. (No subagent support in your tool → do the research inline, most-relevant files first.)

---

## Tool Priority

Narrowest tool first; prefer symbol-scoped context over whole-file reads. **Codegraph → Serena → shell/rg/raw.** These are MCP servers — if your tool lacks them, use the closest fallback (per the Conflicts rule) and say so.

| Intent | Tool |
|--------|------|
| Architecture · "how/where is X" · unfamiliar area | `codegraph_explore` (first; often the only call) |
| Symbol location / unknown name | `codegraph_search` |
| Callers · callees · pre-refactor blast radius | `codegraph_callers` / `codegraph_callees` / `codegraph_impact` |
| Whole-symbol edit/refactor (area known) | Serena `find_symbol` + `replace_symbol_body` / `rename_symbol` |
| Caller-safe change to a shared/public symbol | Serena `find_referencing_symbols` first |
| Few-line edit · non-code · configs · generated | `apply_patch` + raw Read; `rg` for text/JSON/YAML/logs |

- Codegraph ships its own usage guide (MCP) — don't re-derive, and don't reopen files it already showed.
- Serena `find_symbol` takes `name_path_pattern` (not `name_path`).
- Prefix shell with `rtk` when available to cut output tokens.

---

## Gotchas

Durable repo-wide gotchas live in `.agents/gotchas.md` (gitignored, local). Review at session start; append new ones there, not here, so this file stays stable.
