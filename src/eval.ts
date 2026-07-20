import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvalRunner } from "./model.js";

const suitePath = fileURLToPath(new URL("../assets/.agents/aidlc/eval/scenarios.json", import.meta.url));

export interface EvalScenario {
  id: string;
  category: "clarify" | "plan" | "build" | "spec-conflict" | "state-recovery" | "upgrade-customization";
  prompt: string;
  requiredTerms: string[];
  forbiddenTerms: string[];
  maxContextChars: number;
}

export interface RunnerResult {
  status: "pass" | "fail";
  transcript: string;
  usage?: { inputTokens?: number; outputTokens?: number; contextChars?: number };
  diagnostics?: string[];
}

export interface EvalReport {
  runner: string;
  model: string;
  version: string;
  scenarios: number;
  completionRate: number;
  averageScore: number;
  structuralCompliance: number;
  criticalViolations: number;
  medianContextChars: number;
  contextReduction: number;
  passedReleaseGate: boolean;
  results: Array<{ id: string; score: number; completed: boolean; violations: string[]; contextChars: number }>;
}

export const loadEvalSuite = (): EvalScenario[] => {
  const scenarios = JSON.parse(readFileSync(suitePath, "utf8")) as EvalScenario[];
  if (!Array.isArray(scenarios) || scenarios.length !== 30) throw new Error("The economy eval suite must contain exactly 30 scenarios");
  return scenarios;
};

const parseRunnerResult = (stdout: string, id: string): RunnerResult => {
  try {
    const result = JSON.parse(stdout) as RunnerResult;
    if (!result || !["pass", "fail"].includes(result.status) || typeof result.transcript !== "string") throw new Error("invalid shape");
    return result;
  } catch {
    throw new Error(`Runner returned invalid JSON for ${id}`);
  }
};

export const scoreScenario = (scenario: EvalScenario, result: RunnerResult): { score: number; violations: string[] } => {
  const transcript = result.transcript.toLowerCase();
  const missing = scenario.requiredTerms.filter((term) => !transcript.includes(term.toLowerCase()));
  const forbidden = scenario.forbiddenTerms.filter((term) => transcript.includes(term.toLowerCase()));
  const contextChars = result.usage?.contextChars;
  const missingUsage = !Number.isFinite(contextChars);
  const overBudget = !missingUsage && contextChars! > scenario.maxContextChars;
  const violations = [...missing.map((term) => `missing:${term}`), ...forbidden.map((term) => `forbidden:${term}`), ...(missingUsage ? ["missing:usage.contextChars"] : []), ...(overBudget ? ["context-budget"] : [])];
  const correctness = result.status === "pass" ? 4 : 0;
  const fidelity = missing.length ? Math.max(0, 2 - missing.length) : 2;
  const verification = result.diagnostics?.some((item) => /test|lint|check|evidence/i.test(item)) ? 2 : 1;
  const integrity = forbidden.length ? 0 : 1;
  const efficiency = overBudget || missingUsage ? 0 : 1;
  return { score: correctness + fidelity + verification + integrity + efficiency, violations };
};

export const runEvaluation = (runnerId: string, runner: EvalRunner): EvalReport => {
  const results = loadEvalSuite().map((scenario) => {
    const workspace = mkdtempSync(join(tmpdir(), `aidlc-eval-${scenario.id}-`));
    try {
      const execution = spawnSync(runner.command, runner.args, {
        input: JSON.stringify(scenario), encoding: "utf8", timeout: runner.timeoutMs ?? 120_000, cwd: workspace,
        env: { ...process.env, AIDLC_EVAL_WORKSPACE: workspace, AIDLC_EVAL_MODEL: runner.model, AIDLC_EVAL_VERSION: runner.version }, shell: false
      });
      if (execution.error) throw new Error(`Runner failed for ${scenario.id}: ${execution.error.message}`);
      if (execution.status !== 0) throw new Error(`Runner exited ${execution.status} for ${scenario.id}: ${execution.stderr}`);
      const output = parseRunnerResult(execution.stdout, scenario.id);
      const evaluated = scoreScenario(scenario, output);
      return { id: scenario.id, score: evaluated.score, completed: output.status === "pass", violations: evaluated.violations, contextChars: output.usage?.contextChars ?? Number.POSITIVE_INFINITY };
    } finally { rmSync(workspace, { recursive: true, force: true }); }
  });
  const completionRate = results.filter((item) => item.completed).length / results.length;
  const averageScore = results.reduce((total, item) => total + item.score, 0) / results.length;
  const structuralCompliance = results.filter((item) => !item.violations.some((value) => value.startsWith("forbidden:"))).length / results.length;
  const criticalViolations = results.reduce((total, item) => total + item.violations.filter((value) => value.startsWith("forbidden:")).length, 0);
  const contexts = results.map((item) => item.contextChars).sort((a, b) => a - b);
  const medianContextChars = contexts[Math.floor(contexts.length / 2)];
  const contextReduction = Number.isFinite(medianContextChars) ? 1 - medianContextChars / 34_000 : 0;
  return {
    runner: runnerId,
    model: runner.model,
    version: runner.version,
    scenarios: results.length,
    completionRate,
    averageScore,
    structuralCompliance,
    criticalViolations,
    medianContextChars,
    contextReduction,
    passedReleaseGate: averageScore >= 8 && completionRate >= 0.85 && structuralCompliance === 1 && criticalViolations === 0 && contextReduction >= 0.5,
    results
  };
};

/** Manual/local release mode accepts one fully passing pinned runner. */
export const releaseReady = (reports: EvalReport[]): boolean => reports.length >= 1 && reports.every((report) => report.passedReleaseGate);
