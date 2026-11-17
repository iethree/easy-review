import { expect, test } from "bun:test";
import { updatedSinceYourReview } from "./sinceReview.ts";

const review = { at: "2026-11-10T09:00:00Z", sha: "old" };

test("a pull request is updated when your latest review was of another commit than the head", () => {
  expect(updatedSinceYourReview({ headSha: "new", yourReview: review }, false)).toBe(true);
  expect(updatedSinceYourReview({ headSha: "old", yourReview: review }, false)).toBe(false);
});

test("not when you haven't reviewed it, the head isn't known, or you reviewed it in this session", () => {
  expect(updatedSinceYourReview({ headSha: "new", yourReview: null }, false)).toBe(false);
  expect(updatedSinceYourReview({ headSha: "new" }, false)).toBe(false);
  expect(updatedSinceYourReview({ headSha: "", yourReview: review }, false)).toBe(false);
  expect(updatedSinceYourReview({ headSha: "new", yourReview: review }, true)).toBe(false);
});
