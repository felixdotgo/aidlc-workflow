import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { z } from "zod";
import { RevisionConflict, createRepository } from "./repository.mjs";
import { providerPreflight } from "./providers.mjs";

const result = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const failure = (error) => ({ isError: true, content: [{ type: "text", text: JSON.stringify(error instanceof RevisionConflict ? { code: "REVISION_CONFLICT", current: error.current } : { code: "STATE_ERROR", message: error instanceof Error ? error.message : String(error) }) }] });
const workspace = z.string().min(1).max(128);

export const buildServer = (repository) => {
  const server = new McpServer({ name: "aidlc-mcp-state", version: "0.1.0" });
  server.registerTool("state_get", { description: "Pull the current workflow state and derived index for a workspace.", inputSchema: z.object({ workspace }) }, async ({ workspace: id }) => { try { return result(await repository.get(id)); } catch (error) { return failure(error); } });
  server.registerTool("state_events_since", { description: "Poll committed state events after a cursor; no realtime transport is used.", inputSchema: z.object({ workspace, cursor: z.number().int().nonnegative().default(0) }) }, async ({ workspace: id, cursor }) => { try { return result(await repository.eventsSince(id, cursor)); } catch (error) { return failure(error); } });
  server.registerTool("state_apply", { description: "Atomically apply a lifecycle-valid state/task/index command with revision and idempotency protection.", inputSchema: z.object({ workspace, expectedRevision: z.number().int().nonnegative(), idempotencyKey: z.string().min(1).max(256), command: z.object({ type: z.enum(["replaceState", "upsertTask", "removeTask", "replaceIndex", "transition"]), taskId: z.string().optional(), target: z.string().optional(), task: z.unknown().optional(), state: z.unknown().optional(), index: z.unknown().optional() }) }) }, async ({ workspace: id, expectedRevision, idempotencyKey, command }) => { try { return result(await repository.apply(id, expectedRevision, idempotencyKey, command)); } catch (error) { return failure(error); } });
  server.registerTool("work_item_request", { description: "Return a credential-free preflight for an opt-in Jira, Trello or GitHub Issues operation. Agents decide whether to make external updates outside the lifecycle transaction.", inputSchema: z.object({ provider: z.enum(["jira", "trello", "github-issues"]), reference: z.string().min(1), operation: z.enum(["get", "update", "comment"]), payload: z.record(z.string(), z.unknown()).default({}) }) }, async ({ provider, reference, operation, payload }) => { try { return result(providerPreflight(provider, reference, operation, payload)); } catch (error) { return failure(error); } });
  return server;
};

const repository = createRepository();
const host = process.env.MCP_STATE_HOST ?? "127.0.0.1";
const port = Number(process.env.MCP_STATE_PORT ?? 8787);
const token = process.env.MCP_STATE_AUTH_TOKEN;
if (!["127.0.0.1", "localhost", "::1"].includes(host) && !token) throw new Error("MCP_STATE_AUTH_TOKEN is required when binding beyond localhost");
const app = createMcpExpressApp({ host });
app.use((req, res, next) => {
  if (!token || req.headers.authorization === `Bearer ${token}`) return next();
  res.status(401).json({ error: "unauthorized" });
});
app.post("/mcp", async (req, res) => {
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildServer(repository);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
const listener = app.listen(port, host, () => console.error(`aidlc MCP state service listening at http://${host}:${port}/mcp`));
const shutdown = async () => { listener.close(); await repository.close(); };
process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
