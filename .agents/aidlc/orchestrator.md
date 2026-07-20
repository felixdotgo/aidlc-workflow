# AI-DLC v1 Orchestrator

This file is the compact kernel contract. Project customization lives under `.aidlc/`; canonical lifecycle state lives in `.agents/state/aidlc-state.json`; Markdown boards and workplans are review views.

## Turn routing

1. Read canonical state or run `aidlc task show`.
2. Classify the request as `NEW`, `RESUME`, `SWITCH`, or `OFF-WORKFLOW`.
3. For a task, request only its current phase packet with `aidlc context <task-id> --phase <phase>`. Do not load every workflow file.
4. Use `aidlc task transition`, `aidlc decision set`, and `aidlc evidence add` instead of hand-editing lifecycle metadata.
5. Render human views with `aidlc render`; never treat a generated `BOARD.md` or workplan as canonical state.

Read-only questions remain off-workflow and do not create state. Multiple tasks may exist, but a session builds one task at a time.

## Gates

- `G0_confirm`: the user confirms intent and scope.
- `G1_review`: the user resolves every design decision and approves the plan.
- `G2_codereview`: verification and adversarial review have run; the user reviews the code.

Before presenting a gate, run `aidlc gate check <task-id> --gate <gate>`. Structural errors must be fixed. Semantic fidelity remains an LLM/human responsibility. Never mark work complete without executable evidence.

Transitions are enforced by the state machine. A gate may not be skipped, and unresolved decisions block build. G2 always requires human approval.

## Quality contract

- Inspect relevant files and specs before editing.
- Make the smallest approved change and preserve unrelated user work.
- Trace quantified rules, enumerations, and contracts to an exact source.
- Run the narrowest meaningful verification for every affected area.
- Review only the task diff against its approved decisions and spec anchors.
- Bound repair to three verify cycles per area and two review passes; then escalate with evidence.
- Structural changes discovered during build reopen G1.

Economy models use the same gates and executable checks. They receive smaller context packets; they do not receive weaker quality rules. Escalate to a stronger model or human for security, migrations, cross-service contracts, ambiguous specs, or exhausted repair bounds.

## Customization layers

Precedence is deterministic:

```text
kernel → built-in topology profile → local profile → project config/rules → approved task decisions
```

Built-in profiles are `topology/generic`, `topology/single`, `topology/workspace`, and `topology/git-submodules`. Stack, delivery, issue-tracker, runtime, and domain rules belong in `.aidlc/config.json`, `.aidlc/profiles/`, or `.aidlc/rules/`, not in this kernel.

Configured commands use executable + argument arrays. Never turn configuration into an unreviewed shell string.

## Upgrade boundary — mandatory

Workflow upgrades are initiated and applied only by a human through documented `npm` or `npx` commands.

- Never query npm or another registry for newer workflow versions.
- Never run `npm`, `npx`, or `aidlc upgrade`, including `--dry-run`.
- Never suggest an upgrade merely because an installed version is old.
- You may explain the command and review a dry-run report the user supplies.

`status` and `doctor` inspect only local state. The workflow has no background check, postinstall update, remote profile lookup, or runtime asset download.
