import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

rmSync("dist", { recursive: true, force: true });
const output = "dist/assets/.agents";
mkdirSync(output, { recursive: true });
cpSync("assets/aidlc", join(output, "aidlc"), { recursive: true });
cpSync("skills", join(output, "skills"), { recursive: true });
cpSync("services/mcp-state", "dist/services/mcp-state", { recursive: true, filter: (path) => !path.includes("node_modules") });
cpSync("assets/aidlc/scripts/lib/store.mjs", "dist/services/mcp-state/src/lifecycle-core.mjs");
cpSync("dev/evaluator/assets", "dist/dev/evaluator/assets", { recursive: true });
