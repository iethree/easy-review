/**
 * Language-aware tokenising for the diff pane.
 *
 * Highlighting one diff line at a time gets block comments, template literals
 * and multi-line strings wrong, so we tokenise each side of a file as one blob
 * and cut the result back into lines. Tokens come out flat — text plus the
 * joined class names of every enclosing span — because rendering a flat list is
 * far cheaper than rebuilding hljs's nested element tree in React, and the CSS
 * lands the same either way.
 *
 * Only a fixed set of languages is registered: hljs's full catalogue is ~1MB of
 * JavaScript, and auto-detection is both slow and wrong often enough to be
 * annoying. Anything unrecognised renders as plain text.
 */

import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import clojure from "highlight.js/lib/languages/clojure";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";
import type { DiffFile } from "../shared/types.ts";

const lowlight = createLowlight({
  bash,
  c,
  clojure,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  python,
  ruby,
  rust,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
});

/** One run of characters sharing the same highlight classes. */
export interface Token {
  text: string;
  /** Space-separated hljs classes, or "" for unstyled text. */
  className: string;
}

const BY_EXTENSION: Record<string, string> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cjs: "javascript",
  clj: "clojure",
  cljc: "clojure",
  cljs: "clojure",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cxx: "cpp",
  diff: "diff",
  edn: "clojure",
  go: "go",
  h: "c",
  hpp: "cpp",
  htm: "xml",
  html: "xml",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  kt: "kotlin",
  kts: "kotlin",
  less: "scss",
  markdown: "markdown",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  mts: "typescript",
  patch: "diff",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sass: "scss",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svg: "xml",
  swift: "swift",
  toml: "ini",
  ts: "typescript",
  tsx: "typescript",
  vue: "xml",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

/** Files whose name, not extension, says what they are. */
const BY_FILENAME: Record<string, string> = {
  ".gitconfig": "ini",
  ".npmrc": "ini",
  dockerfile: "dockerfile",
  gemfile: "ruby",
  makefile: "bash",
  rakefile: "ruby",
};

/** The hljs language for a path, or null to render it as plain text. */
export function languageForPath(path: string): string | null {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const byName = BY_FILENAME[base];
  if (byName) return byName;
  if (base.startsWith("dockerfile.")) return "dockerfile";

  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return BY_EXTENSION[base.slice(dot + 1)] ?? null;
}

/**
 * Past this many characters on one side of one file, highlighting costs more
 * than it's worth — a generated lockfile or a vendored bundle. Plain text.
 */
export const MAX_HIGHLIGHT_CHARS = 300_000;

interface HastText {
  type: "text";
  value: string;
}
interface HastElement {
  type: "element";
  properties?: { className?: string[] | string };
  children: HastNode[];
}
type HastNode = HastText | HastElement | { type: string };

/**
 * Tokenise `source` as one document and return the tokens for each line.
 *
 * The result always has exactly `source.length` entries, so callers can zip it
 * straight back onto the diff lines they came from. Returns null when the
 * language is unknown or the input is too big to be worth it, meaning "render
 * this as plain text".
 */
export function highlightLines(language: string | null, source: string[]): Token[][] | null {
  if (!language || !lowlight.registered(language)) return null;

  let size = 0;
  for (const line of source) size += line.length + 1;
  if (size > MAX_HIGHLIGHT_CHARS) return null;

  let tree: { children: HastNode[] };
  try {
    tree = lowlight.highlight(language, source.join("\n")) as unknown as { children: HastNode[] };
  } catch {
    // A grammar that throws shouldn't take the diff pane down with it.
    return null;
  }

  const lines: Token[][] = [[]];
  let current = lines[0] as Token[];

  const walk = (nodes: HastNode[], className: string): void => {
    for (const node of nodes) {
      if (node.type === "text") {
        const parts = (node as HastText).value.split("\n");
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) {
            current = [];
            lines.push(current);
          }
          const text = parts[i];
          if (text) current.push({ text, className });
        }
      } else if (node.type === "element") {
        const element = node as HastElement;
        const raw = element.properties?.className;
        const own = Array.isArray(raw) ? raw.join(" ") : (raw ?? "");
        walk(element.children, className && own ? `${className} ${own}` : className || own);
      }
    }
  };
  walk(tree.children, "");

  // hljs shouldn't lose or invent newlines, but if it ever did, a mismatched
  // zip would silently misalign the whole file. Fall back instead.
  if (lines.length !== source.length) return null;
  return lines;
}

/** Where a diff line's tokens come from: the new side, or the old one. */
interface Slot {
  side: "right" | "left";
  index: number;
}

/**
 * Tokens for every line of one file's diff, as `[hunk][line]`.
 *
 * Each side of the file is reconstructed and highlighted as a whole document,
 * so constructs that span lines come out right; the results are then zipped
 * back onto the diff's lines. Null entries are lines with no highlighting to
 * show (the "\ No newline" markers), and a null return means the whole file
 * renders as plain text.
 */
export function tokenizeFile(file: DiffFile): (Token[] | null)[][] | null {
  const language = languageForPath(file.path);
  if (!language || file.isBinary) return null;

  const right: string[] = [];
  const left: string[] = [];
  const slots: (Slot | null)[][] = [];

  for (const hunk of file.hunks) {
    const row: (Slot | null)[] = [];
    for (const line of hunk.lines) {
      if (line.kind === "add") {
        row.push({ side: "right", index: right.length });
        right.push(line.content);
      } else if (line.kind === "del") {
        row.push({ side: "left", index: left.length });
        left.push(line.content);
      } else if (line.kind === "context") {
        // Unchanged lines exist on both sides; the new one is what's shown.
        row.push({ side: "right", index: right.length });
        right.push(line.content);
        left.push(line.content);
      } else {
        row.push(null);
      }
    }
    slots.push(row);
  }

  const rightTokens = right.length > 0 ? highlightLines(language, right) : [];
  const leftTokens = left.length > 0 ? highlightLines(language, left) : [];
  if (!rightTokens && !leftTokens) return null;

  return slots.map((row) =>
    row.map((slot) => {
      if (!slot) return null;
      const source = slot.side === "right" ? rightTokens : leftTokens;
      return source?.[slot.index] ?? null;
    }),
  );
}
