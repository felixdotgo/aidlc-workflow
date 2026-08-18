# Command reference

All commands operate on local files. Replace `.` with the target project path when needed. Examples use the current package version for reproducibility; choose the version intentionally in real use.

## `init`

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 init [path] [--agent <name[,name]> | --all] [--yes] [--dry-run] [--force]
```

Plans the installation, prints a preview, and then writes the workflow only after confirmation (or `--yes`). `--dry-run` prints the same plan without writing. If exactly one installed agent is detected, it can be selected automatically; otherwise choose `--agent` or `--all`.

`--force` is for an intentional initial replacement of an unmanaged conflicting file. It is not an upgrade mechanism. If the project already has another workflow package version, use the human-run upgrade flow instead.

## `status`

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 status [path]
```

Reports the installed version and local installation status. It does not query a registry.

## `doctor`

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 doctor [path] [--strict]
```

Checks the local manifest, configuration, and canonical state. `--strict` turns compatibility warnings such as a legacy manifest into errors. It does not query a registry.

## `profile validate`

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 profile validate [path]
```

Loads `.agents/config.json`, resolves its profile chain, and prints the effective profile order. Use it after changing `extends` or local profiles.

## `uninstall`

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 uninstall [path] [--yes] [--dry-run]
```

Prints the removal plan before applying it. It removes eligible unchanged managed assets but preserves project configuration and state. Prefer `--dry-run` first when working in an existing project.

## `upgrade`

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 upgrade [path] [--dry-run]
```

Upgrade is deliberately human-only. The command rejects `--yes` and `--force`; applying it requires an interactive terminal and an exact typed confirmation of the package version. Agents must not run, preview, detect, or suggest package upgrades on their own.

The upgrade plan handles supported legacy `.aidlc/` project data transactionally: identical paths are deduplicated, differing content or unsafe entries stop the plan, and an audit backup supports rollback. Review the preview before an authorised human applies it.

## Installed lifecycle scripts

After `init`, task lifecycle commands live in the target project, not in the package CLI:

```sh
node .agents/aidlc/scripts/state.mjs task list --limit 20
node .agents/aidlc/scripts/state.mjs task find --query "<words>" --include-archive
node .agents/aidlc/scripts/state.mjs task show <task-id>
node .agents/aidlc/scripts/state.mjs task next <task-id>
node .agents/aidlc/scripts/gate-view.mjs <task-id>
```

Use [Operating the workflow](./operating-workflow.md) for gates, approvals, handoffs, and task ownership.
