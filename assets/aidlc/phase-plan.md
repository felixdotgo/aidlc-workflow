# AI-DLC · Plan (G1)

Precondition: canonical state contains passing G0 approval evidence.

1. Retrieve only matched specs and impacted symbols. Parallelize bounded discovery when available; return summaries and exact spec anchors, not file dumps.
2. Read `templates/model-contract.md` and apply its COSTARS plan emphasis. Use CRITICS only for elevated risk, ambiguity, or model disagreement.
3. Fill the design template with the solution per affected area, exact sources for quantified rules, contracts, risks, and reuse candidates.
4. Add every real judgement call with `node .agents/aidlc/scripts/state.mjs decision set <task-id> <decision-id> --status unresolved --label <label> --resolution <proposed-default>`. Code/spec conflicts and ambiguous enumerations are always decisions.
5. Add implementation items with `node .agents/aidlc/scripts/state.mjs task item <task-id> <item-id> --status todo --label <label>` and configure narrow verification commands; render the workplan review artifact with `node .agents/aidlc/scripts/render.mjs <task-id>`.
6. Unresolved decisions block the G1 gate structurally. Present them to the user and apply each answer with `decision set <task-id> <decision-id> --status approved|changed|dropped --resolution <user-resolution>`. Do not treat a decision answer as gate approval.
7. When every decision is resolved, run `node .agents/aidlc/scripts/gate-check.mjs <task-id> --gate G1_review` and fix every structural error. Only after it passes, set the gate wait with `node .agents/aidlc/scripts/state.mjs task status <task-id> --status blocked_on_user`, run `node .agents/aidlc/scripts/gate-view.mjs <task-id>`, relay it verbatim, and stop. G1 always requires explicit human approval.

## ONLY in a later turn, after the user explicitly approves G1

Explicit approval is a user message that says yes to this gate (for example "approve", "ok", "duyệt"). Resolving decisions is NOT approval — never run gate approve just because no decision remains unresolved. Then — and only then — run `node .agents/aidlc/scripts/state.mjs gate approve <task-id> --gate G1_review --source <the-user-approval-message>`, parse the returned `nextAction`, and execute its `run_phase` command before emitting any final response. Continue into `build` until G2 or a real blocker; never invent approval. If the user instead requests plan changes, revise the design/workplan, or cancel the wait explicitly with `task status <task-id> --status active --mode audited --reason <what-changed> --source <the-user-message>`.

Post-condition: the plan names concrete affected areas/paths, traces every relied-upon value to a source, exposes conflicts, and needs no implementation judgement beyond mechanical details.

Before any final response, execute `task-next.mjs <task-id> --require-stop`; a continuation-required result prohibits a final response.
