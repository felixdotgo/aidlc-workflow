export type AgentId = "claude" | "codex" | "cursor" | "antigravity" | "kiro" | "generic";

export interface FileSpec {
  path: string;
  content: string;
  owner: string;
  strategy?: "replace" | "managed-block";
}

export interface Adapter {
  id: AgentId;
  displayName: string;
  detect(root: string): boolean;
  files(): FileSpec[];
}

export interface PlannedWrite extends FileSpec {
  action: "create" | "update" | "skip" | "conflict";
  reason: string;
}

export interface InitOptions {
  root: string;
  agents: AgentId[];
  all: boolean;
  dryRun: boolean;
  yes: boolean;
  force: boolean;
}
