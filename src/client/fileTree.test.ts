import { expect, test } from "bun:test";
import type { DiffFile } from "../shared/types.ts";
import { dirPaths, fileTree, type TreeNode } from "./fileTree.ts";

const file = (path: string): DiffFile =>
  ({ path, oldPath: null, kind: "modified", additions: 1, deletions: 0, isBinary: false, hunks: [] }) as unknown as DiffFile;

/** The tree as indented lines, to compare at a glance. */
function show(nodes: TreeNode[], depth = 0): string[] {
  return nodes.flatMap((n) => [
    `${"  ".repeat(depth)}${n.kind === "dir" ? `${n.name}/` : `${n.name} #${n.index}`}`,
    ...(n.kind === "dir" ? show(n.children, depth + 1) : []),
  ]);
}

test("directories before files, and a directory of one directory folded in", () => {
  const tree = fileTree(
    ["README.md", "src/client/components/A.tsx", "src/client/components/B.tsx", "src/client/app.css", "src/server/x.ts"].map(
      file,
    ),
  );
  expect(show(tree)).toEqual([
    "src/",
    "  client/",
    "    components/",
    "      A.tsx #1",
    "      B.tsx #2",
    "    app.css #3",
    "  server/",
    "    x.ts #4",
    "README.md #0",
  ]);
});

test("a deep chain with files only at the bottom shows as one row", () => {
  const tree = fileTree(["a/b/c/d.ts", "a/b/c/e.ts"].map(file));
  expect(show(tree)).toEqual(["a/b/c/", "  d.ts #0", "  e.ts #1"]);
  expect(tree[0]?.path).toBe("a/b/c");
  expect(dirPaths(tree)).toEqual(["a/b/c"]);
});

test("files at the top level stay there", () => {
  expect(show(fileTree(["b.ts", "a.ts"].map(file)))).toEqual(["a.ts #1", "b.ts #0"]);
});
