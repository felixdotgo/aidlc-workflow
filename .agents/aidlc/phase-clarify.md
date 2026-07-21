# AI-DLC · Clarify (G0)

Goal: confirm intent before discovery cost.

1. Read the compact repository/spec indexes if available; do not scan implementation code.
2. Read `templates/model-contract.md` and apply its COSTARS clarify emphasis to the intent brief. Use CRITICS only for elevated risk, ambiguity, or model disagreement.
3. Create canonical task state with `node .agents/aidlc/scripts/state.mjs task create` and stable artifact paths.
4. Fill the intent template: problem, affected areas, assumptions, open questions with safe defaults, and decidable in/out scope.
5. Set task status to `blocked_on_user`, render review artifacts, and run `node .agents/aidlc/scripts/gate-check.mjs <task-id> --gate G0_confirm`.
6. Present the 🟢 G0 form and stop.
7. After explicit approval, record `approval/G0_confirm/pass`, then transition to `plan`.

Read-only questions remain off-workflow. The task language is set here and retained throughout the lifecycle.

Post-condition: a teammate with no chat context can understand the problem and scope; every affected area has an indexed source or explicitly says `none indexed`.
