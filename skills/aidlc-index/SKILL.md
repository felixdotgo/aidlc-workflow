---
name: aidlc-index
description: "Build or refresh the AI-DLC index — a compact repo-map and spec-index used by every other AI-DLC phase to locate relevant code and docs cheaply. Run when .agents/data/index/repo-map.md is missing, or whenever submodules, stacks, or spec files change. Triggers: 'aidlc index', 'refresh repo map', 'rebuild spec index', 'index the specs'. Normally invoked automatically by the AI-DLC Orchestrator, not by the user."
---

# AI-DLC · Index — adapter

This skill is a thin Claude Code adapter. The canonical playbook is tool-agnostic and lives in the repo:

**Read `.agents/aidlc/phase-index.md` and execute it exactly.**

- Shared conventions (canonical state, gates, continuation, evidence): `.agents/aidlc/conventions.md`
- Common rules & orchestrator: `.agents/aidlc/orchestrator.md`
- Templates: `.agents/aidlc/templates/` · Stack rules: `.agents/aidlc/rules/`
- Lifecycle state: `.agents/data/state/aidlc-state.json` · discovery indexes: `.agents/data/index/repo-map.md`, `.agents/data/index/specs-index.md`

Do not re-author content from memory — the canonical files are the source of truth.
