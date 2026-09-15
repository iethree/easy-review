/** Where local reviews keep their state. */

import { homedir } from "node:os";
import { join } from "node:path";

/** Overridable so tests can point it at a temporary directory. */
export function rootDir(): string {
  return process.env.EASY_REVIEW_HOME ?? join(homedir(), ".easy-review");
}

export function localPaths() {
  const root = rootDir();
  return {
    root,
    config: join(root, "config.json"),
    /** One JSON file per review job. */
    reviews: join(root, "reviews"),
    /** Checked-out pull requests, one per repo/number/commit. */
    worktrees: join(root, "worktrees"),
    /** Clones we made ourselves, for repos you don't have locally. */
    repos: join(root, "repos"),
  };
}

export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}
