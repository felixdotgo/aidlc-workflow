import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileSpec } from "./model.js";

const owner = "aidlc-core";
const assetRoot = fileURLToPath(new URL("../assets/.agents", import.meta.url));

const collect = (directory: string, target: string): FileSpec[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const source = join(directory, entry.name);
  const destination = `${target}/${entry.name}`;
  return entry.isDirectory() ? collect(source, destination) : [{ path: destination, content: readFileSync(source, "utf8"), owner }];
});

export const coreWorkflowFiles = (): FileSpec[] => [
  {
    path: ".agents/aidlc/manifest.json",
    owner,
    content: JSON.stringify({ schemaVersion: 1, workflow: "AI-DLC", source: "local-package-assets", remoteUpdates: false, managedBy: "aidlc-workflow" }, null, 2) + "\n"
  },
  ...collect(join(assetRoot, "aidlc"), ".agents/aidlc"),
  ...collect(join(assetRoot, "skills"), ".agents/skills"),
  { path: ".agents/state/BOARD.md", owner, content: readFileSync(join(assetRoot, "state-board.md"), "utf8") }
];
