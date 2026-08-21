# AI-DLC · Build (G2)

Precondition: G1 approval evidence exists and every decision is resolved.

1. Read the build phase packet; re-open cited spec lines immediately before implementing dependent behavior.
2. Read `templates/model-contract.md` and apply its COSTARS build emphasis to the implementation context.
3. Loop over canonical task items, one item and one affected area at a time. Prefer an `in_progress` item, otherwise select the next `todo` item; inspect callers before shared/public changes and preserve unrelated work. After implementing and narrowly verifying an item, record progress and mark it `done` or explicitly `deferred` with `node .agents/aidlc/scripts/state.mjs task item <task-id> <item-id> --status done|deferred`, then immediately execute its returned `nextAction`. An item or area completion may be reported only as commentary/progress, never as a final response. Continue the loop while `nextAction.classification` is `run_phase`; when no actionable item remains, continue directly into aggregate verification, adversarial review, and G2 preparation.
4. A new structural or spec conflict requires `node .agents/aidlc/scripts/state.mjs task handoff <task-id> --kind structural_change --reason <reason> --source <source>`; after explicit user direction, `task reopen <task-id> --to plan --reason <reason> --source <user-message>` invalidates the prior G1 approval. Do not spend repair cycles on an unapproved workaround.
5. Run the narrowest configured test/lint per area. Record every result with `node .agents/aidlc/scripts/state.mjs evidence add <task-id> --kind test|lint --area <area> --result pass|fail|skip --source <command-or-tool> --detail <summary>`; a skip must state residual risk in `--detail`. The repair bound is machine-enforced: after three failed verify records in one area (current build), `nextAction` turns `blocked` and G2 is structurally closed — record the failed diagnostic and follow the returned handoff action instead of retrying.
6. Perform an adversarial review of only the task diff against decisions and spec anchors, using every CRITICS section from `templates/model-contract.md`. Record findings and the outcome with `evidence add <task-id> --kind review --result pass|fail --source <reviewer> --detail <findings>`. The review bound is machine-enforced after two failed review records; the returned handoff action uses `--kind review_exhausted`.
7. Handoff kinds are exactly: `repair_exhausted`, `review_exhausted`, `g2_failed`, `release_failed`, `structural_change`, `other`.
8. Mark items and record per-area verify evidence, render the workplan, and run `node .agents/aidlc/scripts/gate-check.mjs <task-id> --gate G2_codereview`. Only after the check passes, set task status to `blocked_on_user` with `node .agents/aidlc/scripts/state.mjs task status <task-id> --status blocked_on_user`.
9. Run `node .agents/aidlc/scripts/gate-view.mjs <task-id>`, relay it verbatim, and stop for human review. Presenting the gate ends this turn.

## ONLY in a later turn, after the user explicitly approves G2

Explicit approval is a user message that says yes to this gate. Then — and only then — run `node .agents/aidlc/scripts/state.mjs gate approve <task-id> --gate G2_codereview --source <the-user-approval-message>`, parse the returned `nextAction`, and execute its `run_phase` command before emitting any final response. Continue through `wrap` to `complete` unless delivery authority or a real blocker is missing; never invent approval. If the user instead requests fixes, record the rejection as review evidence (`--kind review --result fail`), cancel the wait with `task status <task-id> --status active --mode audited --reason <requested-changes> --source <the-user-message>`, and continue the build loop.

Before any final response, execute `task-next.mjs <task-id> --require-stop`; a continuation-required result prohibits a final response.

Post-condition: every task is done or explicitly deferred, verification/review evidence is honest, the diff matches approved decisions, and residual risks are visible.
