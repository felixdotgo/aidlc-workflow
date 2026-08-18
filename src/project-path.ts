import { existsSync, lstatSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const resolveProjectPath = (root: string, path: string, escapeMessage: string): string => {
  const project = resolve(root); const target = resolve(project, path); const fromRoot = relative(project, target);
  if (!path || isAbsolute(path) || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error(`${escapeMessage}: ${path}`);
  return target;
};

export const resolveProjectPathWithoutSymlinks = (root: string, path: string, escapeMessage: string, symlinkMessage: string): string => {
  const target = resolveProjectPath(root, path, escapeMessage);
  let cursor = resolve(root);
  for (const part of relative(cursor, target).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`${symlinkMessage}: ${path}`);
  }
  return target;
};
