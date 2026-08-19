import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve("src/cli.ts"), "utf8");

test("CLI loads Inquirer checkbox prompts only for interactive terminals while retaining non-interactive flag guidance", () => {
  assert.match(source, /const prompts = async \(\) => import\("@inquirer\/prompts"\)/);
  assert.match(source, /message: "Select one or more agents"/);
  assert.match(source, /required: true/);
  assert.match(source, /Use --agent <name> or --all/);
  assert.match(source, /◆ \$\{operation\} preview/);
});

test("CLI preserves the human-only upgrade boundary", () => {
  assert.match(source, /upgrade does not support --yes or --force/);
  assert.match(source, /Upgrade apply requires an interactive TTY/);
  assert.match(source, /Type \$\{expected\} to apply this user-initiated upgrade/);
});
