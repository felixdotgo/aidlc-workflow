import Database from "better-sqlite3";
import pg from "pg";
import { nextAction, transitionTask, validateState } from "./lifecycle-core.mjs";

const emptyState = () => ({ schemaVersion: 3, tasks: {}, archive: {} });
const emptyIndex = (revision) => ({ schemaVersion: 1, sourceRevision: revision, taskIds: [], updatedAt: new Date().toISOString() });
const parse = (value) => JSON.parse(value);
const encode = (value) => JSON.stringify(value);
const snapshot = (row) => ({ workspace: row.workspace, revision: Number(row.revision), state: parse(row.state), index: parse(row.task_index), updatedAt: row.updated_at });
const mutationResult = (state, index, touchedTaskIds = []) => {
  validateState(state);
  for (const taskId of touchedTaskIds) {
    const task = state.tasks?.[taskId];
    if (task?.status === "blocked_on_user" && nextAction(task).classification !== "await_user") throw new Error(`Task ${taskId} cannot enter blocked_on_user before its gate is ready`);
  }
  return { state, index, touchedTaskIds };
};

export class RevisionConflict extends Error {
  constructor(current) { super(`State revision conflict: expected a newer snapshot than ${current.revision}`); this.name = "RevisionConflict"; this.current = current; }
}

const applyCommand = (current, command) => {
  if (!command || typeof command !== "object" || typeof command.type !== "string") throw new Error("state.apply requires a typed command");
  const state = structuredClone(current.state);
  let index = structuredClone(current.index);
  if (command.type === "replaceState") {
    if (!command.state || typeof command.state !== "object" || Array.isArray(command.state)) throw new Error("replaceState requires an object state");
    const nextState = structuredClone(command.state);
    return mutationResult(nextState, index, Object.keys(nextState.tasks ?? {}));
  }
  if (command.type === "upsertTask") {
    if (typeof command.taskId !== "string" || !command.taskId || !command.task || typeof command.task !== "object" || Array.isArray(command.task)) throw new Error("upsertTask requires taskId and task");
    const previous = current.state.tasks?.[command.taskId];
    if (previous?.status === "blocked_on_user" && command.task.status === "active") {
      const appended = Array.isArray(command.task.evidence) ? command.task.evidence.slice(previous.evidence.length) : [];
      if (!appended.some((item) => item?.kind === "diagnostic" && String(item.detail ?? "").startsWith("Cancelled gate wait"))) throw new Error(`Task ${command.taskId} cannot cancel a human-gate wait without an audited "Cancelled gate wait" diagnostic record`);
    }
    state.tasks ??= {}; state.tasks[command.taskId] = structuredClone(command.task);
    index = { ...index, taskIds: Object.keys(state.tasks).sort() };
    return mutationResult(state, index, [command.taskId]);
  }
  if (command.type === "removeTask") {
    if (typeof command.taskId !== "string" || !command.taskId) throw new Error("removeTask requires taskId");
    delete state.tasks?.[command.taskId];
    index = { ...index, taskIds: Object.keys(state.tasks ?? {}).sort() };
    return mutationResult(state, index);
  }
  if (command.type === "transition") {
    if (typeof command.taskId !== "string" || typeof command.target !== "string") throw new Error("transition requires taskId and target");
    transitionTask(state, command.taskId, command.target);
    index = { ...index, taskIds: Object.keys(state.tasks ?? {}).sort() };
    return mutationResult(state, index, [command.taskId]);
  }
  if (command.type === "replaceIndex") {
    if (!command.index || typeof command.index !== "object" || Array.isArray(command.index)) throw new Error("replaceIndex requires an object index");
    return mutationResult(state, structuredClone(command.index));
  }
  throw new Error(`Unsupported state command: ${command.type}`);
};

