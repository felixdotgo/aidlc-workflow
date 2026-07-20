#!/usr/bin/env node
import { verifyReleaseEvidence } from "./release.js";
import { packageVersion } from "./workflow.js";

const path = process.argv[2] ?? ".aidlc/release-eval.json";
try {
  const evidence = verifyReleaseEvidence(path, packageVersion());
  console.log(`OK: ${evidence.reports.length} pinned economy runners passed the AI-DLC ${evidence.packageVersion} release gate.`);
} catch (error) {
  console.error(`RELEASE BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
