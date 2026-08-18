import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export interface EvalRunner {
  command: string;
  args: string[];
  model: string;
  modelsByCategory?: Record<string, string>;
  version: string;
  timeoutMs?: number;
  adapter?: string;
  protocolVersion?: 1 | 2;
  evidenceKind?: "simulated" | "real";
}

export interface EvaluatorConfig {
  runners: Record<string, EvalRunner>;
  suites: Record<string, string>;
  policy: { maxAgeDays?: number };
}

const id = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const strings = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${label} must be a string array`);
  return value as string[];
};
const relative = (value: string, label: string): string => {
  if (isAbsolute(value) || value === ".." || value.startsWith("../") || value.startsWith("..\\")) throw new Error(`${label} must stay inside the repository`);
  return value;
};

export const loadEvaluatorConfig = (path: string): { config: EvaluatorConfig; root: string } => {
  const raw = object(JSON.parse(readFileSync(path, "utf8")), "evaluator config");
  const runners = Object.fromEntries(Object.entries(object(raw.runners ?? {}, "evaluator config.runners")).map(([name, value]) => {
    if (!id.test(name)) throw new Error(`Invalid evaluator runner id: ${name}`);
    const runner = object(value, `evaluator runner ${name}`);
    if (typeof runner.command !== "string" || !runner.command || isAbsolute(runner.command)) throw new Error(`evaluator runner ${name}.command is invalid`);
    if (typeof runner.model !== "string" || !runner.model.trim() || typeof runner.version !== "string" || !runner.version) throw new Error(`evaluator runner ${name} requires model and version`);
    const protocolVersion = Number(runner.protocolVersion ?? 1);
    const evidenceKind = runner.evidenceKind ?? "simulated";
    if (![1, 2].includes(protocolVersion) || !["simulated", "real"].includes(String(evidenceKind))) throw new Error(`evaluator runner ${name} protocol/evidence kind is invalid`);
    const timeoutMs = Number(runner.timeoutMs ?? 120_000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 3_600_000) throw new Error(`evaluator runner ${name}.timeoutMs is invalid`);
    const modelsByCategory = Object.fromEntries(Object.entries(object(runner.modelsByCategory ?? {}, `evaluator runner ${name}.modelsByCategory`)).map(([category, model]) => {
      if (!id.test(category) || typeof model !== "string" || !model.trim()) throw new Error(`evaluator runner ${name} has invalid category routing`);
      return [category, model];
    }));
    return [name, { command: runner.command, args: strings(runner.args ?? [], `evaluator runner ${name}.args`), model: runner.model, modelsByCategory, version: runner.version, timeoutMs, adapter: typeof runner.adapter === "string" ? runner.adapter : name, protocolVersion: protocolVersion as 1 | 2, evidenceKind: evidenceKind as "simulated" | "real" }];
  })) as Record<string, EvalRunner>;
  const suites = Object.fromEntries(Object.entries(object(raw.suites ?? {}, "evaluator config.suites")).map(([name, value]) => [name, relative(String(value), `evaluator suite ${name}`)]));
  const policyRaw = object(raw.policy ?? {}, "evaluator config.policy"); const maxAgeDays = policyRaw.maxAgeDays === undefined ? undefined : Number(policyRaw.maxAgeDays);
  if (maxAgeDays !== undefined && (!Number.isInteger(maxAgeDays) || maxAgeDays < 1)) throw new Error("evaluator policy maxAgeDays is invalid");
  return { config: { runners, suites, policy: { maxAgeDays } }, root: dirname(resolve(path)) };
};
