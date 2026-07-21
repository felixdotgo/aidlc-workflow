# AI-DLC · Build (G2)

Precondition: G1 approval evidence exists and every decision is resolved.

1. Read the build phase packet; re-open cited spec lines immediately before implementing dependent behavior.
2. Read `templates/model-contract.md` and apply its COSTARS build emphasis to the implementation handoff.
3. Work one canonical task item and one affected area at a time. Inspect callers before shared/public changes and preserve unrelated work.
4. A new structural or spec conflict reopens G1. Do not spend repair cycles on an unapproved workaround.
5. Run the narrowest configured test/lint per area. Record every result as evidence; use at most three repair cycles.
6. Perform an adversarial review of only the task diff against decisions and spec anchors, using every CRITICS section from `templates/model-contract.md`. Record findings and passing review evidence; use at most two review passes.
7. Mark items, record per-area verify evidence, and set task status to `blocked_on_user` with `node .agents/aidlc/scripts/state.mjs`; render the workplan review artifact and run `node .agents/aidlc/scripts/gate-check.mjs <task-id> --gate G2_codereview`.
8. Present the 🟣 G2 form and stop for human review.

Post-condition: every task is done or explicitly deferred, verification/review evidence is honest, the diff matches approved decisions, and residual risks are visible.
