import { expect, test } from "bun:test";
import type { DiffLine } from "../shared/types.ts";
import { anchorForLine, anchorThreads, threadKey } from "./comments.ts";

const line = (over: Partial<DiffLine>): DiffLine => ({
  kind: "context",
  content: "",
  oldNumber: 1,
  newNumber: 1,
  ...over,
});

test("a deleted line is commented on the old side, by its old number", () => {
  expect(anchorForLine(line({ kind: "del", oldNumber: 40, newNumber: null }))).toEqual({
    side: "LEFT",
    line: 40,
  });
});

test("an added line is commented on the new side", () => {
  expect(anchorForLine(line({ kind: "add", oldNumber: null, newNumber: 356 }))).toEqual({
    side: "RIGHT",
    line: 356,
  });
});

/** An unchanged line sits at a different number on each side; GitHub wants the new one. */
test("an unchanged line takes its new number, not its old one", () => {
  expect(anchorForLine(line({ kind: "context", oldNumber: 356, newNumber: 357 }))).toEqual({
    side: "RIGHT",
    line: 357,
  });
});

test("the no-newline marker is not a place you can comment", () => {
  expect(anchorForLine(line({ kind: "meta", oldNumber: null, newNumber: null }))).toBeNull();
});

const thread = (over: Partial<Parameters<typeof anchorThreads>[0][number]> & { id?: string } = {}) => ({
  id: "t1",
  path: "src/app.ts",
  side: "RIGHT" as const,
  line: 10 as number | null,
  outdated: false,
  ...over,
});

test("a live thread is placed at its path, side and line", () => {
  const map = anchorThreads([thread()]);
  expect(map.get(threadKey("src/app.ts", "RIGHT", 10))?.map((t) => t.id)).toEqual(["t1"]);
});

/**
 * The one that matters. GitHub gives an outdated thread a null `line` and only
 * the `originalLine` it was written against — a line number from a version of
 * the file this diff no longer shows. Anchoring by it would put someone's
 * comment against code they never saw.
 */
test("an outdated thread is never placed in the diff", () => {
  const map = anchorThreads([thread({ id: "stale", outdated: true, line: 594 })]);
  expect(map.size).toBe(0);
});

test("a thread with no line at all is skipped", () => {
  expect(anchorThreads([thread({ line: null })]).size).toBe(0);
});

test("several threads on one line are kept together, in order", () => {
  const map = anchorThreads([thread({ id: "first" }), thread({ id: "second" })]);
  expect(map.get(threadKey("src/app.ts", "RIGHT", 10))?.map((t) => t.id)).toEqual([
    "first",
    "second",
  ]);
});

test("the same line number on each side is two different places", () => {
  const map = anchorThreads([
    thread({ id: "new", side: "RIGHT" }),
    thread({ id: "old", side: "LEFT" }),
  ]);
  expect(map.size).toBe(2);
  expect(map.get(threadKey("src/app.ts", "LEFT", 10))?.[0]?.id).toBe("old");
});

test("the same line number in two files is two different places", () => {
  const map = anchorThreads([thread({ id: "a" }), thread({ id: "b", path: "src/other.ts" })]);
  expect(map.size).toBe(2);
});
