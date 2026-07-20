# AI-DLC v1 Conventions

## Canonical data

`.agents/state/aidlc-state.json` is the only persisted lifecycle state for task phase, gate, status, decisions, execution checklist, and evidence. Human-readable state is emitted on demand with `node .agents/aidlc/scripts/state.mjs task show`; do not persist `BOARD.md` or another state projection. Intent, design, and workplan prose remain Markdown review artifacts under a stable task directory keyed by `task_id`; changing phase never moves them.

Never edit review artifacts to change state. Use `node .agents/aidlc/scripts/state.mjs`, then run `node .agents/aidlc/scripts/render.mjs` when a refreshed workplan is needed.

## Task lifecycle

```text
clarify/G0_confirm → plan/G1_review → build/G2_codereview → wrap/none → done/none
```

Each transition requires the preceding approval evidence. Build additionally requires every decision to be `approved`, `changed`, or `dropped`. Wrap requires passing test/lint evidence, passing review evidence, and G2 approval.

Decision states:

- `unresolved`: build is blocked.
- `approved`: implement the proposed choice.
- `changed`: implement the recorded resolution.
- `dropped`: explicitly out of scope.

## Evidence

Evidence kinds are `approval`, `spec`, `test`, `lint`, `review`, and `diagnostic`; results are `pass`, `fail`, or `skip`. A skipped verification must state residual risk. Evidence is append-only during a task; corrections add a new record rather than rewriting history.

## Human gate forms

Every gate response ends with one `👉` action line.

```markdown
## 🟢 Gate G0 — Confirm intent · `<task-id>`
**📋 Problem:** <summary>
**🎯 Scope In:** <in> · **🚫 Out:** <out>
**❓ Open questions:** <questions with defaults, or none>

👉 Reply `ok` to approve, or state changes.
```

```markdown
## 🔵 Gate G1 — Review plan · `<task-id>`
**🧩 Summary:** <solution>
**✅ Decisions:** <resolved/unresolved count>
**🔧 Verify:** <narrow commands>

👉 Approve the plan or state decision changes.
```

```markdown
## 🟣 Gate G2 — Review code · `<task-id>`
**📁 Changed:** <summary>
**🔧 Test/lint:** <evidence>
**✅ Code-review:** <result>

👉 Approve to wrap, or point out what to fix.
```

G0 and G2 never auto-pass. G1 may auto-pass only for low-risk, single-area work with zero decisions, no schema/contract/migration, a passing gate check, and project policy allowing it.

## Context budget

The default phase packet budget is 16,000 characters. When trimming, optional diagnostics and unmatched rules go first. Never remove approved decisions, safety constraints, spec anchors, task state, or verification requirements. Packet output reports characters, estimated tokens, and omitted rule files.

## Repair bounds

- Verification: at most three fix-and-rerun cycles per affected area.
- Review: at most two passes.
- Security, migration, contract, or where-logic-lives changes reopen G1 immediately.
- A bound hit produces a diagnosis and human escalation; it never silently passes.

## Language and scaffold

Technical tokens, paths, commands, enum values, and structural headings remain English. Prose follows the task language. Stable emoji headings are: `📋 Problem`, `🗺️ Affected areas`, `💭 Assumptions`, `❓ Open questions`, `🎯 Scope`, `🚫 Out of scope`, `🧩 Decisions`, `🧩 Tasks`, `📌 Spec traceability`, `🔗 Cross-service contracts`, `⚠️ Risks / edge cases`, `🔧 Verify`, and `📁 Files touched`.
