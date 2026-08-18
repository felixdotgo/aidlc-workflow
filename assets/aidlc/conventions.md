# AI-DLC v1 Conventions

## Canonical data

Schema v3 is one authoritative store with multiple records: `.agents/data/state/aidlc-state.json` keeps active task state plus a compact archive catalog; immutable terminal records live under `.agents/data/state/archive/` and are verified by digest. `.agents/data/lessons/index.json` is a rebuildable cache, never a source of truth. `.agents/data/memory/agentic-memory.json` is a separate project-owned advisory registry, with explicit promotion/retirement audit data; it is never lifecycle state or a substitute for project rules. Use bounded `task list`, `task find`, and `task show <task-id>` commands; do not persist `BOARD.md` or another editable state projection. Intent, design, and workplan prose remain Markdown review artifacts under a stable task directory keyed by `task_id`.

Never edit review artifacts to change state. Use `node .agents/aidlc/scripts/state.mjs`, then run `node .agents/aidlc/scripts/render.mjs <task-id>` when a refreshed workplan is needed.

## Task lifecycle

```text
clarify/G0_confirm → plan/G1_review → build/G2_codereview → wrap/none → done/none
                                      ↘ paused/handoff → reopened plan, closed, or superseded → fresh successor G0
```

Each transition requires the preceding approval evidence. Build additionally requires every decision to be `approved`, `changed`, or `dropped`. Wrap requires passing test/lint evidence, passing review evidence, and G2 approval.

`blocked_on_user` is reserved for a gate that is structurally ready and waiting for explicit human approval. A real blocker or exhausted repair bound uses `task handoff`, which stores a reason and returns structured `reopen_g1`, `create_successor`, and `close` choices. `closed` and `superseded` are terminal non-success outcomes that preserve the phase where work stopped; only `done` is successful completion. A successor is created as a fresh G0 task, then linked atomically with `task supersede`; it never inherits approvals or evidence.

Lifecycle commands that end or redirect work require an explicit reason and source:

```sh
node .agents/aidlc/scripts/state.mjs task handoff <id> --kind <kind> --reason <reason> --source <source>
node .agents/aidlc/scripts/state.mjs task reopen <id> --to plan --reason <reason> --source <source>
node .agents/aidlc/scripts/state.mjs task close <id> --reason <reason> --source <source>
node .agents/aidlc/scripts/state.mjs task supersede <id> --successor <fresh-id> --reason <reason> --source <source>
```

Decision states:

- `unresolved`: build is blocked.
- `approved`: implement the proposed choice.
- `changed`: implement the recorded resolution.
- `dropped`: explicitly out of scope.

## Evidence

Evidence kinds are `approval`, `spec`, `test`, `lint`, `review`, and `diagnostic`; results are `pass`, `fail`, or `skip`. A skipped verification must state residual risk. Evidence is append-only during a task; corrections add a new record rather than rewriting history.

## Human gate forms

Gate presentation is executable, not model-authored. After a passing gate check, run `node .agents/aidlc/scripts/gate-view.mjs <task-id>` and relay its output verbatim. The default Markdown uses a portable `[!IMPORTANT]` blockquote with explicit task state, artifact links, decision/execution counts, evidence, and exactly one `ACTION REQUIRED` line. Use `--format plain` when the tool does not render Markdown and `--format json` for integrations. Renderer-specific color is enhancement only; approval semantics live in canonical state.

G0 and G2 never auto-pass. G1 may auto-pass only when `.agents/config.json` explicitly enables `gates.G1.autoPass.enabled` and the work is low-risk, single-area, has zero decisions, no schema/contract/migration, and a passing gate check. Gate approval and phase transition are atomic; after a non-terminal transition, continue until the next human gate, real blocker, or completion.

## Context budget

The default phase packet budget is 16,000 characters. Optional rules and diagnostics are omitted first. The next-action contract, full phase contract, approved decisions, safety/spec anchors, task state, and applicable latest evidence are mandatory; if they do not fit, packet generation fails instead of truncating them. Packet output reports characters, estimated tokens, and omitted rule files.

## Repair bounds

- Verification: at most three fix-and-rerun cycles per affected area.
- Review: at most two passes.
- Security, migration, contract, or where-logic-lives changes reopen G1 immediately.
- A bound hit produces a diagnosis and human escalation; it never silently passes.
- After recording the failed diagnostic, a bound hit must create a durable handoff instead of presenting an unready gate.

## Language and scaffold

Technical tokens, paths, commands, enum values, and structural headings remain English. Prose follows the task language. Stable emoji headings are: `📋 Problem`, `🗺️ Affected areas`, `💭 Assumptions`, `❓ Open questions`, `🎯 Scope`, `🚫 Out of scope`, `🧩 Decisions`, `🧩 Tasks`, `📌 Spec traceability`, `🔗 Cross-service contracts`, `⚠️ Risks / edge cases`, `🔧 Verify`, and `📁 Files touched`.
