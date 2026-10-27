import { expect, test } from "bun:test";
import { parseDiff } from "../shared/diff.ts";
import { appendBlock, appendLine, findingKey, parseAssemblies, placeProse, proseKey, withAssembly } from "./assembly.ts";

test("stored reviews-in-progress are read back, and junk is dropped", () => {
  expect(parseAssemblies(JSON.stringify({ a: { summary: "Hi", added: ["r:0", 3] }, b: "x" }))).toEqual({
    a: { summary: "Hi", added: ["r:0"] },
  });
  expect(parseAssemblies("not json")).toEqual({});
  expect(parseAssemblies(null)).toEqual({});
});

test("summary lines go under what's there", () => {
  expect(appendLine("", "- one")).toBe("- one");
  expect(appendLine("Intro\n\n", "- one")).toBe("Intro\n- one");
});

test("an empty review drops out of storage", () => {
  const map = withAssembly({}, "pr", { summary: "x", added: [] });
  expect(map).toEqual({ pr: { summary: "x", added: [] } });
  expect(withAssembly(map, "pr", { summary: "  ", added: [] })).toEqual({});
});

test("a finding is known by its review and position", () => {
  expect(findingKey("job-1", 2)).toBe("job-1:2");
});

test("paragraphs join the summary with a blank line between", () => {
  expect(appendBlock("", "  First.\n")).toBe("First.");
  expect(appendBlock("First.\n", "- Second")).toBe("First.\n\n- Second");
});

test("prose pieces are known apart from findings", () => {
  expect(proseKey("job-1", 2)).toBe("job-1:p2");
});

const DIFF = parseDiff(`diff --git a/e2e/test/scenarios/a.cy.spec.ts b/e2e/test/scenarios/a.cy.spec.ts
--- a/e2e/test/scenarios/a.cy.spec.ts
+++ b/e2e/test/scenarios/a.cy.spec.ts
@@ -10,3 +10,4 @@
 keep
+added one
+added two
 keep
`);
const pr = { headSha: "abc" };
const review = { headSha: "abc" };

test("prose that points at one place in the diff goes on those lines, even with a shortened path", () => {
  expect(placeProse(pr, review, "- `a.cy.spec.ts:11–12`: wait on the request", DIFF)).toEqual({
    kind: "line",
    path: "e2e/test/scenarios/a.cy.spec.ts",
    startLine: 11,
    line: 12,
    side: "RIGHT",
  });
});

test("prose that points nowhere, at two places, or outside the diff goes in the summary", () => {
  expect(placeProse(pr, review, "Approve.", DIFF)).toEqual({ kind: "summary" });
  expect(placeProse(pr, review, "a.cy.spec.ts:11 and a.cy.spec.ts:12", DIFF)).toEqual({ kind: "summary" });
  expect(placeProse(pr, review, "a.cy.spec.ts:300", DIFF)).toEqual({ kind: "summary" });
  expect(placeProse(pr, { headSha: "old" }, "a.cy.spec.ts:11", DIFF)).toEqual({ kind: "summary" });
});
