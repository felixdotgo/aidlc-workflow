import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { adapters, findAdapter, installableAdapters } from "./adapters.js";
import type { AgentId, FileSpec, InitOptions, PlannedWrite } from "./model.js";
import { coreWorkflowFiles } from "./workflow.js";

const marker = "<!-- aidlc-installer:";
const hash = (content: string) => createHash("sha256").update(content).digest("hex").slice(0, 12);
const isOwned = (spec: FileSpec, current: string): boolean => current.includes(`${marker}${spec.owner}`) || (spec.path === ".agents/aidlc/manifest.json" && current.includes('"managedBy": "aidlc-workflow"'));

export const detectedAgents = (root: string): AgentId[] => installableAdapters().filter((adapter) => adapter.detect(root)).map((adapter) => adapter.id);

export const selectAgents = (options: Pick<InitOptions, "root" | "agents" | "all">): AgentId[] => {
  if (options.all) return adapters.map((adapter) => adapter.id).filter((id) => id !== "generic");
  return [...new Set(options.agents)];
};

const planFile = (root: string, spec: FileSpec, force: boolean): PlannedWrite => {
  const target = join(root, spec.path);
  if (spec.strategy === "managed-block") {
    const current = existsSync(target) ? readFileSync(target, "utf8") : "";
    const start = `<!-- aidlc-installer:${spec.owner} -->`;
    const block = spec.content.trimEnd();
    const next = current.includes(start)
      ? current.replace(new RegExp(`${start}[\\s\\S]*?(?=\\n<!-- aidlc-installer:|$)`), block)
      : `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${block}`;
    return { ...spec, content: `${next.trimEnd()}\n`, action: existsSync(target) ? (next === current ? "skip" : "update") : "create", reason: existsSync(target) ? "managed prompt block" : "new managed prompt" };
  }
  if (!existsSync(target)) return { ...spec, action: "create", reason: "new managed file" };
  const current = readFileSync(target, "utf8");
  if (current === spec.content) return { ...spec, action: "skip", reason: "already current" };
  if (isOwned(spec, current)) return { ...spec, action: "update", reason: "managed file changed" };
  if (force) return { ...spec, action: "update", reason: "--force permits replacement of an unmanaged file" };
  return { ...spec, action: "conflict", reason: "unmanaged file exists; rerun with --force after review" };
};

export const planInit = (options: InitOptions): PlannedWrite[] => {
  const root = resolve(options.root);
  const selected = selectAgents(options);
  const unknown = selected.filter((id) => !findAdapter(id));
  if (unknown.length) throw new Error(`Unsupported adapter: ${unknown.join(", ")}`);
  const agentFiles = selected.flatMap((id) => findAdapter(id)?.files() ?? []);
  return [...coreWorkflowFiles(), ...agentFiles].map((spec) => planFile(root, spec, options.force));
};

export const applyPlan = (root: string, plan: PlannedWrite[]): void => {
  for (const write of plan.filter((item) => item.action === "delete")) rmSync(join(resolve(root), write.path), { force: true });
  for (const write of plan.filter((item) => item.action === "create" || item.action === "update")) {
    const target = join(resolve(root), write.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, write.content, "utf8");
  }
};

export const formatPlan = (plan: PlannedWrite[]): string => plan.map((item) => `${item.action.padEnd(8)} ${item.path} (${item.reason}; sha=${hash(item.content)})`).join("\n");

const hasOwnedManifest = (root: string): boolean => {
  const manifest = join(resolve(root), ".agents/aidlc/manifest.json");
  if (!existsSync(manifest)) return false;
  try {
    return JSON.parse(readFileSync(manifest, "utf8")).managedBy === "aidlc-workflow";
  } catch {
    return false;
  }
};

const planUninstallFile = (root: string, spec: FileSpec): PlannedWrite => {
  const target = join(resolve(root), spec.path);
  if (!existsSync(target)) return { ...spec, action: "skip", reason: "not installed" };
  if (spec.path === ".agents/state/BOARD.md") return { ...spec, action: "skip", reason: "preserved user task board" };
  const current = readFileSync(target, "utf8");
  if (spec.strategy === "managed-block") {
    const start = `<!-- aidlc-installer:${spec.owner} -->`;
    const match = current.match(new RegExp(`${start}[\\s\\S]*?(?=\\n<!-- aidlc-installer:|$)`));
    if (!match) return { ...spec, action: "skip", reason: "owned block not found" };
    if (match[0].trimEnd() !== spec.content.trimEnd()) return { ...spec, action: "skip", reason: "managed block was modified; preserved" };
    const next = current.replace(match[0], "").replace(/\n{3,}/g, "\n\n").trimEnd();
    return next ? { ...spec, content: `${next}\n`, action: "update", reason: "remove owned prompt block" } : { ...spec, content: "", action: "delete", reason: "remove owned prompt file" };
  }
  if (spec.path === ".agents/aidlc/manifest.json") return { ...spec, action: "delete", reason: "remove ownership manifest" };
  if (current !== spec.content) return { ...spec, action: "skip", reason: "managed file was modified; preserved" };
  return { ...spec, action: "delete", reason: "remove owned file" };
};

export const planUninstall = (root: string): PlannedWrite[] => {
  if (!hasOwnedManifest(root)) throw new Error("No aidlc-workflow ownership manifest found; refusing to remove files.");
  const adapterFiles = adapters.flatMap((adapter) => adapter.files());
  const plan = [...coreWorkflowFiles(), ...adapterFiles].map((spec) => planUninstallFile(root, spec));
  if (!plan.some((item) => item.action === "skip" && item.reason.includes("was modified"))) return plan;
  return plan.map((item) => item.path === ".agents/aidlc/manifest.json"
    ? { ...item, action: "skip", reason: "retained while modified managed files remain" }
    : item);
};

export const status = (root: string): string => {
  const manifest = join(resolve(root), ".agents/aidlc/manifest.json");
  const agents = detectedAgents(root);
  return [
    `workflow: ${existsSync(manifest) ? "installed" : "not installed"}`,
    `detected agents: ${agents.length ? agents.join(", ") : "none"}`
  ].join("\n");
};

export const doctor = (root: string): string => {
  const manifest = join(resolve(root), ".agents/aidlc/manifest.json");
  if (!existsSync(manifest)) return "ERROR: .agents/aidlc/manifest.json is missing. Run aidlc init --yes.";
  const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { remoteUpdates?: boolean; source?: string };
  if (parsed.remoteUpdates || parsed.source !== "local-package-assets") return "ERROR: workflow manifest violates local-only asset policy.";
  return "OK: local workflow manifest is valid and remote updates are disabled.";
};
