---
name: aidlc-clarify
description: "AI-DLC phase 1 (Gate G0): turn a raw request into a confirmed intent brief — restate the problem, map affected submodules + specs, list assumptions and open questions, fix scope. Cheap: reads only the AI-DLC index, no deep code dive. Triggers: a NEW feature/bug/change request when the AI-DLC Orchestrator routes to clarify. Ends by STOPPING for user confirmation (G0)."
---

# AI-DLC · Clarify (Gate G0) — adapter

This skill is a thin Claude Code adapter. The canonical playbook is tool-agnostic and lives in the repo:

**Read `.agents/aidlc/phase-clarify.md` and execute it exactly.**

- Shared conventions (frontmatter, gates, STOP forms, board rules): `.agents/aidlc/conventions.md`
- Common rules & orchestrator: `.agents/aidlc/orchestrator.md`
- Templates: `.agents/aidlc/templates/` · Stack rules: `.agents/aidlc/rules/`
- Workflow state (BOARD/ARCHIVE/repo-map/specs-index): `.agents/state/`

Do not re-author content from memory — the canonical files are the source of truth.
