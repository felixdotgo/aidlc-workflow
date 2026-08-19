# AI-DLC · Build (G2)

Precondition: G1 approval evidence exists and every decision is resolved.

1. Read the build phase packet; re-open cited spec lines immediately before implementing dependent behavior.
2. Read `templates/model-contract.md` and apply its COSTARS build emphasis to the implementation context.
3. Loop over canonical task items, one item and one affected area at a time. Prefer an `in_progress` item, otherwise select the next `todo` item; inspect callers before shared/public changes and preserve unrelated work. After implementing and narrowly verifying an item, record progress and mark it `done` or explicitly `deferred`, then immediately execute its returned `nextAction`. An item or area completion may be reported only as commentary/progress, never as a final response. Continue the loop while `nextAction.classification` is `run_phase`; when no actionable item remains, continue directly into aggregate verification, adversarial review, and G2 preparation.
4. A new structural or spec conflict requires `task handoff --kind structural_change`; after explicit user direction, `task reopen --to plan` invalidates the prior G1 approval. Do not spend repair cycles on an unapproved workaround.
5. Run the narrowest configured test/lint per area. Record every result as evidence; use at most three repair cycles. If the bound is exhausted, record the failed diagnostic, create a durable handoff, present reopen/create-successor/close choices, and stop without presenting G2.
6. Perform an adversarial review of only the task diff against decisions and spec anchors, using every CRITICS section from `templates/model-contract.md`. Record findings and passing review evidence; use at most two review passes. A failed exhausted review creates `task handoff --kind review_exhausted` rather than a gate wait.
7. Mark items and record per-area verify evidence, render the workplan, and run `node .agents/aidlc/scripts/gate-check.mjs <task-id> --gate G2_codereview`. Only after the check passes, set task status to `blocked_on_user` and present G2.
8. Run `node .agents/aidlc/scripts/gate-view.mjs <task-id>`, relay it verbatim, and stop for human review.
9. After explicit G2 approval, run atomic `state.mjs gate approve <task-id> --gate G2_codereview --source <explicit-user-approval>`, parse its returned `nextAction`, and execute `run_phase` before emitting any final response. Continue through `wrap` to `complete` unless delivery authority or a real blocker is missing; never invent approval.

Before any final response, execute `task-next.mjs <task-id> --require-stop`; a continuation-required result prohibits a final response.

Post-condition: every task is done or explicitly deferred, verification/review evidence is honest, the diff matches approved decisions, and residual risks are visible.
