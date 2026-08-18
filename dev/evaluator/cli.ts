#!/usr/bin/env node
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { evaluationPassed, loadEvalSuite, runEvaluation } from "./eval.js";
import { loadEvaluatorConfig } from "./config.js";

const usage = "Usage: node dist/dev/evaluator/cli.js list|doctor|run|verify-release [--config dev/evaluator/config.json]";
const value = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1];
};
const flags = (args: string[]): Set<string> => new Set(args.filter((item) => item.startsWith("--")));
const configPath = (args: string[]): string => resolve(value(args, "--config") ?? "dev/evaluator/config.json");
const outputPath = (root: string, value: string): string => {
  if (isAbsolute(value)) throw new Error("--output must stay inside the evaluation target");
  const target = resolve(root, value); if (!target.startsWith(`${resolve(root)}/`)) throw new Error("--output must stay inside the evaluation target");
  return target;
};
const main = (): void => {
  const [command = "help", ...args] = process.argv.slice(2); if (command === "help" || command === "--help") return void console.log(usage);
  const { config, root: configRoot } = loadEvaluatorConfig(configPath(args));
  if (command === "list") return void console.log(JSON.stringify({ runners: Object.keys(config.runners), suites: ["official", ...Object.keys(config.suites)] }, null, 2));
  if (command === "doctor") {
    const suites = [undefined, ...Object.values(config.suites)].map((path) => loadEvalSuite(path ? resolve(configRoot, path) : undefined));
    console.log(JSON.stringify({ runners: Object.keys(config.runners), suites: suites.map((suite) => ({ suiteId: suite.suiteId, version: suite.version, releaseEligible: suite.releaseEligible })) }, null, 2)); return;
  }
  if (command !== "run") throw new Error(`Unknown evaluator command: ${command}`);
  const runnerId = value(args, "--runner"); const runner = runnerId ? config.runners[runnerId] : undefined; if (!runnerId || !runner) throw new Error("run requires a configured --runner");
  const targetRoot = resolve(value(args, "--root") ?? "."); const suiteId = value(args, "--suite"); const suitePath = suiteId && suiteId !== "official" ? resolve(configRoot, config.suites[suiteId] ?? suiteId) : undefined;
  const report = runEvaluation(runnerId, runner, targetRoot, { suitePath, scenario: value(args, "--scenario"), category: value(args, "--category"), repeat: value(args, "--repeat") ? Number(value(args, "--repeat")) : 1, progress: (message) => console.error(message) });
  const output = value(args, "--output") ?? `.agents/data/evaluation/report-${runnerId}-${report.executionId}.json`; { const target = outputPath(targetRoot, output); if (existsSync(target)) throw new Error(`Refusing to overwrite existing evaluation report: ${output}`); mkdirSync(dirname(target), { recursive: true }); const temporary = `${target}.tmp-${process.pid}`; try { writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`); renameSync(temporary, target); } finally { if (existsSync(temporary)) rmSync(temporary, { force: true }); } }
  console.log(JSON.stringify(report, null, 2)); if (!evaluationPassed(report)) process.exitCode = 1;
};
try { main(); } catch (error) { console.error(`aidlc evaluator: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
