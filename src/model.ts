export type AgentId = "claude" | "codex" | "cursor" | "antigravity" | "kiro" | "generic";
export type Phase = "clarify" | "plan" | "build" | "wrap" | "done";
export type Gate = "none" | "G0_confirm" | "G1_review" | "G2_codereview";
export type TaskStatus = "active" | "blocked_on_user" | "paused" | "done";
export type RiskLevel = "low" | "normal" | "high" | "regulated";
export type DecisionStatus = "unresolved" | "approved" | "changed" | "dropped";

export interface FileSpec {
  path: string;
  content: string;
  owner: string;
  strategy?: "replace" | "managed-block";
  ownershipClass?: "managed" | "project" | "state";
}

export interface Adapter {
  id: AgentId;
  displayName: string;
  detect(root: string): boolean;
  files(): FileSpec[];
}

export interface PlannedWrite extends FileSpec {
  action: "create" | "update" | "delete" | "skip" | "conflict" | "migrate" | "preserve";
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

export interface CommandSpec {
  command: string;
  args: string[];
}

export interface Profile {
  schemaVersion: 1;
  id: string;
  extends?: string[];
  topology: "generic" | "single" | "workspace" | "git-submodules";
  discovery?: { roots?: string[]; workspaceMarkers?: string[] };
  specs?: { roots?: string[] };
  commands?: Record<string, CommandSpec>;
  rules?: { include?: string[] };
}

export interface EvalRunner extends CommandSpec {
  model: string;
  version: string;
  timeoutMs?: number;
}

export interface ProjectConfig {
  schemaVersion: 1;
  extends: string[];
  specs: { roots: string[] };
  commands: Record<string, CommandSpec>;
  rules: { include: string[] };
  risk: { default: RiskLevel };
  context: { maxChars: number };
  eval: { runners: Record<string, EvalRunner> };
}

export interface TaskDecision {
  id: string;
  label: string;
  status: DecisionStatus;
  resolution?: string;
}

export interface Evidence {
  kind: "approval" | "spec" | "test" | "lint" | "review" | "diagnostic";
  gate?: Gate;
  area?: string;
  source: string;
  result: "pass" | "fail" | "skip";
  detail?: string;
  recordedAt: string;
}

export interface TaskState {
  id: string;
  title: string;
  type: "feature" | "bug" | "refactor" | "infra";
  phase: Phase;
  gate: Gate;
  status: TaskStatus;
  language: "vi" | "en";
  risk: RiskLevel;
  areas: string[];
  branch: string;
  artifacts: { intent?: string; design?: string; workplan?: string };
  decisions: TaskDecision[];
  tasks: Array<{ id: string; label: string; status: "todo" | "in_progress" | "done" | "deferred" }>;
  evidence: Evidence[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowState {
  schemaVersion: 1;
  tasks: Record<string, TaskState>;
}

export interface ManifestInventoryItem {
  hash: string;
  owner: string;
  strategy: "replace" | "managed-block";
}

export interface WorkflowManifest {
  schemaVersion: 2;
  packageVersion: string;
  workflow: "AI-DLC";
  source: "local-package-assets";
  remoteUpdates: false;
  managedBy: "aidlc-workflow";
  adapters: AgentId[];
  files: Record<string, ManifestInventoryItem>;
}

export interface Diagnostic {
  level: "ERROR" | "WARN" | "INFO";
  code: string;
  message: string;
}
