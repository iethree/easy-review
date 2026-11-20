import {
  IconChevronDown,
  IconChevronRight,
  IconFile,
  IconFileArrowRight,
  IconFileMinus,
  IconFilePlus,
  IconFolder,
  IconFolderOpen,
} from "@tabler/icons-react";
import { memo, useState } from "react";
import type { DiffFile } from "../../shared/types.ts";
import type { TreeNode } from "../fileTree.ts";

const FILE_ICON: Record<DiffFile["kind"], { Icon: typeof IconFile; color: string; label: string }> = {
  added: { Icon: IconFilePlus, color: "teal", label: "added" },
  deleted: { Icon: IconFileMinus, color: "red", label: "deleted" },
  renamed: { Icon: IconFileArrowRight, color: "violet", label: "renamed" },
  modified: { Icon: IconFile, color: "gray", label: "" },
};

interface Props {
  tree: TreeNode[];
  /** The file being read: the one at the top of the diff. */
  active: number | null;
  onSelect: (index: number) => void;
}

/** The changed files by directory, beside the diff; a file's row goes to it. */
export const FileTree = memo(function FileTree({ tree, active, onSelect }: Props) {
  // Directories you've folded; everything starts open.
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (path: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const rows = (nodes: TreeNode[], depth: number): React.ReactNode[] =>
    nodes.flatMap((node) => {
      const indent = { paddingLeft: 6 + depth * 14 };
      if (node.kind === "dir") {
        const open = !closed.has(node.path);
        const Folder = open ? IconFolderOpen : IconFolder;
        return [
          <button
            key={`d:${node.path}`}
            type="button"
            className="er-tree-row"
            style={indent}
            title={node.path}
            aria-expanded={open}
            onClick={() => toggle(node.path)}
          >
            {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            <Folder size={14} className="er-tree-icon" />
            <span className="er-tree-name">{node.name}</span>
          </button>,
          ...(open ? rows(node.children, depth + 1) : []),
        ];
      }
      const { Icon, color, label } = FILE_ICON[node.file.kind];
      return [
        <button
          key={`f:${node.index}`}
          type="button"
          className="er-tree-row"
          style={{ ...indent, paddingLeft: indent.paddingLeft + 12 }}
          title={label ? `${node.path} (${label})` : node.path}
          aria-current={active === node.index ? "true" : undefined}
          onClick={() => onSelect(node.index)}
        >
          <Icon size={14} color={`var(--mantine-color-${color}-6)`} className="er-tree-icon" />
          <span className="er-tree-name">{node.name}</span>
        </button>,
      ];
    });

  return (
    <nav className="er-tree" aria-label="Changed files">
      {rows(tree, 0)}
    </nav>
  );
});
