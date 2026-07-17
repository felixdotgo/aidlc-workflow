import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const output = "dist/assets/.agents";
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(".agents/aidlc", join(output, "aidlc"), { recursive: true });
cpSync(".agents/skills", join(output, "skills"), { recursive: true });
writeFileSync(join(output, "state-board.md"), "# AI-DLC BOARD\n\n| id | title | phase | gate | status | branch | submodules | doc |\n|----|-------|-------|------|--------|--------|------------|-----|\n\n_No tasks in flight._\n");
