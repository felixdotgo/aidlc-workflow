# Instructions for AI agents

**Read `.agents/aidlc/orchestrator.md` and follow it — it holds ALL common rules** (AI-DLC Orchestrator, Core Working Rules, Gates & Artifacts, Tool Priority, Language). This file is only a generic entrypoint (Codex CLI, Cursor, Gemini CLI, …); the canonical workflow definition lives in `.agents/aidlc/`.

Deltas for tools WITHOUT Claude Code's integrations:

- **No state hook:** read `.agents/state/aidlc-state.json` at the **start of every turn** (it is the only persisted lifecycle state), and update it through `.agents/aidlc/scripts/state.mjs`.
- **No Skill tool:** when the orchestrator routes to a phase, open `.agents/aidlc/phase-<clarify|plan|build|wrap|index>.md` and execute it exactly.
- **No subagents / MCP (codegraph, serena):** per the orchestrator's Conflicts rule — use the closest fallback (inline research, `rg`/file reads) and say so.
- Templates: `.agents/aidlc/templates/` · Stack rules (read on demand at build): `.agents/aidlc/rules/`.

Tool notes: Codex CLI and Cursor read this `AGENTS.md` natively. Gemini CLI defaults to `GEMINI.md` — set `contextFileName: "AGENTS.md"` in `.gemini/settings.json` (or symlink) to use this file.
