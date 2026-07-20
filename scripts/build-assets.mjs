import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const output = "dist/assets/.agents";
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(".agents/aidlc", join(output, "aidlc"), { recursive: true });
cpSync(".agents/skills", join(output, "skills"), { recursive: true });
