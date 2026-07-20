# AI-DLC · Build (G2)

Precondition: G1 approval evidence exists and every decision is resolved.

1. Read the build phase packet; re-open cited spec lines immediately before implementing dependent behavior.
2. Work one canonical task item and one affected area at a time. Inspect callers before shared/public changes and preserve unrelated work.
3. A new structural or spec conflict reopens G1. Do not spend repair cycles on an unapproved workaround.
4. Run the narrowest configured test/lint per area. Record every result as evidence; use at most three repair cycles.
5. Perform an adversarial review of only the task diff against decisions and spec anchors. Record findings and passing review evidence; use at most two review passes.
6. Mark items with `aidlc task item`, record per-area verify evidence with `aidlc evidence add ... --area <area>`, render views, and run `aidlc gate check <task-id> --gate G2_codereview`.
7. Present the 🟣 G2 form and stop for human review.

Post-condition: every task is done or explicitly deferred, verification/review evidence is honest, the diff matches approved decisions, and residual risks are visible.
