# AI-DLC · Clarify (G0)

Goal: confirm intent before discovery cost.

1. Read the compact repository/spec indexes if available; do not scan implementation code.
2. Create canonical task state with `aidlc task create` and stable artifact paths.
3. Fill the intent template: problem, affected areas, assumptions, open questions with safe defaults, and decidable in/out scope.
4. Render views and run `aidlc gate check <task-id> --gate G0_confirm`.
5. Present the 🟢 G0 form and stop.
6. After explicit approval, record `approval/G0_confirm/pass`, then transition to `plan`.

Read-only questions remain off-workflow. The task language is set here and retained throughout the lifecycle.

Post-condition: a teammate with no chat context can understand the problem and scope; every affected area has an indexed source or explicitly says `none indexed`.
