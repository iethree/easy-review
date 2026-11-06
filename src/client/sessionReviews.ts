import type { ReviewEvent, ReviewsResponse } from "../shared/types.ts";

/** A review you submitted in this session, and when (ms since the epoch). */
export interface SessionReview {
  event: ReviewEvent;
  at: number;
}

export type SessionReviews = Record<string, SessionReview>;

/**
 * Drops the reviews that a newer queue has overtaken.
 *
 * A review you submit locks that pull request's review buttons, so a second
 * click can't post it twice. The lock lasts until the queue is fetched again
 * after the review. If the pull request is still in that queue, GitHub is
 * asking you to review it again (the author re-requested it), so the lock
 * comes off. A queue fetched before the review (a cached one) changes
 * nothing. Returns `reviews` itself when nothing changes.
 */
export function clearReRequested(reviews: SessionReviews, queue: ReviewsResponse): SessionReviews {
  const fetchedAt = Date.parse(queue.fetchedAt);
  if (Number.isNaN(fetchedAt)) return reviews;
  let next: SessionReviews | null = null;
  for (const pr of queue.pullRequests) {
    const review = reviews[pr.id];
    if (review && review.at < fetchedAt) {
      next ??= { ...reviews };
      delete next[pr.id];
    }
  }
  return next ?? reviews;
}

/** Just the events, by pull request id: what the buttons and filters read. */
export function reviewEvents(reviews: SessionReviews): Record<string, ReviewEvent> {
  return Object.fromEntries(Object.entries(reviews).map(([id, review]) => [id, review.event]));
}
