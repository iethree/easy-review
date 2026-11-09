import { isActive, type AiReviewStatus, type AiReviewSummary } from "../shared/aiReview.ts";

/** Running before preparing before waiting: the order of the cards. */
const STAGE: Partial<Record<AiReviewStatus, number>> = { reviewing: 0, preparing: 1, queued: 2 };

/**
 * The reviews still to finish: the ones that run first, each stage oldest
 * first, so the queued ones read in the order they will start.
 */
export function inFlightReviews(jobs: readonly AiReviewSummary[]): AiReviewSummary[] {
  return jobs
    .filter((job) => isActive(job.status))
    .sort(
      (a, b) =>
        (STAGE[a.status] ?? 3) - (STAGE[b.status] ?? 3) ||
        (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt),
    );
}

const WAITING: Record<string, string> = {
  queued: "Waiting for a free slot",
  preparing: "Getting the code ready",
  reviewing: "Reviewing",
};

/** What a review is doing now, in one line: its latest step, without the line breaks. */
export function statusLine(job: Pick<AiReviewSummary, "status" | "phase">): string {
  const line = job.phase.replace(/\s+/g, " ").trim();
  return line || WAITING[job.status] || "";
}
