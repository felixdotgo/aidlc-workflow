# aidlc-workflow

`aidlc-workflow` installs AI-DLC v1 into an existing project. The v1 kernel combines human gates with canonical JSON state, executable checks, compact phase context, declarative topology profiles, and user-controlled offline upgrades.

The package never checks a registry, downloads runtime workflow assets, or upgrades itself. All managed assets are bundled in the npm package and `remoteUpdates` is permanently `false`.

## Install

Preview first; add `--yes` only when intentionally applying a new installation:

```sh
npx @felixdotgo/aidlc-workflow@1.0.2 init . --agent codex --dry-run
npx @felixdotgo/aidlc-workflow@1.0.2 init . --agent codex --yes
```

Use `--all` for every official adapter. Existing unmanaged files are conflicts unless the initial install explicitly uses `--force --yes`.

## User-only upgrade

Only a human may initiate or apply workflow upgrades. AI agents are instructed never to run these commands, including dry-runs.

```sh
# Human previews the exact package version
npx @felixdotgo/aidlc-workflow@1.0.2 upgrade . --dry-run

# Human applies in an interactive terminal and types the target version
npx @felixdotgo/aidlc-workflow@1.0.2 upgrade .
```

For a project dependency:

```sh
npm install --save-dev @felixdotgo/aidlc-workflow@1.0.2
npm exec -- aidlc upgrade . --dry-run
npm exec -- aidlc upgrade .
```

Upgrade has no `--yes` or `--force`. Apply requires a TTY and exact version confirmation. It stages and validates all writes, backs up changed files, records a journal, and rolls back on failure. Modified managed files produce conflicts before any write; `.aidlc/`, task state, and lessons are preserved.

Recognized v0.2.x baselines migrate to manifest schema v2 and canonical JSON state. Unknown or locally modified legacy core files stop with a conflict report instead of being guessed or overwritten.

## Commands

```text
aidlc init [path] [--agent <name[,name]> | --all] [--yes] [--dry-run] [--force]
aidlc upgrade [path] [--dry-run]
aidlc uninstall [path] [--yes] [--dry-run]
aidlc status [path]
aidlc doctor [path] [--strict]

aidlc task create|show|item|transition|archive ...
aidlc decision set <task-id> <decision-id> ...
aidlc evidence add <task-id> ... [--area <affected-area>]
aidlc gate check <task-id> --gate <gate>
aidlc context <task-id> --phase <phase> [--format markdown|json]
aidlc render [task-id]
aidlc profile validate [path]
aidlc eval run --runner <id> [path]
aidlc eval verify-release [evidence.json]
```

`status` and `doctor` inspect local files only. They never determine whether a newer package exists.

## Ownership and customization

```text
.agents/aidlc/       package-managed kernel, profiles, templates, and schemas
.aidlc/              project-owned config, profiles, and Markdown rules
.agents/state/       canonical state, generated views, migration backups
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

Before publish, save one passing report into `.aidlc/release-eval.json` with `{ "packageVersion": "1.0.2", "createdAt": "<ISO timestamp>", "reports": [...] }`. `prepublishOnly` runs tests and `release:check`; missing, stale, incomplete, or below-threshold evidence blocks publication.

## Supported adapters

Claude Code, Codex, Cursor, Google Antigravity, and Kiro have dedicated fixture-tested adapters. Generated instructions include the human-only upgrade prohibition.

## Development

```sh
npm install
npm run lint
npm test
```
