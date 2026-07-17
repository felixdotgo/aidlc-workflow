---
name: aidlc-plan
description: "AI-DLC phase 2 (Gate G1): after intent is confirmed, run a parallel discovery fan-out (specs + code via subagents/codegraph), then produce a detailed design, a per-submodule task breakdown, and a review checklist. Triggers when the AI-DLC Orchestrator routes an confirmed (post-G0) task to planning. Ends by STOPPING for the user to tick the review checklist (G1)."
---

# AI-DLC · Plan (Gate G1) — adapter

This skill is a thin Claude Code adapter. The canonical playbook is tool-agnostic and lives in the repo:

**Read `.agents/aidlc/phase-plan.md` and execute it exactly.**

- Shared conventions (frontmatter, gates, STOP forms, board rules): `.agents/aidlc/conventions.md`
- Common rules & orchestrator: `.agents/aidlc/orchestrator.md`
- Templates: `.agents/aidlc/templates/` · Stack rules: `.agents/aidlc/rules/`
- Workflow state (BOARD/ARCHIVE/repo-map/specs-index): `.agents/state/`

Do not re-author content from memory — the canonical files are the source of truth.
