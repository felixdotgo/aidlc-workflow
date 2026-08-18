# AI-DLC · Plan (G1)

Precondition: canonical state contains passing G0 approval evidence.

1. Retrieve only matched specs and impacted symbols. Parallelize bounded discovery when available; return summaries and exact spec anchors, not file dumps.
2. Read `templates/model-contract.md` and apply its COSTARS plan emphasis. Use CRITICS only for elevated risk, ambiguity, or model disagreement.
3. Fill the design template with the solution per affected area, exact sources for quantified rules, contracts, risks, and reuse candidates.
4. Add every real judgement call with `node .agents/aidlc/scripts/state.mjs decision set ... --status unresolved`. Code/spec conflicts and ambiguous enumerations are always decisions.
5. Add implementation items with `node .agents/aidlc/scripts/state.mjs task item <task-id> <item-id> --status todo --label <label>` and configure narrow verification commands; render the workplan review artifact.
6. Set task status to `blocked_on_user`, run `node .agents/aidlc/scripts/gate-check.mjs <task-id> --gate G1_review`, then run `node .agents/aidlc/scripts/gate-view.mjs <task-id>` and relay it verbatim. Stop unless `.agents/config.json` explicitly enables `gates.G1.autoPass.enabled` and every fixed low-risk criterion passes.
7. Apply the user's resolutions through `node .agents/aidlc/scripts/state.mjs decision set`. When no decision remains unresolved, run atomic `state.mjs gate approve <task-id> --gate G1_review --source <explicit-user-approval>`, parse its returned `nextAction`, and execute the `run_phase` action before emitting any final response. Continue into `build` until G2 or a real blocker; never invent approval.

Post-condition: the plan names concrete affected areas/paths, traces every relied-upon value to a source, exposes conflicts, and needs no implementation judgement beyond mechanical details.

Before any final response, execute `task-next.mjs <task-id> --require-stop`; a continuation-required result prohibits a final response.
