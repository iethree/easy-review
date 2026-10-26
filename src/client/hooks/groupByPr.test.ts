import { expect, test } from "bun:test";
import type { AiReviewSummary } from "../../shared/aiReview.ts";
import { groupByPr } from "./useLocalReviews.ts";

let n = 0;
function job(over: Partial<AiReviewSummary>): AiReviewSummary {
  const at = `2026-10-26T10:00:${String(n++).padStart(2, "0")}Z`;
  return {
    id: `job-${n}`,
    reviewerId: "general",
    reviewerName: "General",
    owner: "acme",
    name: "app",
    number: 7,
    title: "t",
    headSha: "abc",
    status: "done",
    phase: "",
    createdAt: at,
    startedAt: at,
    finishedAt: at,
    updatedAt: at,
    error: null,
    costUsd: null,
    turns: null,
    ...over,
  };
}

test("each reviewer's latest review of a pull request, ordered by name", () => {
  const old = job({ reviewerId: "security", reviewerName: "Security" });
  const general = job({});
  const latest = job({ reviewerId: "security", reviewerName: "Security" });
  const other = job({ number: 8 });
  const { reviewsByPr } = groupByPr([old, general, latest, other]);
  expect(reviewsByPr.get("acme/app#7")?.map((j) => j.id)).toEqual([general.id, latest.id]);
  expect(reviewsByPr.get("acme/app#8")?.map((j) => j.id)).toEqual([other.id]);
});

test("the robot shows a running review first, then a failed one, then the latest", () => {
  const done = job({});
  const failed = job({ reviewerId: "b", reviewerName: "B", status: "failed" });
  const running = job({ reviewerId: "c", reviewerName: "C", status: "reviewing" });
  expect(groupByPr([done, failed, running]).byPr.get("acme/app#7")?.id).toBe(running.id);
  expect(groupByPr([done, failed]).byPr.get("acme/app#7")?.id).toBe(failed.id);
  const later = job({ reviewerId: "d", reviewerName: "D" });
  expect(groupByPr([done, later]).byPr.get("acme/app#7")?.id).toBe(later.id);
});

test("a cancelled review doesn't hide a finished one", () => {
  const done = job({});
  const cancelled = job({ reviewerId: "b", reviewerName: "B", status: "cancelled" });
  expect(groupByPr([done, cancelled]).byPr.get("acme/app#7")?.id).toBe(done.id);
  expect(groupByPr([cancelled]).byPr.get("acme/app#7")?.id).toBe(cancelled.id);
});
