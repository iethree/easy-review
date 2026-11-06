import { expect, test } from "bun:test";
import type { PullRequest, ReviewsResponse } from "../shared/types.ts";
import { clearReRequested, reviewEvents, type SessionReviews } from "./sessionReviews.ts";

const at = Date.parse("2026-11-05T10:00:00Z");

const queue = (fetchedAt: string, ...ids: string[]): ReviewsResponse => ({
  viewer: "me",
  fetchedAt,
  pullRequests: ids.map((id) => ({ id }) as PullRequest),
});

const reviews: SessionReviews = {
  a: { event: "REQUEST_CHANGES", at },
  b: { event: "APPROVE", at },
};

test("a pull request re-requested after your review unlocks", () => {
  const next = clearReRequested(reviews, queue("2026-11-05T10:05:00Z", "a"));
  expect(next).toEqual({ b: { event: "APPROVE", at } });
  expect(reviews.a).toBeDefined();
});

test("a queue fetched before the review changes nothing", () => {
  expect(clearReRequested(reviews, queue("2026-11-05T09:59:00Z", "a", "b"))).toBe(reviews);
});

test("reviews of pull requests not in the queue stay", () => {
  expect(clearReRequested(reviews, queue("2026-11-05T10:05:00Z", "c"))).toBe(reviews);
});

test("an unreadable fetch time changes nothing", () => {
  expect(clearReRequested(reviews, queue("", "a"))).toBe(reviews);
});

test("events by pull request id", () => {
  expect(reviewEvents(reviews)).toEqual({ a: "REQUEST_CHANGES", b: "APPROVE" });
});
