import { expect, test } from "bun:test";
import { reviewStanding } from "./reviewStanding.ts";

test("a finished review stands by its verdict, stale when it reviewed an older commit", () => {
  expect(reviewStanding({ status: "done", verdict: "approve", headSha: "abc" }, "abc")).toEqual({
    kind: "verdict",
    verdict: "approve",
    stale: false,
  });
  expect(reviewStanding({ status: "done", verdict: "request-changes", headSha: "old" }, "abc")).toEqual({
    kind: "verdict",
    verdict: "request-changes",
    stale: true,
  });
  // An unknown head can't make a review stale.
  expect(reviewStanding({ status: "done", verdict: "comment", headSha: "old" }, "").stale).toBe(false);
});

test("a review without a verdict stands by where it is", () => {
  expect(reviewStanding({ status: "done", verdict: null, headSha: "abc" }, "abc")).toEqual({
    kind: "status",
    label: "No verdict",
    color: "gray",
    stale: false,
  });
  expect(reviewStanding({ status: "reviewing", verdict: null, headSha: "old" }, "abc")).toEqual({
    kind: "status",
    label: "Reviewing",
    color: "indigo",
    stale: false,
  });
  expect(reviewStanding({ status: "failed", verdict: null, headSha: "abc" }, "abc")).toMatchObject({ label: "Failed" });
});
