# AI-DLC · Wrap

Precondition: the user approved G2 and canonical state contains passing G2 approval evidence.

Wrap is success-only. `closed` and `superseded` tasks are terminal at the phase where they stopped and never enter wrap or imply release success.

1. Commit only when the user requested it. Follow the project's configured delivery policy; kernel does not assume submodules, branches, PR provider, or issue tracker.
2. Review durable corrections. Record each with `state.mjs lesson record`, including provenance; if none exist, run `state.mjs lesson none --reason <reason> --source <source>`. Promote advisory project memory only with explicit user approval via `state.mjs memory promote`; retirement also requires an explicit audited approval. Prefer executable enforcement over prose.
3. Record delivery evidence and residual risk. Rebuild/search lessons and manage advisory memory only through the installed lifecycle script; never hand-edit the derived index or memory registry.
4. Transition the task to `done`; schema v3 writes a digest-validated terminal record and compacts the active catalog. Refresh only this task's review artifact.

Post-condition: reported commits/integrations match reality, the terminal task and lesson disposition are durable, and no local rule was silently admitted.

Before any final response, execute `task-next.mjs <task-id> --require-stop`; a continuation-required result prohibits a final response.
