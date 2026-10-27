import { test, expect } from "bun:test";
import type { PullRequest } from "../shared/types.ts";
import { describeRestError, mergeById, mineSearchQueries } from "./github.ts";

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
