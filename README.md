# aidlc-workflow

`aidlc-workflow` installs AI-DLC v1 into an existing project. The v1 kernel combines human gates with one canonical JSON state file, project-local Node.js lifecycle scripts, compact phase context, declarative topology profiles, and user-controlled offline upgrades.

The package never checks a registry, downloads runtime workflow assets, or upgrades itself. All managed assets are bundled in the npm package and `remoteUpdates` is permanently `false`.

## Install

Preview first; add `--yes` only when intentionally applying a new installation:

```sh
npx @felixdotgo/aidlc-workflow@2.2.0 init . --agent codex --dry-run
npx @felixdotgo/aidlc-workflow@2.2.0 init . --agent codex --yes
```

Use `--all` for every official adapter. Existing unmanaged files are conflicts unless the initial install explicitly uses `--force --yes`.

## User-only upgrade

Only a human may initiate or apply workflow upgrades. AI agents are instructed never to run these commands, including dry-runs.

```sh
# Human previews the exact package version
npx @felixdotgo/aidlc-workflow@2.2.0 upgrade . --dry-run

# Human applies in an interactive terminal and types the target version
npx @felixdotgo/aidlc-workflow@2.2.0 upgrade .
```

Upgrade has no `--yes` or `--force`. Apply requires a TTY and exact version confirmation. It stages and validates all writes, backs up changed files, records a journal, and rolls back on failure. Modified managed files produce conflicts before any write; `.aidlc/`, task state, and lessons are preserved.

Recognized v0.2.x baselines migrate to manifest schema v2 and canonical JSON state. Unknown or locally modified legacy core files stop with a conflict report instead of being guessed or overwritten.

## Human package-management commands

```text
npx @felixdotgo/aidlc-workflow@<version> init [path] [--agent <name[,name]> | --all] [--yes] [--dry-run] [--force]
npx @felixdotgo/aidlc-workflow@<version> upgrade [path] [--dry-run]
npx @felixdotgo/aidlc-workflow@<version> uninstall [path] [--yes] [--dry-run]
npx @felixdotgo/aidlc-workflow@<version> status [path]
npx @felixdotgo/aidlc-workflow@<version> doctor [path] [--strict]
```

`status` and `doctor` inspect local files only. They never determine whether a newer package exists.

## Project-local lifecycle scripts

After installation, agents use the bundled scripts directly through Node.js. No global command, local npm dependency, package cache, or `PATH` lookup is required.

```sh
node .agents/aidlc/scripts/state.mjs task show
node .agents/aidlc/scripts/state.mjs task create <task-id> --title <title>
node .agents/aidlc/scripts/state.mjs task transition <task-id> --to <phase>
node .agents/aidlc/scripts/state.mjs task status <task-id> --status <active|blocked_on_user|paused|done>
node .agents/aidlc/scripts/state.mjs task item <task-id> <item-id> --status <status>
node .agents/aidlc/scripts/state.mjs decision set <task-id> <decision-id> --status <status>
node .agents/aidlc/scripts/state.mjs evidence add <task-id> --kind <kind> --result <result> --source <source>
node .agents/aidlc/scripts/context.mjs <task-id> --phase <phase> [--format markdown|json]
node .agents/aidlc/scripts/render.mjs
node .agents/aidlc/scripts/gate-check.mjs <task-id> --gate <gate>
```

Every script defaults to the current working directory and accepts `--root <path>`. `.agents/state/aidlc-state.json` is the only persisted lifecycle state; `state.mjs task show` provides a human-readable JSON view on demand. The workflow does not create `BOARD.md`.

For lifecycle mutations, `agentState` may opt an installed adapter into `native` file edits; omitted adapters use the safe `scripted` default. Native mode removes lifecycle-script approvals only and never bypasses human gates or build verification.

## Ownership and customization

```text
.agents/aidlc/       package-managed kernel, profiles, templates, and schemas
.agents/config.json  project-owned workflow configuration
.aidlc/              project-owned profiles, Markdown rules, and release evidence
.agents/state/       sole canonical JSON state and migration backups
```

Configuration is dependency-free JSON:

```json
{
  "schemaVersion": 1,
  "extends": ["topology/single"],
  "specs": { "roots": ["docs/specs"] },
  "commands": {
    "test": { "command": "npm", "args": ["test"] },
    "lint": { "command": "npm", "args": ["run", "lint"] }
  },
  "rules": { "include": [".aidlc/rules/*.md"] },
  "risk": { "default": "normal" },
  "context": { "maxChars": 16000 },
  "eval": {
    "runners": {
      "economy-a": {
        "command": "model-runner",
        "args": ["--json"],
        "model": "economy-model-name",
        "version": "pinned-version",
        "timeoutMs": 120000
      }
    }
  }
}
```

Precedence is `kernel → built-in topology → local profile → project config/rules → approved task decisions`. Built-ins are `topology/generic`, `topology/single`, `topology/workspace`, and `topology/git-submodules`. Local profiles are declarative `profile.json` plus Markdown rules; executable JavaScript/TypeScript plugins and remote profile discovery are intentionally unsupported.

### Multi-model collaboration

The managed `templates/model-contract.md` supplies a provider-neutral collaboration contract. COSTARS structures task handoffs: context, objective, style, tone, audience, response format, and success criteria. CRITICS structures adversarial review: criteria, risks, issues, tests/evidence, improvements, conclusion, and escalation.

Clarify, plan, and build use the relevant COSTARS fields. CRITICS is required for the G2 adversarial review and is used earlier only for elevated risk, ambiguous requirements, or model disagreement. These templates standardize model communication only: canonical state, executable verification, and human gates remain the authority for task progression. Projects may add narrower conventions through `.aidlc/rules/`.

## Economy-model evaluation

The bundled suite contains 30 scenarios. A runner is a configured executable + argument array: it receives one scenario as JSON on stdin and returns:

```json
{
  "status": "pass",
  "transcript": "...",
  "usage": { "inputTokens": 0, "outputTokens": 0, "contextChars": 0 },
  "diagnostics": ["gate check passed", "tests passed"]
}
```

A release runner passes only with average score ≥8/10, completion ≥85%, 100% structural compliance, zero critical violations, and median context at least 50% below the 34,000-character v0.2.1 baseline. Every scenario runs in a separate temporary workspace. Manual/local release requires one pinned economy-model runner; additional reports are optional.

Before publish, save one passing report into `.aidlc/release-eval.json` with `{ "packageVersion": "2.2.0", "createdAt": "<ISO timestamp>", "reports": [...] }`. `prepublishOnly` runs tests and `release:check`; missing, stale, incomplete, or below-threshold evidence blocks publication.

## Supported adapters

Claude Code, Codex, Cursor, Google Antigravity, and Kiro have dedicated fixture-tested adapters. Generated instructions include the human-only upgrade prohibition.

## Development

```sh
npm install
npm run lint
npm test
```
