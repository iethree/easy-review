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
