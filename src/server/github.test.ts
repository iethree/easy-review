import { test, expect } from "bun:test";
import type { PullRequest } from "../shared/types.ts";
import { buildCiStatus, describeRestError, latestRequest, mergeById, mineSearchQueries, yourReview } from "./github.ts";

test("uses the errors array, which is where the real reason lives", () => {
  // Verbatim from GitHub's reviews endpoint: `errors` holds plain strings and
  // the top-level message is useless.
  expect(
    describeRestError(
      422,
      {
        message: "Unprocessable Entity",
        errors: ["Review You need to leave a comment indicating the requested changes."],
      },
      "Review failed",
    ),
  ).toBe("Review You need to leave a comment indicating the requested changes.");
});

test("handles the object form other endpoints use", () => {
  expect(
    describeRestError(
      422,
      {
        message: "Unprocessable Entity",
        errors: [{ field: "user_id", message: "can only have one pending review per pull request" }],
      },
      "Review failed",
    ),
  ).toBe("user_id: can only have one pending review per pull request");
});

test("joins multiple errors", () => {
  expect(
    describeRestError(422, { errors: ["first problem", "second problem"] }, "Review failed"),
  ).toBe("first problem; second problem");
});

test("falls back to a meaningful top-level message", () => {
  expect(
    describeRestError(422, { message: "Can not approve your own pull request" }, "Review failed"),
  ).toBe("Can not approve your own pull request");
});

test("never surfaces a bare Unprocessable Entity", () => {
  expect(describeRestError(422, { message: "Unprocessable Entity" }, "Review failed")).toBe(
    "Review failed (422)",
  );
});

test("survives an empty or missing body", () => {
  expect(describeRestError(500, null, "Review failed")).toBe("Review failed (500)");
  expect(describeRestError(500, {}, "Review failed")).toBe("Review failed (500)");
  expect(describeRestError(422, { errors: [] }, "Review failed")).toBe("Review failed (422)");
});

test("ignores error entries with nothing useful in them", () => {
  expect(describeRestError(422, { errors: [{ field: "x" }] }, "Review failed")).toBe(
    "Review failed (422)",
  );
  expect(describeRestError(422, { errors: [{ code: "custom" }] }, "Review failed")).toBe("custom");
});

test("My PRs are the open ones you wrote, and the open ones assigned to you", () => {
  expect(mineSearchQueries()).toEqual([
    "is:open is:pr archived:false author:@me",
    "is:open is:pr archived:false assignee:@me",
  ]);
});

test("a pull request you wrote and are assigned to is listed once, newest activity first", () => {
  const pr = (id: string, updatedAt: string) => ({ id, updatedAt }) as PullRequest;
  const merged = mergeById([pr("a", "2026-10-01"), null, pr("b", "2026-10-03"), pr("a", "2026-10-01")]);
  expect(merged.map((p) => p.id)).toEqual(["b", "a"]);
});

test("your review was last asked for by name, or of a team when the queue has team requests", () => {
  const requests = [
    { createdAt: "2026-11-10T09:00:00Z", requestedReviewer: { __typename: "User", login: "Ryan" } },
    { createdAt: "2026-11-10T12:00:00Z", requestedReviewer: { __typename: "User", login: "someone-else" } },
    { createdAt: "2026-11-10T11:00:00Z", requestedReviewer: { __typename: "Team" } },
    null,
    { createdAt: "2026-11-10T13:00:00Z", requestedReviewer: null },
  ];
  expect(latestRequest(requests, "ryan", false)).toBe("2026-11-10T09:00:00Z");
  expect(latestRequest(requests, "ryan", true)).toBe("2026-11-10T11:00:00Z");
  expect(latestRequest([], "ryan", true)).toBeNull();
});

test("your latest review is when and of which commit, and none while it's only pending", () => {
  expect(yourReview({ submittedAt: "2026-11-10T09:00:00Z", commit: { oid: "abc" } })).toEqual({
    at: "2026-11-10T09:00:00Z",
    sha: "abc",
  });
  expect(yourReview({ submittedAt: null, commit: { oid: "abc" } })).toBeNull();
  expect(yourReview({ submittedAt: "2026-11-10T09:00:00Z", commit: null })).toBeNull();
  expect(yourReview(null)).toBeNull();
});

function rollup(state: string, runs: Record<string, number>, statuses: Record<string, number> = {}) {
  const counts = (o: Record<string, number>) => Object.entries(o).map(([s, count]) => ({ state: s, count }));
  const total = [...Object.values(runs), ...Object.values(statuses)].reduce((a, b) => a + b, 0);
  return {
    state,
    contexts: { totalCount: total, checkRunCountsByState: counts(runs), statusContextCountsByState: counts(statuses) },
  };
}

test("cancelled and skipped runs don't make the checks look failed", () => {
  // metabase#87565: GitHub's rollup says FAILURE because of 11 superseded runs.
  const ci = buildCiStatus(rollup("FAILURE", { SUCCESS: 134, SKIPPED: 113, CANCELLED: 11, FAILURE: 0 }));
  expect(ci.state).toBe("SUCCESS");
  expect([ci.passed, ci.failed, ci.skipped]).toEqual([134, 0, 124]);
});

test("the overall check state follows the counts", () => {
  expect(buildCiStatus(rollup("FAILURE", { SUCCESS: 3, CANCELLED: 2, FAILURE: 1 })).state).toBe("FAILURE");
  expect(buildCiStatus(rollup("FAILURE", { SUCCESS: 3, TIMED_OUT: 1 })).state).toBe("FAILURE");
  expect(buildCiStatus(rollup("FAILURE", { SUCCESS: 3, STARTUP_FAILURE: 1 })).state).toBe("ERROR");
  expect(buildCiStatus(rollup("PENDING", { SUCCESS: 3, IN_PROGRESS: 1 })).state).toBe("PENDING");
  expect(buildCiStatus(rollup("FAILURE", { SUCCESS: 3 }, { FAILURE: 1 })).state).toBe("FAILURE");
  expect(buildCiStatus(rollup("PENDING", {}, { EXPECTED: 1 })).state).toBe("PENDING");
  expect(buildCiStatus(rollup("SUCCESS", { SKIPPED: 4 })).state).toBe("SUCCESS");
  expect(buildCiStatus(null).state).toBe("NONE");
});
