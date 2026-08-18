# aidlc-workflow

`@felixdotgo/aidlc-workflow` installs a local AI-DLC workflow into an existing project. The workflow gives coding agents a shared task lifecycle, explicit human review gates, and project-owned state and rules.

It is deliberately local-only: workflow assets are bundled with the package, `remoteUpdates` is `false`, and normal status checks never contact a registry.

## Requirements

- Node.js 20 or newer.
- An existing project directory.
- Codex or Claude Code.

## Quick start

Preview the installation first, then apply the same pinned version:

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 init . --agent codex --dry-run
npx @felixdotgo/aidlc-workflow@0.0.1 init . --agent codex --yes
```

Use the adapter that matches the coding tool:

| Tool | `--agent` value | Installed entry point |
| --- | --- | --- |
| Codex | `codex` | `AGENTS.md` |
| Claude Code | `claude` | `CLAUDE.md` and phase skills |

Use `--all` to install both supported adapters. Codex installs `.codex/config.toml` with workspace-write sandboxing and no approval prompts; trust the project before starting Codex so that it loads the project configuration. Claude Code phase skills allow the lifecycle-script command prefix without granting general Bash access. Use `--force --yes` only for an initial installation when replacing an unmanaged conflicting file is intentional.

Confirm the installed project locally:

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 status .
npx @felixdotgo/aidlc-workflow@0.0.1 doctor . --strict
```

## Documentation

The detailed documentation is organised by task and audience:

- [Documentation index](./docs/README.md) — choose the right guide.
- [Operating the workflow](./docs/operating-workflow.md) — lifecycle, state, gates, and blocked work.
- [Configuration](./docs/configuration.md) — project configuration, profiles, rules, and adapters.
- [Command reference](./docs/command-reference.md) — every package CLI command and safety constraint.
- [Development](./docs/development.md) — local contributor setup, source layout, and implementation rules.
- [Testing and release](./docs/testing-and-release.md) — verification, evaluator, package smoke test, and release readiness.
- [Architecture](./docs/architecture.md) — package boundaries and the source-to-installed flow.

## Safety note

Only a human may initiate or apply a workflow upgrade. `upgrade` rejects `--yes` and `--force`, requires an interactive terminal, and asks the human to type the target package version. See the [command reference](./docs/command-reference.md#upgrade) before changing an existing installation.

## License

MIT
