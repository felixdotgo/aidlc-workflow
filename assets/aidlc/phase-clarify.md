# AI-DLC · Clarify (G0)

Goal: confirm intent before discovery cost.

1. Read the compact repository/spec indexes if available; do not scan implementation code.
2. Read `templates/model-contract.md` and apply its COSTARS clarify emphasis to the intent brief. Use CRITICS only for elevated risk, ambiguity, or model disagreement.
3. Create canonical task state with `node .agents/aidlc/scripts/state.mjs task create` and stable artifact paths.
4. Fill the intent template: problem, affected areas, assumptions, open questions with safe defaults, and decidable in/out scope.
5. Set task status to `blocked_on_user`, render only this task, and run `node .agents/aidlc/scripts/gate-check.mjs <task-id> --gate G0_confirm`.
6. Run `node .agents/aidlc/scripts/gate-view.mjs <task-id>`, relay the output verbatim, and stop.
7. After explicit approval, run `state.mjs gate approve <task-id> --gate G0_confirm --source <explicit-user-approval>`, parse its returned `nextAction`, and execute the `run_phase` action before emitting any final response. Continue into `plan` until G1 or a real blocker; never invent approval.

Read-only questions remain off-workflow. The task language is set here and retained throughout the lifecycle.

Post-condition: a teammate with no chat context can understand the problem and scope; every affected area has an indexed source or explicitly says `none indexed`.

Before any final response, execute `task-next.mjs <task-id> --require-stop`; a continuation-required result prohibits a final response.
