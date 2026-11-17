/**
 * Which queued reviews may start: oldest first, while there are free slots
 * in total, and only while its reviewer has fewer running than its own limit.
 * A review held back by its reviewer's limit doesn't hold up the ones behind
 * it by other reviewers.
 */

import type { AiReviewJob } from "../shared/aiReview.ts";

type Slotted = Pick<AiReviewJob, "id" | "reviewerId" | "concurrency" | "createdAt">;

export interface QueueStep<J> {
  /** To start now, in this order. */
  start: J[];
  /** Waiting on their reviewer's own limit, not on the total. */
  heldByReviewer: J[];
}

export function nextReviews<J extends Slotted>(
  queued: readonly J[],
  running: readonly Slotted[],
  maxTotal: number,
): QueueStep<J> {
  const perReviewer = new Map<string, number>();
  for (const job of running) perReviewer.set(job.reviewerId, (perReviewer.get(job.reviewerId) ?? 0) + 1);
  let total = running.length;

  const start: J[] = [];
  const heldByReviewer: J[] = [];
  for (const job of [...queued].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const mine = perReviewer.get(job.reviewerId) ?? 0;
    if (job.concurrency && mine >= job.concurrency) {
      heldByReviewer.push(job);
      continue;
    }
    if (total >= maxTotal) continue;
    start.push(job);
    perReviewer.set(job.reviewerId, mine + 1);
    total++;
  }
  return { start, heldByReviewer };
}
