# MCP state service

The optional MCP state service is a separate Docker-deployable authority for a workflow workspace. It is disabled by default: without an enabled `mcp` block, installed lifecycle scripts remain local and make no network calls.

## Safe setup

Preview a configuration first. Outside an interactive terminal, provide all four selection flags.

```sh
npx @felixdotgo/aidlc-workflow@0.0.1 mcp setup . --dry-run \
  --deployment docker --storage sqlite --bind localhost --workspace engineering
```

Remove `--dry-run` and confirm to create `.agents/mcp-state/` and update `.agents/config.json`. Setup does not start Docker. Copy `.env.example` to a secret-managed `.env`, review it, then start explicitly:

```sh
docker compose --env-file .agents/mcp-state/.env -f .agents/mcp-state/compose.yaml up -d
```

Use SQLite only on the local Docker volume. Use PostgreSQL for multiple hosts. A network bind requires `MCP_STATE_AUTH_TOKEN` and TLS/reverse-proxy termination; never commit either the `.env` file or provider credentials.

## State and synchronization contract

When enabled, the remote workspace is canonical. Import/export is an explicit recovery or migration action; there is no background dual-write or local fallback during an outage. Clients pull a revision or poll `state_events_since`; the service provides neither realtime subscriptions nor push notifications.

Every `state_apply` write needs an `expectedRevision` and an `idempotencyKey`. A stale revision returns the current projection for pull/rebase, and a retry with the same idempotency key returns the original committed result. SQLite uses an immediate transaction and busy timeout; PostgreSQL locks the workspace row in a transaction.

`work_item_request` is intentionally only a credential-free preflight for Jira, Trello, or GitHub Issues. It reports the required environment variable names and never returns a reusable token, Authorization header, or token-bearing URL. External updates remain opt-in and must be made outside the lifecycle transaction.
