import { expect, test } from "bun:test";
import { commentBody, placeFinding, splitReview, summaryItem, type Finding } from "./findings.ts";
import { parseDiff } from "./diff.ts";

const review = (json: string) => `## Summary

Looks mostly fine.

\`\`\`easy-review-findings
${json}
\`\`\`
`;

test("the findings block comes out of the prose, and its findings are read", () => {
  const { prose, findings } = splitReview(
    review(
      JSON.stringify([
        { severity: "blocking", title: "Null check", body: "`user` can be null.", path: "./src/a.ts", line: 3, side: "RIGHT" },
        { severity: "question", title: "Why now?", body: "Is this needed for 2.0?" },
      ]),
    ),
  );
  expect(prose).toBe("## Summary\n\nLooks mostly fine.");
  expect(findings).toEqual([
    { severity: "blocking", title: "Null check", body: "`user` can be null.", path: "src/a.ts", line: 3, side: "RIGHT" },
    { severity: "question", title: "Why now?", body: "Is this needed for 2.0?" },
  ]);
});

test("a review without the block, or with a broken one, is all prose", () => {
  expect(splitReview("Just prose.")).toEqual({ prose: "Just prose.", findings: [] });
  const broken = review("[{ not json");
  expect(splitReview(broken)).toEqual({ prose: broken, findings: [] });
});

test("malformed items are dropped, and a partial location is no location", () => {
  const { findings } = splitReview(
    review(
      JSON.stringify([
        { severity: "urgent", title: "x", body: "y" },
        { severity: "nit", title: "", body: "y" },
        { severity: "nit", title: "Typo", body: "teh", path: "a.ts", line: 0 },
        "nonsense",
      ]),
    ),
  );
  expect(findings).toEqual([{ severity: "nit", title: "Typo", body: "teh", path: "a.ts" }]);
});

const DIFF = parseDiff(`diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
 keep
-old line
+new line
 keep
`);

const at = (line: number, side: "RIGHT" | "LEFT" = "RIGHT"): Finding => ({
  severity: "suggestion",
  title: "t",
  body: "b",
  path: "src/a.ts",
  line,
  side,
});

test("a finding on a line in the diff becomes a line comment", () => {
  expect(placeFinding(at(2), DIFF, "abc", "abc")).toEqual({ kind: "line", path: "src/a.ts", line: 2, side: "RIGHT" });
  expect(placeFinding(at(2, "LEFT"), DIFF, "abc", "abc")).toEqual({ kind: "line", path: "src/a.ts", line: 2, side: "LEFT" });
});

test("anything else goes in the summary", () => {
  expect(placeFinding(at(40), DIFF, "abc", "abc")).toEqual({ kind: "summary" });
  // Old line 1 is unchanged context, not a deletion.
  expect(placeFinding(at(1, "LEFT"), DIFF, "abc", "abc")).toEqual({ kind: "summary" });
  expect(placeFinding({ ...at(2), path: "other.ts" }, DIFF, "abc", "abc")).toEqual({ kind: "summary" });
  // A review of an older commit can't anchor to today's lines.
  expect(placeFinding(at(2), DIFF, "old", "new")).toEqual({ kind: "summary" });
  expect(placeFinding(at(2), null, "abc", "abc")).toEqual({ kind: "summary" });
  expect(placeFinding({ severity: "nit", title: "t", body: "b" }, DIFF, "abc", "abc")).toEqual({ kind: "summary" });
});

test("findings read as comments and as summary bullets", () => {
  expect(commentBody(at(2))).toBe("**t**\n\nb");
  expect(summaryItem({ ...at(2), body: "two\nlines" })).toBe("- **t** (`src/a.ts:2`) — two lines");
  expect(summaryItem({ severity: "nit", title: "Overall", body: "" })).toBe("- **Overall**");
});

const RANGE_DIFF = parseDiff(`diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,4 +1,4 @@
 one
-two
+TWO
 three
 four
@@ -20,2 +20,2 @@
 twenty
-old
+new
`);

test("a suggestion and a range are read; a backwards range or a suggestion on a deleted line is not", () => {
  const { findings } = splitReview(
    review(
      JSON.stringify([
        { severity: "suggestion", title: "a", body: "b", path: "src/b.ts", startLine: 1, line: 3, side: "RIGHT", suggestion: "one\nTwo\nthree\n" },
        { severity: "nit", title: "c", body: "d", path: "src/b.ts", startLine: 5, line: 3, side: "RIGHT" },
        { severity: "nit", title: "e", body: "f", path: "src/b.ts", line: 2, side: "LEFT", suggestion: "x" },
      ]),
    ),
  );
  expect(findings[0]).toEqual({
    severity: "suggestion", title: "a", body: "b", path: "src/b.ts", startLine: 1, line: 3, side: "RIGHT", suggestion: "one\nTwo\nthree",
  });
  expect(findings[1]?.startLine).toBeUndefined();
  expect(findings[2]?.suggestion).toBeUndefined();
});

test("a range within one hunk is kept; one that spans two hunks shrinks to its last line", () => {
  const finding = (startLine: number, line: number): Finding => ({ severity: "nit", title: "t", body: "b", path: "src/b.ts", startLine, line, side: "RIGHT" });
  expect(placeFinding(finding(1, 3), RANGE_DIFF, "s", "s")).toEqual({ kind: "line", path: "src/b.ts", startLine: 1, line: 3, side: "RIGHT" });
  expect(placeFinding(finding(3, 21), RANGE_DIFF, "s", "s")).toEqual({ kind: "line", path: "src/b.ts", line: 21, side: "RIGHT" });
});

test("a suggestion becomes a suggested change only where the comment covers exactly its lines", () => {
  const f: Finding = { severity: "suggestion", title: "Name it", body: "Clearer.", path: "src/b.ts", startLine: 1, line: 3, side: "RIGHT", suggestion: "one\nTwo\nthree" };
  expect(commentBody(f, { startLine: 1, line: 3 })).toBe("**Name it**\n\nClearer.\n\n```suggestion\none\nTwo\nthree\n```");
  // Shrunk to one line, applying it would replace the wrong lines: leave it out.
  expect(commentBody(f, { line: 3 })).toBe("**Name it**\n\nClearer.");
  expect(summaryItem(f)).toBe("- **Name it** (`src/b.ts:1–3`) — Clearer.");
});
