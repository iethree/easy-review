import { expect, test } from "bun:test";
import { describeTarget, prKey, reviewKey } from "./aiReview.ts";

const head = "b".repeat(40);
const base = "a".repeat(40);

test("a review's key says what it is of, whatever its kind", () => {
  const pr = { kind: "pr", owner: "Acme", name: "App", number: 7, baseSha: null, headSha: head } as const;
  expect(reviewKey(pr)).toBe(prKey(pr));
  expect(reviewKey({ ...pr, kind: "diff", number: 0, baseSha: base })).toBe(`acme/app@${base}..${head}`);
  expect(reviewKey({ ...pr, kind: "repo", number: 0 })).toBe(`acme/app@${head}`);
  // Two diffs with the same head, from different bases, are different reviews.
  expect(reviewKey({ ...pr, kind: "diff", number: 0, baseSha: base })).not.toBe(
    reviewKey({ ...pr, kind: "diff", number: 0, baseSha: "c".repeat(40) }),
  );
});

test("what a review is of, in a few words", () => {
  expect(describeTarget({ kind: "pr", number: 7, baseSha: null, headSha: head })).toBe("#7");
  expect(describeTarget({ kind: "diff", number: 0, baseSha: base, headSha: head })).toBe("aaaaaaa…bbbbbbb");
  expect(describeTarget({ kind: "repo", number: 0, baseSha: null, headSha: head })).toBe("the repository at bbbbbbb");
});
