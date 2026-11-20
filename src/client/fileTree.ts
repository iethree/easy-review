/**
 * The changed files as a tree of directories, for the diff's sidebar: like
 * GitHub's, directories before files, and a directory holding nothing but
 * another directory folded into it ("src/client/components").
 */

import type { DiffFile } from "../shared/types.ts";

export interface TreeDir {
  kind: "dir";
  /** What the row shows: one directory, or a folded chain of them. */
  name: string;
  /** The full path, which also names the row. */
  path: string;
  children: TreeNode[];
}

export interface TreeFile {
  kind: "file";
  name: string;
  path: string;
  /** Where the file is in the diff. */
  index: number;
  file: DiffFile;
}

export type TreeNode = TreeDir | TreeFile;

const byName = (a: TreeNode, b: TreeNode) =>
  a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name);

export function fileTree(files: readonly DiffFile[]): TreeNode[] {
  const root: TreeDir = { kind: "dir", name: "", path: "", children: [] };

  files.forEach((file, index) => {
    const parts = file.path.split("/").filter(Boolean);
    const name = parts.pop() ?? file.path;
    let dir = root;
    for (const part of parts) {
      const path = dir.path ? `${dir.path}/${part}` : part;
      let next = dir.children.find((c): c is TreeDir => c.kind === "dir" && c.path === path);
      if (!next) {
        next = { kind: "dir", name: part, path, children: [] };
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({ kind: "file", name, path: file.path, index, file });
  });

  return finish(root).children;
}

/** Sorts each directory, and folds one that holds only a directory into it. */
function finish(dir: TreeDir): TreeDir {
  let node = dir;
  while (node.path && node.children.length === 1 && node.children[0]?.kind === "dir") {
    const only = node.children[0];
    node = { ...only, name: `${node.name}/${only.name}` };
  }
  const children = node.children.map((c) => (c.kind === "dir" ? finish(c) : c)).sort(byName);
  return { ...node, children };
}

/** Every directory's path: what "all open" means for the tree. */
export function dirPaths(nodes: readonly TreeNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.kind !== "dir") continue;
    out.push(node.path);
    out.push(...dirPaths(node.children));
  }
  return out;
}
