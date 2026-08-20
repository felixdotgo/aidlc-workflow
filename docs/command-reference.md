# Command reference

All commands operate on local files. Replace `.` with the target project path when needed. Examples use the current package version for reproducibility; choose the version intentionally in real use.

## `init`

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 init [path] [--agent <name[,name]> | --all] [--yes] [--dry-run] [--force]
```

Plans the installation, prints a preview, and then writes the workflow only after confirmation (or `--yes`). `--dry-run` prints the same plan without writing. If exactly one installed agent is detected, it can be selected automatically. In an interactive terminal, choose multiple agents with the checkbox prompt: use arrow keys to move, Space to toggle, A to toggle all, and Enter to confirm. For scripts and non-interactive terminals, use `--agent <name[,name]>` or `--all`.

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

## `mcp setup`

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 mcp setup [path] [--dry-run] [--yes] [--storage sqlite|postgres] [--deployment docker|remote] [--bind localhost|network] [--workspace <id>] [--poll-ms <n>] [--enable]
```

Previews the optional MCP state-service configuration, then writes only after confirmation. Non-interactive use requires `--deployment`, `--storage`, `--bind`, and `--workspace`. It never starts Docker; `--enable` is explicit and remote mode has no local fallback. See [MCP state service](./mcp-state.md) for deployment and credential requirements.

## `upgrade`

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 upgrade [path] [--dry-run]
```

Upgrade is deliberately human-only. The command rejects `--yes` and `--force`; applying it requires an interactive terminal and an exact typed confirmation of the package version. Interactive confirmations use the same styled terminal prompt as `init`. Agents must not run, preview, detect, or suggest package upgrades on their own.

The upgrade plan handles supported legacy `.aidlc/` project data transactionally: identical paths are deduplicated, differing content or unsafe entries stop the plan, and an audit backup supports rollback. Review the preview before an authorised human applies it.

## Installed lifecycle scripts

After `init`, task lifecycle commands live in the target project, not in the package CLI:

```sh
node .agents/aidlc/scripts/state.mjs task list --limit 20
node .agents/aidlc/scripts/state.mjs task find --query "<words>" --include-archive
node .agents/aidlc/scripts/state.mjs task show <task-id>
node .agents/aidlc/scripts/state.mjs task next <task-id>
node .agents/aidlc/scripts/task-next.mjs <task-id> --require-stop
node .agents/aidlc/scripts/gate-view.mjs <task-id>
```

Installed lifecycle options may appear before or after positionals and accept both `--name value` and `--name=value`. Unknown, duplicate, command-irrelevant, missing-value, and surplus positional arguments are rejected before state I/O. Boolean options such as `--all`, `--include-archive`, and `--require-stop` do not accept values. When a literal value begins with `--`, use the equals form so it is not confused with a missing value.

An explicit `--root <path>` wins and must identify a directory containing `.agents/`. Without `--root`, the runtime walks upward from the current working directory and selects the nearest ancestor containing `.agents/aidlc/`. If no installed-workflow marker exists, the command fails without creating local state. When invoking from a nested directory, use an absolute or upward-relative script path so Node can locate the script; root discovery then selects the project data.

Every successful lifecycle mutation prints a JSON envelope with the affected `task` (and any command-specific result) plus a derived `nextAction`. Callers must execute `run_phase` actions immediately; a successful mutation is not permission to stop. In build, the action includes `itemId`, `remainingItems`, and an item-focused context command while work remains.

`task-next.mjs --require-stop` prints the current action and exits `2` when its classification is `run_phase`; `CONTINUATION_REQUIRED` on stderr is a local guard against a premature final response. It exits normally for a valid human gate, durable blocker, terminal outcome, or completion. `task status ... --status blocked_on_user` fails instead of persisting when the current gate is not ready, and `gate-view.mjs` only renders tasks already in that validated status.

Human approval is a dedicated atomic operation:

```sh
node .agents/aidlc/scripts/state.mjs gate approve <task-id> --gate <gate> --source "<explicit approval>"
```

`evidence add` accepts `spec`, `test`, `lint`, `review`, and `diagnostic`; it rejects `approval`. A validated `blocked_on_user` wait cannot be cancelled with `task status --status active`. Normal phase advancement uses `gate approve`, and wrap completion uses `task archive`. The low-level transition escape hatch is intentionally noisy, records diagnostic evidence, still applies all transition checks, and requires audit metadata:

```sh
node .agents/aidlc/scripts/state.mjs task transition <task-id> --to <phase> --mode audited --reason "<reason>" --source "<source>"
```

Self-transitions are rejected. After a G1 reopen, all non-deferred execution items return to `todo`; prior G2, verification, and review evidence cannot satisfy the new build boundary.

State writes and generated workplans use symlink-checked atomic replacement. State-lock release is owner-token checked and never removes a replacement owner's lock. If a process stops after writing a terminal archive record but before committing the catalog, a retry replaces that orphan only when the persisted catalog still contains the same active task identity and does not reference an archive record; malformed, referenced, or identity-conflicting records fail closed.

Use [Operating the workflow](./operating-workflow.md) for gates, approvals, handoffs, and task ownership.
