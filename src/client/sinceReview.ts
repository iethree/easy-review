import type { PullRequest } from "../shared/types.ts";

/**
 * Whether a pull request has new commits since your latest review on GitHub:
 * it was of another commit than the head. False when you haven't reviewed
 * it, when the head isn't known, or when you have reviewed it in this session
 * (the queue's record of your review is older than that until it's fetched again).
 */
export function updatedSinceYourReview(
  pr: Pick<PullRequest, "headSha" | "yourReview">,
  reviewedThisSession: boolean,
): boolean {
  const review = pr.yourReview;
  return !reviewedThisSession && !!review && pr.headSha !== "" && review.sha !== pr.headSha;
}
