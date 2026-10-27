import { expect, test } from "bun:test";
import { findCodeRefs, splitProse, withoutMarker } from "./proseBlocks.ts";

const REVIEW = `## Verdict

Approve, with one fix.

- **Null check** at \`src/a.ts:12\`: \`user\` can be null.
- The retry loop in src/b.ts:40–44 never backs off.
  - nested detail stays with its item

1. First
2. Second

---

> Quoted
`;

test("a review splits into its paragraphs and each list item, as written", () => {
  const blocks = splitProse(REVIEW);
  expect(blocks.map((b) => [b.addable, b.text.split("\n")[0]])).toEqual([
    [false, "## Verdict"],
    [true, "Approve, with one fix."],
    [true, "- **Null check** at `src/a.ts:12`: `user` can be null."],
    [true, "- The retry loop in src/b.ts:40–44 never backs off."],
    [true, "1. First"],
    [true, "2. Second"],
    [false, "---"],
    [true, "> Quoted"],
  ]);
  expect(blocks[3]?.text).toContain("nested detail stays with its item");
});

test("code references are found, with ranges, once each", () => {
  expect(findCodeRefs("see `src/a.ts:12` and ./src/b.ts:40-44, again src/a.ts:12")).toEqual([
    { path: "src/a.ts", line: 12 },
    { path: "src/b.ts", startLine: 40, line: 44 },
  ]);
  expect(findCodeRefs("https://example.com:8080/x and no refs")).toEqual([]);
  expect(findCodeRefs("Approve, with one fix.")).toEqual([]);
});

test("a list item loses its bullet when it becomes a comment", () => {
  expect(withoutMarker("- **Null check**: fix it")).toBe("**Null check**: fix it");
  expect(withoutMarker("2. Second")).toBe("Second");
  expect(withoutMarker("Plain")).toBe("Plain");
});
