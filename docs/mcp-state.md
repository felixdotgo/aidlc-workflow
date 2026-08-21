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

Every `state_apply` write needs an `expectedRevision`, an `idempotencyKey`, and an absolute `clientProjectRoot`. The root is used only to format portable `nextActions` with absolute script paths and an explicit `--root`; it does not grant the server filesystem access or authority over that path. A stale revision returns the current projection for pull/rebase, and a retry with the same idempotency key returns the original committed result. Successful responses include `nextActions` for touched tasks so remote callers follow the same item loop and stop classifications as the local CLI.

The service checks lifecycle invariants across the whole before/after snapshot, not only touched task IDs. Existing evidence is append-only: the prior evidence array must remain an exact structural prefix. A validated `blocked_on_user` wait cannot be deleted, replaced, or exited—including to `paused`—unless the same mutation appends either a passing approval for that exact gate or gate-bound cancellation diagnostic evidence with a non-empty source. A snapshot that requests `blocked_on_user` while shared lifecycle predicates still require planning, items, verification, or review is rejected. SQLite uses an immediate transaction and busy timeout; PostgreSQL locks the workspace row in a transaction.

`work_item_request` is intentionally only a credential-free preflight for Jira, Trello, or GitHub Issues. It reports the required environment variable names and never returns a reusable token, Authorization header, or token-bearing URL. External updates remain opt-in and must be made outside the lifecycle transaction.
