import { expect, test } from "bun:test";
import type { AiReviewSummary } from "../shared/aiReview.ts";
import { inFlightReviews, statusLine } from "./inFlight.ts";

function job(id: string, patch: Partial<AiReviewSummary>): AiReviewSummary {
  return {
    id,
    reviewerId: "default",
    reviewerName: "Default",
    owner: "o",
    name: "r",
    number: 1,
    title: "t",
    headSha: "abc",
    status: "queued",
    phase: "",
    createdAt: "2026-11-09T10:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    updatedAt: "2026-11-09T10:00:00.000Z",
    error: null,
    costUsd: null,
    turns: null,
    chatPhase: null,
    verdict: null,
    ...patch,
  };
}

test("only reviews still to finish are in flight: running, then preparing, then queued", () => {
  const jobs = [
    job("queued-late", { status: "queued", createdAt: "2026-11-09T10:05:00.000Z" }),
    job("done", { status: "done" }),
    job("queued-early", { status: "queued", createdAt: "2026-11-09T10:01:00.000Z" }),
    job("preparing", { status: "preparing", startedAt: "2026-11-09T10:02:00.000Z" }),
    job("failed", { status: "failed" }),
    job("reviewing-late", { status: "reviewing", startedAt: "2026-11-09T10:04:00.000Z" }),
    job("reviewing-early", { status: "reviewing", startedAt: "2026-11-09T10:03:00.000Z" }),
    job("cancelled", { status: "cancelled" }),
  ];
  expect(inFlightReviews(jobs).map((j) => j.id)).toEqual([
    "reviewing-early",
    "reviewing-late",
    "preparing",
    "queued-early",
    "queued-late",
  ]);
});

test("the status line is the latest step on one line, or what the stage means", () => {
  expect(statusLine({ status: "reviewing", phase: "Read src/app.ts" })).toBe("Read src/app.ts");
  expect(statusLine({ status: "reviewing", phase: "Ran  bun test\n  --watch " })).toBe("Ran bun test --watch");
  expect(statusLine({ status: "queued", phase: "" })).toBe("Waiting for a free slot");
  expect(statusLine({ status: "reviewing", phase: "  " })).toBe("Reviewing");
});
