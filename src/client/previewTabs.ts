/**
 * The tabs over a pull request: its description, its diff, and one for each
 * reviewer that has reviewed it. A reviewer's tab is named by the reviewer,
 * not the review, so it stays chosen as you move between pull requests and
 * when a review is re-run.
 */

import type { AiReviewSummary } from "../shared/aiReview.ts";

export type PreviewTab = "description" | "diff" | `review:${string}`;

/**
 * A reviewer's tab. Never an empty value, which Mantine's tabs throw on —
 * even for a review from before there were reviewers, whose reviewer is "".
 */
export function reviewTab(reviewerId: string): PreviewTab {
  return `review:${reviewerId}`;
}

/**
 * The tab to show for a pull request with these reviews, and the review in
 * it. A reviewer's tab where that reviewer hasn't looked shows another
 * reviewer's review — or, with none, the description.
 */
export function resolveTab(
  tab: PreviewTab,
  reviews: readonly AiReviewSummary[],
): { tab: PreviewTab; review?: AiReviewSummary } {
  if (!tab.startsWith("review:")) return { tab };
  const id = tab.slice("review:".length);
  const review = reviews.find((r) => r.reviewerId === id) ?? reviews[0];
  return review ? { tab: reviewTab(review.reviewerId), review } : { tab: "description" };
}

/** The tabs in order, for ← and →. */
export function tabOrder(reviews: readonly AiReviewSummary[]): PreviewTab[] {
  return ["description", "diff", ...reviews.map((r) => reviewTab(r.reviewerId))];
}
