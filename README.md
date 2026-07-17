# aidlc-workflow

`aidlc-workflow` installs a **local** AI-DLC workflow into an existing project. It is designed for `npx` and adapts a shared workflow core to the instruction mechanisms of supported coding agents.

It does not download, package, copy, or check assets from AWS or any other remote workflow source. All installed assets originate in this npm package; `remoteUpdates` is permanently disabled in its manifest.

## Install

Run setup without `--agent` to auto-select one detected agent. If zero or several agents are detected in an interactive terminal, the CLI shows a numbered list for selection:

```sh
npx @felixdotgo/aidlc-workflow init .
```

The CLI always labels the file list as a preview and asks for confirmation before changing files. Review any create, update, or conflict first. In a non-interactive environment it stays in preview mode unless `--yes` is explicit:

```sh
npx @felixdotgo/aidlc-workflow init . --agent claude,codex,cursor --yes
```

Use every officially supported adapter deliberately:

```sh
npx @felixdotgo/aidlc-workflow init . --all --yes
```

`--dry-run` always prevents writes. Existing unmanaged files are conflicts; review the plan and use `--force --yes` only when replacing one is intentional.

Remove only assets that the package can verify it owns:

```sh
npx @felixdotgo/aidlc-workflow uninstall .
```

`uninstall` previews every removal and asks for confirmation. It preserves `.agents/state/BOARD.md`, any unmanaged files, and managed files or prompt blocks that were modified after installation. Use `--yes` only for an intentional non-interactive removal.

## Commands

```text
aidlc init [path] [--agent <name[,name]> | --all] [--yes] [--dry-run] [--force]
aidlc uninstall [path] [--yes] [--dry-run]
aidlc status [path]
aidlc doctor [path]
```

## What `init` creates

The workflow core is installed verbatim from the package's local assets:

```text
.agents/
├── aidlc/                 # orchestrator, clarify/plan/build/wrap/index, templates, rules
├── skills/                # aidlc-clarify, aidlc-plan, aidlc-build, aidlc-wrap, aidlc-index
└── state/BOARD.md         # initial empty task board
```

Selecting `claude` appends a marked AI-DLC block to `CLAUDE.md` and creates `.claude/skills/aidlc/SKILL.md`. Selecting `codex` appends the same kind of marked block to `AGENTS.md`. The installer preserves all existing content and only replaces its own marked block on later runs.

`status` lists workflow presence and detected agent directories. `doctor` validates the local-only manifest. Re-running `init` updates only files marked as owned by this package.

## Supported adapters

| Adapter | Generated integration | Status |
|---|---|---|
| Claude Code | managed block in `CLAUDE.md` + `.claude/skills/aidlc/SKILL.md` | Official, fixture-tested |
| Codex | managed block in `AGENTS.md` | Official, fixture-tested |
| Cursor | `.cursor/rules/aidlc.mdc` | Official, fixture-tested |
| Google Antigravity | `.agents/rules/aidlc.md` | Official, fixture-tested |
| Kiro | `.kiro/steering/aidlc.md` | Official, fixture-tested |
| Generic | `.agents/aidlc/adapters/generic-instructions.md` | Explicit opt-in only; no vendor-specific claim |

The core lives under `.agents/aidlc/` and `.agents/skills/`. Each generated file or prompt block has an ownership marker. The installer never claims verified support for an agent without a dedicated adapter and test fixture.

## Extending an adapter

Add an entry to `src/adapters.ts` implementing `id`, `displayName`, `detect`, and `files`. Add a test that verifies its rendered path and content, then update this matrix. Do not add a remote downloader, updater, or vendor workflow copy step.

## Development

```sh
npm install
npm test
npm run lint
npm run build
```
