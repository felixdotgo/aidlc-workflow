import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EvalReport } from "./eval.js";
import { releaseReady } from "./eval.js";

export interface ReleaseEvidence {
  packageVersion: string;
  createdAt: string;
  reports: EvalReport[];
}

export const verifyReleaseEvidence = (path: string, expectedVersion: string): ReleaseEvidence => {
  const value = JSON.parse(readFileSync(resolve(path), "utf8")) as Partial<ReleaseEvidence>;
  if (value.packageVersion !== expectedVersion || typeof value.createdAt !== "string" || !Array.isArray(value.reports)) throw new Error(`Release evidence must target package ${expectedVersion}`);
  if (new Set(value.reports.map((report) => report.runner)).size < 1) throw new Error("Release evidence requires one economy runner");
  for (const report of value.reports) {
    if (!report.model || !report.version || report.scenarios !== 30) throw new Error(`Runner ${report.runner} is not pinned or did not run all 30 scenarios`);
  }
  if (!releaseReady(value.reports)) throw new Error("Economy-model release thresholds were not met");
  return value as ReleaseEvidence;
};
