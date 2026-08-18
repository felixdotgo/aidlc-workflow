import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EvalReport } from "./eval.js";
import { evalSuiteDigest, loadEvalSuite, recomputeReportGate, releaseReady, reportIntegrityErrors } from "./eval.js";

export interface ReleaseEvidence {
  schemaVersion: 2;
  packageVersion: string;
  createdAt: string;
  reports: EvalReport[];
  legacyReports?: unknown[];
}

export interface ReleasePolicy {
  maxAgeDays?: number;
  requiredAdapters?: string[];
}

const rejectUnknown = (value: unknown, allowed: Set<string>, label: string): void => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)); if (unknown.length) throw new Error(`${label} has unknown fields: ${unknown.join(", ")}`);
};
const envelopeFields = new Set(["schemaVersion", "packageVersion", "createdAt", "reports", "legacyReports"]);
const reportFields = new Set(["schemaVersion", "runner", "adapter", "model", "modelsByCategory", "version", "protocolVersion", "evidenceKind", "executionId", "suiteId", "suiteVersion", "suiteDigest", "releaseEligibleSuite", "createdAt", "durationMs", "scenarios", "repeats", "completionRate", "averageScore", "criticalViolations", "dimensions", "categories", "telemetry", "passedReleaseGate", "results"]);
const resultFields = new Set(["id", "category", "model", "repeat", "completed", "score", "assertions", "usage", "diagnostics"]);
const assertionFields = new Set(["id", "dimension", "severity", "passed", "detail"]);
const usageFields = new Set(["inputTokens", "outputTokens", "contextChars", "latencyMs", "costUsd"]);

const adapterId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const requiredAdapters = (policy: ReleasePolicy): string[] => {
  const adapters = policy.requiredAdapters ?? ["codex", "claude"];
  if (!adapters.length || adapters.some((adapter) => !adapterId.test(adapter)) || new Set(adapters).size !== adapters.length) throw new Error("Release policy requires unique valid adapter IDs");
  return adapters;
};

export const verifyReleaseEvidence = (path: string, expectedVersion: string, policy: ReleasePolicy = {}): ReleaseEvidence => {
  const adapters = requiredAdapters(policy);
  const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as unknown; rejectUnknown(parsed, envelopeFields, "Release evidence"); const value = parsed as Partial<ReleaseEvidence>;
  if (value.schemaVersion !== 2 || value.packageVersion !== expectedVersion || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || new Date(Date.parse(value.createdAt)).toISOString() !== value.createdAt || !Array.isArray(value.reports)) throw new Error(`Release evidence must use schema v2, an ISO timestamp, and target package ${expectedVersion}`);
  const reports = value.reports;
  if (policy.maxAgeDays !== undefined && Date.now() - Date.parse(value.createdAt) > policy.maxAgeDays * 86_400_000) throw new Error(`Release evidence is older than ${policy.maxAgeDays} days`);
  const missingAdapters = adapters.filter((adapter) => !reports.some((report) => report.adapter === adapter));
  if (missingAdapters.length) throw new Error(`Release evidence requires real adapters: ${missingAdapters.join(", ")}`);
  const official = loadEvalSuite();
  const officialIdentity = `${official.suiteId}:${official.version}:${evalSuiteDigest(official)}`;
  const suiteDigests = new Set(reports.map((report) => `${report.suiteId}:${report.suiteVersion}:${report.suiteDigest}`));
  if (suiteDigests.size !== 1 || !suiteDigests.has(officialIdentity)) throw new Error("Release reports must use the bundled pinned official suite");
  for (const report of reports) {
    rejectUnknown(report, reportFields, `Runner ${report?.runner ?? "unknown"} report`);
    if (!report.model || !report.version || !report.executionId || !report.results?.length) throw new Error(`Runner ${report.runner} is not pinned or lacks raw results`);
    for (const result of report.results) { rejectUnknown(result, resultFields, `Runner ${report.runner} result`); rejectUnknown(result.usage, usageFields, `Runner ${report.runner} usage`); for (const assertion of result.assertions ?? []) rejectUnknown(assertion, assertionFields, `Runner ${report.runner} assertion`); }
    if (!report.createdAt || !Number.isFinite(Date.parse(report.createdAt)) || new Date(Date.parse(report.createdAt)).toISOString() !== report.createdAt) throw new Error(`Runner ${report.runner} has an invalid ISO timestamp`);
    if (policy.maxAgeDays !== undefined && Date.now() - Date.parse(report.createdAt) > policy.maxAgeDays * 86_400_000) throw new Error(`Runner ${report.runner} evidence is older than ${policy.maxAgeDays} days`);
    const officialCategories = new Map(official.scenarios.map((scenario) => [scenario.id, scenario.category]));
    if (report.results.some((result) => officialCategories.get(result.id) !== result.category)) throw new Error(`Runner ${report.runner} has scenario categories that do not match the official suite`);
    const integrity = reportIntegrityErrors(report); if (integrity.length) throw new Error(`Runner ${report.runner} has invalid raw results: ${integrity.join("; ")}`);
    if (report.scenarios !== official.scenarios.length || new Set(report.results.map((item) => item.id)).size !== official.scenarios.length || official.scenarios.some((scenario) => !report.results.some((item) => item.id === scenario.id))) throw new Error(`Runner ${report.runner} did not execute the full official suite`);
    if (report.passedReleaseGate !== recomputeReportGate(report)) throw new Error(`Runner ${report.runner} persisted verdict does not match raw results`);
  }
  if (!releaseReady(reports, adapters)) throw new Error("Real-runner release thresholds were not met");
  return value as ReleaseEvidence;
};
