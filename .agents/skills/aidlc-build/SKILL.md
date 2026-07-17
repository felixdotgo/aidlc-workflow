---
name: aidlc-build
description: "AI-DLC phase 3 (Gate G2): after the review checklist is fully approved, implement the task per submodule, run the narrowest tests/lint, then run code-review. Triggers when the AI-DLC Orchestrator routes an approved (post-G1) task to build. Ends by STOPPING for the user to review the code (G2)."
---

# AI-DLC · Build (Gate G2) — adapter

This skill is a thin Claude Code adapter. The canonical playbook is tool-agnostic and lives in the repo:

**Read `.agents/aidlc/phase-build.md` and execute it exactly.**

- Shared conventions (frontmatter, gates, STOP forms, board rules): `.agents/aidlc/conventions.md`
- Common rules & orchestrator: `.agents/aidlc/orchestrator.md`
- Templates: `.agents/aidlc/templates/` · Stack rules: `.agents/aidlc/rules/`
- Workflow state (BOARD/ARCHIVE/repo-map/specs-index): `.agents/state/`

Do not re-author content from memory — the canonical files are the source of truth.
