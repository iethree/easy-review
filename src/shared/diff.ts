/**
 * Unified-diff parser for GitHub's `application/vnd.github.v3.diff` payloads.
 *
 * Single pass, no backtracking regexes — a 20k-line diff parses in a few ms,
 * which is what keeps the "open the modal instantly" promise honest.
 */

import type { DiffFile, DiffHunk, ParsedDiff } from "./types.ts";

/** Diffs above this are cut short rather than blowing up the client. */
export const MAX_DIFF_BYTES = 2_000_000;

/**
 * GitHub refuses to render a diff beyond this many lines (HTTP 406,
 * `too_large`). Knowing the ceiling lets us skip the request entirely.
 */
export const GITHUB_DIFF_LINE_LIMIT = 20_000;

export const TOO_LARGE_MESSAGE =
  "GitHub will not serve a diff this large (over 20,000 lines). Open it on GitHub to review.";

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

interface FileAccumulator extends DiffFile {
  hunks: DiffHunk[];
}

function newFile(path: string, oldPath: string | null): FileAccumulator {
  return {
    path,
    oldPath,
    kind: "modified",
    additions: 0,
    deletions: 0,
    isBinary: false,
    hunks: [],
  };
}

/**
 * `diff --git a/foo b/bar` — paths may contain spaces, so we can't just split.
 * We look for the ` b/` that splits the line into two halves of equal shape.
 */
function parseGitHeader(line: string): { oldPath: string; newPath: string } | null {
  const rest = line.slice("diff --git ".length);
  // Quoted paths (non-ASCII / special chars) come as "a/path" "b/path".
  if (rest.startsWith('"')) {
    const parts = rest.match(/^"(.*)"\s+"(.*)"$/);
    if (parts?.[1] && parts[2]) {
      return { oldPath: stripPrefix(unescapePath(parts[1])), newPath: stripPrefix(unescapePath(parts[2])) };
    }
  }
  for (let i = 0; i < rest.length - 3; i++) {
    if (rest.startsWith(" b/", i)) {
      const left = rest.slice(0, i);
      const right = rest.slice(i + 1);
      if (left.startsWith("a/")) {
        return { oldPath: stripPrefix(left), newPath: stripPrefix(right) };
      }
    }
  }
  return null;
}

function stripPrefix(p: string): string {
  if (p.startsWith("a/") || p.startsWith("b/")) return p.slice(2);
  return p;
}

function unescapePath(p: string): string {
  return p.replace(/\\(.)/g, "$1");
}

export function parseDiff(raw: string): ParsedDiff {
  let truncated = false;
  let text = raw;
  if (text.length > MAX_DIFF_BYTES) {
    text = text.slice(0, MAX_DIFF_BYTES);
    truncated = true;
  }

  const files: FileAccumulator[] = [];
  let file: FileAccumulator | null = null;
  let hunk: DiffHunk | null = null;
  let oldNumber = 0;
  let newNumber = 0;

  const lines = text.split("\n");
  // A newline-terminated diff leaves a trailing "" that is not a real line.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    if (line.startsWith("diff --git ")) {
      const header = parseGitHeader(line);
      file = newFile(header?.newPath ?? "unknown", header?.oldPath ?? null);
      files.push(file);
      hunk = null;
      continue;
    }

    if (file === null) continue;

    if (hunk === null) {
      // Still in the per-file header block.
      if (line.startsWith("new file mode")) {
        file.kind = "added";
        continue;
      }
      if (line.startsWith("deleted file mode")) {
        file.kind = "deleted";
        continue;
      }
      if (line.startsWith("rename from ")) {
        file.kind = "renamed";
        file.oldPath = line.slice("rename from ".length);
        continue;
      }
      if (line.startsWith("rename to ")) {
        file.kind = "renamed";
        file.path = line.slice("rename to ".length);
        continue;
      }
      if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
        file.isBinary = true;
        continue;
      }
      if (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("index ") || line.startsWith("similarity index") || line.startsWith("old mode") || line.startsWith("new mode")) {
        continue;
      }
    }

    const hunkMatch = HUNK_RE.exec(line);
    if (hunkMatch) {
      oldNumber = Number(hunkMatch[1] ?? 0);
      newNumber = Number(hunkMatch[3] ?? 0);
      hunk = { header: (hunkMatch[5] ?? "").trim(), lines: [] };
      file.hunks.push(hunk);
      continue;
    }

    if (hunk === null) continue;

    const marker = line.charAt(0);

    if (marker === "+") {
      hunk.lines.push({ kind: "add", content: line.slice(1), oldNumber: null, newNumber });
      newNumber++;
      file.additions++;
      continue;
    }
    if (marker === "-") {
      hunk.lines.push({ kind: "del", content: line.slice(1), oldNumber, newNumber: null });
      oldNumber++;
      file.deletions++;
      continue;
    }
    if (marker === "\\") {
      // "\ No newline at end of file"
      hunk.lines.push({ kind: "meta", content: line.slice(2), oldNumber: null, newNumber: null });
      continue;
    }
    if (marker === " " || line === "") {
      hunk.lines.push({ kind: "context", content: line.slice(1), oldNumber, newNumber });
      oldNumber++;
      newNumber++;
      continue;
    }

    // Anything else means we've walked off the end of the hunk.
    hunk = null;
  }

  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions;
    deletions += f.deletions;
  }

  return { files, additions, deletions, truncated };
}

/** Total rendered line count — drives the popover-vs-modal decision. */
export function diffLineCount(diff: ParsedDiff): number {
  let n = 0;
  for (const file of diff.files) {
    for (const hunk of file.hunks) n += hunk.lines.length;
  }
  return n;
}
