/**
 * Claude's review, cut into the pieces you can pick from: each paragraph,
 * list item, quote or code block, as the Markdown it was written in. Parsed
 * with the same parser that renders it, so the pieces are what you see.
 */

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export interface ProseBlock {
  /** The block's own Markdown. */
  text: string;
  /** Headings and rules frame the review; they aren't points to add, and nor are diagrams. */
  addable: boolean;
}

const parser = unified().use(remarkParse).use(remarkGfm);

export function splitProse(markdown: string): ProseBlock[] {
  const tree = parser.parse(markdown);
  const slice = (node: { position?: { start: { offset?: number }; end: { offset?: number } } }) =>
    markdown.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0);

  const blocks: ProseBlock[] = [];
  for (const node of tree.children) {
    if (node.type === "list") {
      // Each item on its own: a list of points is the usual shape of a review.
      for (const item of node.children) blocks.push({ text: slice(item), addable: true });
    } else {
      // Nor is a diagram: GitHub would show it as code.
      const diagram = node.type === "code" && node.lang === "reladraw";
      blocks.push({ text: slice(node), addable: node.type !== "heading" && node.type !== "thematicBreak" && !diagram });
    }
  }
  return blocks;
}

export interface CodeRef {
  path: string;
  line: number;
  startLine?: number;
}

const REF = /([\w@./-]+\.[A-Za-z0-9]+):(\d+)(?:\s*[-–]\s*(\d+))?/g;

/** Every `file.ts:12` or `file.ts:12–15` the text points at, once each. */
export function findCodeRefs(text: string): CodeRef[] {
  const seen = new Map<string, CodeRef>();
  for (const m of text.matchAll(REF)) {
    const [, path = "", a = "", b] = m;
    if (/^https?:/.test(path) || path.includes("//")) continue;
    const first = Number(a);
    const last = b ? Number(b) : first;
    const ref: CodeRef =
      last > first ? { path: path.replace(/^\.?\//, ""), startLine: first, line: last } : { path: path.replace(/^\.?\//, ""), line: first };
    seen.set(`${ref.path}:${ref.startLine ?? ""}:${ref.line}`, ref);
  }
  return [...seen.values()];
}

/** A list item's text without its bullet, for posting as a comment on its own. */
export function withoutMarker(text: string): string {
  return text.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim();
}
