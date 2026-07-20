# AI-DLC · Plan (G1)

Precondition: canonical state contains passing G0 approval evidence.

1. Retrieve only matched specs and impacted symbols. Parallelize bounded discovery when available; return summaries and exact spec anchors, not file dumps.
2. Fill the design template with the solution per affected area, exact sources for quantified rules, contracts, risks, and reuse candidates.
3. Add every real judgement call with `node .agents/aidlc/scripts/state.mjs decision set ... --status unresolved`. Code/spec conflicts and ambiguous enumerations are always decisions.
4. Add implementation items with `node .agents/aidlc/scripts/state.mjs task item <task-id> <item-id> --status todo --label <label>` and configure narrow verification commands; render the workplan review artifact.
5. Set task status to `blocked_on_user`, run `node .agents/aidlc/scripts/gate-check.mjs <task-id> --gate G1_review`, present the 🔵 G1 form, and stop unless the strict low-risk auto-pass policy applies.
6. Apply the user's resolutions through `node .agents/aidlc/scripts/state.mjs decision set`. Record `approval/G1_review/pass`; transition to `build` only when no decision remains unresolved.

Post-condition: the plan names concrete affected areas/paths, traces every relied-upon value to a source, exposes conflicts, and needs no implementation judgement beyond mechanical details.
