import { expect, test } from "bun:test";
import { inReviewerOrder, moveId } from "./reviewerOrder.ts";

const reviewer = (id: string, name: string) => ({ id, name });
const ids = (list: { id: string }[]) => list.map((r) => r.id);

test("placed reviewers come first, in their order; the rest follow by name", () => {
  const all = [reviewer("c", "Charlie"), reviewer("a", "Alpha"), reviewer("b", "Bravo"), reviewer("d", "Delta")];
  expect(ids(inReviewerOrder(all, ["d", "b"], (r) => r))).toEqual(["d", "b", "a", "c"]);
  // With no order at all, it's simply by name.
  expect(ids(inReviewerOrder(all, [], (r) => r))).toEqual(["a", "b", "c", "d"]);
  // Ids in the order that no longer exist change nothing.
  expect(ids(inReviewerOrder(all, ["gone", "c"], (r) => r))).toEqual(["c", "a", "b", "d"]);
});

test("reviews sort by their reviewer, read through the key", () => {
  const reviews = [
    { reviewerId: "a", reviewerName: "Alpha", n: 1 },
    { reviewerId: "b", reviewerName: "Bravo", n: 2 },
  ];
  const sorted = inReviewerOrder(reviews, ["b"], (j) => ({ id: j.reviewerId, name: j.reviewerName }));
  expect(sorted.map((j) => j.n)).toEqual([2, 1]);
});

test("moving an id puts it at the index, clamped to the list", () => {
  expect(moveId(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
  expect(moveId(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
  expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
  expect(moveId(["a", "b", "c"], "b", 9)).toEqual(["a", "c", "b"]);
  expect(moveId(["a", "b"], "x", 0)).toEqual(["a", "b"]);
});
