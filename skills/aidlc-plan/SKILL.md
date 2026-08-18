---
name: aidlc-plan
description: "AI-DLC phase 2 (Gate G1): after intent is confirmed, run a parallel discovery fan-out (specs + code via subagents/codegraph), then produce a detailed design, a per-submodule task breakdown, and a review checklist. Triggers when the AI-DLC Orchestrator routes an confirmed (post-G0) task to planning. Ends by STOPPING for the user to tick the review checklist (G1)."
---

# AI-DLC · Plan (Gate G1) — adapter

This skill is a thin Claude Code adapter. The canonical playbook is tool-agnostic and lives in the repo:

**Read `.agents/aidlc/phase-plan.md` and execute it exactly.**

- Shared conventions (canonical state, gates, continuation, evidence): `.agents/aidlc/conventions.md`
- Common rules & orchestrator: `.agents/aidlc/orchestrator.md`
- Templates: `.agents/aidlc/templates/` · Stack rules: `.agents/aidlc/rules/`
- Lifecycle state: `.agents/data/state/aidlc-state.json` · discovery indexes: `.agents/data/index/repo-map.md`, `.agents/data/index/specs-index.md`

Do not re-author content from memory — the canonical files are the source of truth.
