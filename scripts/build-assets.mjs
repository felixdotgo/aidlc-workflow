import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

rmSync("dist", { recursive: true, force: true });
const output = "dist/assets/.agents";
mkdirSync(output, { recursive: true });
cpSync("assets/aidlc", join(output, "aidlc"), { recursive: true });
cpSync("skills", join(output, "skills"), { recursive: true });
cpSync("dev/evaluator/assets", "dist/dev/evaluator/assets", { recursive: true });