export class SqliteStateRepository {
  constructor(filename = process.env.MCP_STATE_SQLITE_PATH ?? "./data/mcp-state.db") {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS state_workspaces (
        workspace TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL, task_index TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS state_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL, revision INTEGER NOT NULL, idempotency_key TEXT NOT NULL, command TEXT NOT NULL, recorded_at TEXT NOT NULL,
        UNIQUE(workspace, revision)
      );
      CREATE TABLE IF NOT EXISTS state_idempotency (
        workspace TEXT NOT NULL, idempotency_key TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(workspace, idempotency_key)
      );
    `);
  }

  #ensure(workspace) {
    const now = new Date().toISOString();
    this.db.prepare("INSERT OR IGNORE INTO state_workspaces (workspace, revision, state, task_index, updated_at) VALUES (?, 0, ?, ?, ?)")
      .run(workspace, encode(emptyState()), encode(emptyIndex(0)), now);
  }

  async get(workspace) {
    this.#ensure(workspace);
    return snapshot(this.db.prepare("SELECT workspace, revision, state, task_index, updated_at FROM state_workspaces WHERE workspace = ?").get(workspace));
  }

  async eventsSince(workspace, cursor = 0) {
    this.#ensure(workspace);
    return this.db.prepare("SELECT id, revision, command, recorded_at FROM state_events WHERE workspace = ? AND id > ? ORDER BY id ASC LIMIT 100").all(workspace, cursor)
      .map((row) => ({ cursor: row.id, revision: row.revision, command: parse(row.command), recordedAt: row.recorded_at }));
  }

  async apply(workspace, expectedRevision, idempotencyKey, command) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error("expectedRevision must be a non-negative integer");
    if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) throw new Error("idempotencyKey is required");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.#ensure(workspace);
      const stored = this.db.prepare("SELECT response FROM state_idempotency WHERE workspace = ? AND idempotency_key = ?").get(workspace, idempotencyKey);
      if (stored) { this.db.exec("COMMIT"); return parse(stored.response); }
      const current = snapshot(this.db.prepare("SELECT workspace, revision, state, task_index, updated_at FROM state_workspaces WHERE workspace = ?").get(workspace));
      if (current.revision !== expectedRevision) throw new RevisionConflict(current);
      const next = applyCommand(current, command);
      const revision = current.revision + 1; const updatedAt = new Date().toISOString();
      next.index = { ...next.index, sourceRevision: revision, updatedAt };
      const nextActions = Object.fromEntries(next.touchedTaskIds.flatMap((taskId) => next.state.tasks?.[taskId] ? [[taskId, nextAction(next.state.tasks[taskId])]] : []));
      const response = { workspace, revision, state: next.state, index: next.index, nextActions, updatedAt };
      this.db.prepare("UPDATE state_workspaces SET revision = ?, state = ?, task_index = ?, updated_at = ? WHERE workspace = ?")
        .run(revision, encode(next.state), encode(next.index), updatedAt, workspace);
      this.db.prepare("INSERT INTO state_events (workspace, revision, idempotency_key, command, recorded_at) VALUES (?, ?, ?, ?, ?)")
        .run(workspace, revision, idempotencyKey, encode(command), updatedAt);
      this.db.prepare("INSERT INTO state_idempotency (workspace, idempotency_key, response) VALUES (?, ?, ?)")
        .run(workspace, idempotencyKey, encode(response));
      this.db.exec("COMMIT"); return response;
    } catch (error) { try { this.db.exec("ROLLBACK"); } catch {} throw error; }
  }

  close() { this.db.close(); }
}

export class PostgresStateRepository {
  constructor(connectionString = process.env.MCP_STATE_POSTGRES_URL) { if (!connectionString) throw new Error("MCP_STATE_POSTGRES_URL is required for PostgreSQL"); this.pool = new pg.Pool({ connectionString }); }
  async #init(client) {
    await client.query(`CREATE TABLE IF NOT EXISTS state_workspaces (workspace TEXT PRIMARY KEY, revision BIGINT NOT NULL, state JSONB NOT NULL, task_index JSONB NOT NULL, updated_at TEXT NOT NULL)`);
    await client.query(`CREATE TABLE IF NOT EXISTS state_events (id BIGSERIAL PRIMARY KEY, workspace TEXT NOT NULL, revision BIGINT NOT NULL, idempotency_key TEXT NOT NULL, command JSONB NOT NULL, recorded_at TEXT NOT NULL, UNIQUE(workspace, revision))`);
    await client.query(`CREATE TABLE IF NOT EXISTS state_idempotency (workspace TEXT NOT NULL, idempotency_key TEXT NOT NULL, response JSONB NOT NULL, PRIMARY KEY(workspace, idempotency_key))`);
  }
  async get(workspace) {
    const client = await this.pool.connect();
    try { await this.#init(client); await client.query("INSERT INTO state_workspaces (workspace, revision, state, task_index, updated_at) VALUES ($1, 0, $2, $3, $4) ON CONFLICT DO NOTHING", [workspace, emptyState(), emptyIndex(0), new Date().toISOString()]); const row = (await client.query("SELECT workspace, revision, state, task_index, updated_at FROM state_workspaces WHERE workspace = $1", [workspace])).rows[0]; return { ...row, revision: Number(row.revision), index: row.task_index }; } finally { client.release(); }
  }
  async eventsSince(workspace, cursor = 0) { const client = await this.pool.connect(); try { await this.#init(client); return (await client.query("SELECT id, revision, command, recorded_at FROM state_events WHERE workspace = $1 AND id > $2 ORDER BY id ASC LIMIT 100", [workspace, cursor])).rows.map((row) => ({ cursor: Number(row.id), revision: Number(row.revision), command: row.command, recordedAt: row.recorded_at })); } finally { client.release(); } }
  async apply(workspace, expectedRevision, idempotencyKey, command) {
    const client = await this.pool.connect();
    try {
      await this.#init(client); await client.query("BEGIN");
      await client.query("INSERT INTO state_workspaces (workspace, revision, state, task_index, updated_at) VALUES ($1, 0, $2, $3, $4) ON CONFLICT DO NOTHING", [workspace, emptyState(), emptyIndex(0), new Date().toISOString()]);
      const stored = (await client.query("SELECT response FROM state_idempotency WHERE workspace = $1 AND idempotency_key = $2", [workspace, idempotencyKey])).rows[0]; if (stored) { await client.query("COMMIT"); return stored.response; }
      const row = (await client.query("SELECT workspace, revision, state, task_index, updated_at FROM state_workspaces WHERE workspace = $1 FOR UPDATE", [workspace])).rows[0]; const current = { workspace: row.workspace, revision: Number(row.revision), state: row.state, index: row.task_index, updatedAt: row.updated_at };
      if (current.revision !== expectedRevision) throw new RevisionConflict(current);
      const next = applyCommand(current, command); const revision = current.revision + 1; const updatedAt = new Date().toISOString(); next.index = { ...next.index, sourceRevision: revision, updatedAt }; const nextActions = Object.fromEntries(next.touchedTaskIds.flatMap((taskId) => next.state.tasks?.[taskId] ? [[taskId, nextAction(next.state.tasks[taskId])]] : [])); const response = { workspace, revision, state: next.state, index: next.index, nextActions, updatedAt };
      await client.query("UPDATE state_workspaces SET revision = $1, state = $2, task_index = $3, updated_at = $4 WHERE workspace = $5", [revision, next.state, next.index, updatedAt, workspace]);
      await client.query("INSERT INTO state_events (workspace, revision, idempotency_key, command, recorded_at) VALUES ($1, $2, $3, $4, $5)", [workspace, revision, idempotencyKey, command, updatedAt]);
      await client.query("INSERT INTO state_idempotency (workspace, idempotency_key, response) VALUES ($1, $2, $3)", [workspace, idempotencyKey, response]); await client.query("COMMIT"); return response;
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; } finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}

export const createRepository = () => process.env.MCP_STATE_DATABASE === "postgres" ? new PostgresStateRepository() : new SqliteStateRepository();
