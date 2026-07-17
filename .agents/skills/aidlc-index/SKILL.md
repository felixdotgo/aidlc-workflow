---
name: aidlc-index
description: "Build or refresh the AI-DLC index — a compact repo-map and spec-index used by every other AI-DLC phase to locate relevant code and docs cheaply. Run when .agents/state/repo-map.md is missing, or whenever submodules, stacks, or spec files change. Triggers: 'aidlc index', 'refresh repo map', 'rebuild spec index', 'index the specs'. Normally invoked automatically by the AI-DLC Orchestrator, not by the user."
---

# AI-DLC · Index — adapter

This skill is a thin Claude Code adapter. The canonical playbook is tool-agnostic and lives in the repo:

**Read `.agents/aidlc/phase-index.md` and execute it exactly.**

- Shared conventions (frontmatter, gates, STOP forms, board rules): `.agents/aidlc/conventions.md`
- Common rules & orchestrator: `.agents/aidlc/orchestrator.md`
- Templates: `.agents/aidlc/templates/` · Stack rules: `.agents/aidlc/rules/`
- Workflow state (BOARD/ARCHIVE/repo-map/specs-index): `.agents/state/`

Do not re-author content from memory — the canonical files are the source of truth.
