# AI-DLC v1 Orchestrator

This file is the compact kernel contract. Project customization lives under `.agents/project/`; discovery indexes live under `.agents/data/index/`; the authoritative lifecycle store uses a compact `.agents/data/state/aidlc-state.json` catalog plus digest-validated terminal records under `.agents/data/state/archive/`; task prose and workplans are review artifacts, not mutable state.

## Turn routing

1. Use `node .agents/aidlc/scripts/state.mjs task list` (or `task find --query <text>`) for bounded routing. Never read or dump the canonical store directly. Use `task show <task-id>` only after selecting one task.
2. Resolve `node .agents/aidlc/scripts/state.mjs task next <task-id>` for an existing task; do not infer the next action from prose alone.
3. Classify the request as `NEW`, `RESUME`, `SWITCH`, or `OFF-WORKFLOW`.
   - A requested feature, bug fix, or project change is `NEW` unless canonical state already contains the matching unfinished task; a read-only explanation or inspection is `OFF-WORKFLOW`.
   - Bootstrap `NEW` with the exact user-supplied canonical ID when present: run `state.mjs task create`, then execute the clarify phase. `task next` applies only after canonical state exists.
   - For `SWITCH`, preserve the current task. If it has a durable handoff, ask the user to reopen G1, close it, or create a fresh G0 successor and then supersede it; never mark failed work `done` or inherit approvals into the successor.
4. For a task, request only its current phase packet with `node .agents/aidlc/scripts/context.mjs <task-id> --phase <phase>`. Do not load every workflow file.
5. Use `node .agents/aidlc/scripts/state.mjs` for lifecycle mutations when the active adapter policy is `scripted`. Gate approval always uses the atomic `gate approve` command when scripts are available. Native fallback must apply approval and transition as one logical transaction after the same checks.
6. A non-terminal transition is not a stopping point. Continue in the same turn until the next human gate, a real blocker, or completion; do not emit a final handoff between phases.
   After every lifecycle mutation, parse the returned `nextAction`: execute `run_phase`, stop for `await_user`, `blocked`, or `terminal`, and treat only `complete` as successful completion. `terminal` means closed/superseded without a success claim. Never convert this loop into automatic human approval.
   Immediately before any final response for a task, run `node .agents/aidlc/scripts/task-next.mjs <task-id> --require-stop`. A `CONTINUATION_REQUIRED` exit is a hard local guard: continue the returned command instead of replying. This cannot technically intercept a message already emitted by a model host.
7. Use `node .agents/aidlc/scripts/render.mjs <task-id>` for the selected task review artifact. `--all` is explicit maintenance only. Never persist a second lifecycle-state projection such as `BOARD.md`.

Read-only questions remain off-workflow and do not create state. Multiple tasks may exist, but a session builds one task at a time.

## Gates

- `G0_confirm`: the user confirms intent and scope.
- `G1_review`: the user resolves every design decision and approves the plan.
- `G2_codereview`: verification and adversarial review have run; the user reviews the code.

Before presenting a gate, run `node .agents/aidlc/scripts/gate-check.mjs <task-id> --gate <gate>`, then render `node .agents/aidlc/scripts/gate-view.mjs <task-id>` and relay that output verbatim. Structural errors must be fixed. If G2 cannot pass or a repair bound is exhausted, record diagnostic evidence and use `task handoff`; do not set `blocked_on_user` or suggest gate approval. Semantic fidelity remains an LLM/human responsibility. Never mark work complete without executable evidence.

Transitions are enforced by the state machine. A gate may not be skipped, and unresolved decisions block build. G2 always requires human approval.

## Quality contract

- Inspect relevant files and specs before editing.
- Make the smallest approved change and preserve unrelated user work.
- Trace quantified rules, enumerations, and contracts to an exact source.
- Run the narrowest meaningful verification for every affected area.
- Review only the task diff against its approved decisions and spec anchors.
- Bound repair to three verify cycles per area and two review passes; then record a durable handoff and escalate with evidence.
- Structural changes discovered during build reopen G1.

Economy models use the same gates and executable checks. They receive smaller context packets; they do not receive weaker quality rules. Escalate to a stronger model or human for security, migrations, cross-service contracts, ambiguous specs, or exhausted repair bounds.

## Customization layers

Precedence is deterministic:

```text
kernel → built-in topology profile → local profile → project config/rules → approved task decisions
```

Built-in profiles are `topology/generic`, `topology/single`, `topology/workspace`, and `topology/git-submodules`. Stack, delivery, issue-tracker, runtime, and domain rules belong in `.agents/config.json`, `.agents/project/profiles/`, or `.agents/project/rules/`, not in this kernel.

Configured commands use executable + argument arrays. Never turn configuration into an unreviewed shell string.

## Upgrade boundary — mandatory

Workflow upgrades are initiated and applied only by a human through documented `npm` or `npx` commands.

- Never query npm or another registry for newer workflow versions.
- Never run an `npm`/`npx` command whose purpose is installing, detecting, previewing, or upgrading this workflow. Project-configured build, test, and lint commands remain allowed.
- Never suggest an upgrade merely because an installed version is old.
- You may explain the command and review a dry-run report the user supplies.

`status` and `doctor` inspect only local state. The workflow has no background check, postinstall update, remote profile lookup, or runtime asset download.
