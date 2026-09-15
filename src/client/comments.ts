/** Where comments on the code belong in the diff. */

import type { DiffLine, DiffSide } from "../shared/types.ts";

/**
 * Where a comment on this line of the diff would go, in GitHub's terms.
 *
 * A deleted line only exists in the old file, so it takes the left side and
 * its old number; additions and unchanged context take the right side and the
 * new number — note that an unchanged line usually has a different number on
 * each side, and GitHub wants the new one. Getting this backwards puts the
 * comment on a real but unrelated line, which GitHub accepts without
 * complaint, so it is worth being exact about.
 */
export function anchorForLine(line: DiffLine): { side: DiffSide; line: number } | null {
  // The "\ No newline at end of file" marker isn't part of either file.
  if (line.kind === "meta") return null;
  if (line.kind === "del") {
    return line.oldNumber === null ? null : { side: "LEFT", line: line.oldNumber };
  }
  return line.newNumber === null ? null : { side: "RIGHT", line: line.newNumber };
}

/** Identifies one place in a diff: a line on one side of one file. */
export function threadKey(path: string, side: DiffSide, line: number): string {
  return `${path}\n${side}\n${line}`;
}

/** The little of a review thread that deciding where to put it depends on. */
interface AnchorableThread {
  path: string;
  side: DiffSide;
  line: number | null;
  outdated: boolean;
}

/**
 * Group existing threads by the line they belong to.
 *
 * Outdated threads are deliberately left out. GitHub reports them with a null
 * `line` and only the `originalLine` they were written against, which refers
 * to a version of the file this diff no longer shows — placing one by that
 * number would attach someone's comment to whatever code happens to occupy
 * that line today. They still appear in the conversation under the
 * description, labelled with the file and line they were really about.
 */
export function anchorThreads<T extends AnchorableThread>(threads: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const thread of threads) {
    if (thread.line === null || thread.outdated) continue;
    const key = threadKey(thread.path, thread.side, thread.line);
    const existing = map.get(key);
    if (existing) existing.push(thread);
    else map.set(key, [thread]);
  }
  return map;
}
