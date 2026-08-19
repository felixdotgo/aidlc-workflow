import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface McpSetupOptions {
  root: string;
  template: string;
  dryRun: boolean;
  deployment: "docker" | "remote";
  storage: "sqlite" | "postgres";
  bind: "localhost" | "network";
  workspace: string;
  pollMs: number;
  tokenEnv: string;
  providers: string[];
  enable: boolean;
}

export interface McpSetupPlan { target: string; files: string[]; config: Record<string, unknown>; }

export const planMcpSetup = (options: McpSetupOptions): McpSetupPlan => {
  const target = join(resolve(options.root), ".agents/mcp-state");
  const endpoint = options.deployment === "docker" ? "http://127.0.0.1:8787/mcp" : "https://replace-with-service.example/mcp";
  return {
    target,
    files: options.deployment === "docker" ? ["Dockerfile", "compose.yaml", "package.json", "package-lock.json", "src/", "test/", ".env.example"] : [".env.example"],
    config: { enabled: options.enable, ...(options.enable ? { endpoint, workspace: options.workspace, tokenEnv: options.tokenEnv, pollMs: options.pollMs, providers: options.providers } : {}) }
  };
};

export const applyMcpSetup = (options: McpSetupOptions): McpSetupPlan => {
  const plan = planMcpSetup(options);
  if (options.dryRun) return plan;
  mkdirSync(plan.target, { recursive: true });
  if (options.deployment === "docker") cpSync(options.template, plan.target, { recursive: true, force: true });
  const env = [
    `MCP_STATE_DATABASE=${options.storage}`,
    `MCP_STATE_HOST=${options.bind === "localhost" ? "127.0.0.1" : "0.0.0.0"}`,
    `MCP_STATE_AUTH_TOKEN=${options.bind === "network" ? `set-${options.tokenEnv}-outside-git` : ""}`,
    options.storage === "postgres" ? "MCP_STATE_POSTGRES_URL=postgres://aidlc:change-me@postgres:5432/aidlc" : "MCP_STATE_SQLITE_PATH=/data/mcp-state.db"
  ].join("\n");
  writeFileSync(join(plan.target, ".env.example"), `${env}\n`, "utf8");
  const configPath = join(resolve(options.root), ".agents/config.json");
  const current = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown> : { schemaVersion: 3, extends: ["topology/single"], specs: { roots: [] }, commands: {}, rules: { include: [] }, risk: { default: "normal" }, context: { maxChars: 16000 }, agentState: {}, gates: { G1: { autoPass: { enabled: false } } } };
  current.mcp = plan.config;
  writeFileSync(configPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return plan;
};
