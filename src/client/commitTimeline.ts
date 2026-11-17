import type { AiReviewSummary } from "../shared/aiReview.ts";
import type { CommitHistory, CommitReview, PrCommit } from "../shared/types.ts";

/** A review on the timeline: one on GitHub, or one of Claude's. */
export type TimelineReview =
  | { kind: "github"; at: string; review: CommitReview }
  | { kind: "claude"; at: string; job: AiReviewSummary };

export interface TimelineEntry {
  commit: PrCommit;
  /** The reviews of this commit, newest first. */
  reviews: TimelineReview[];
}

export interface CommitTimeline {
  /** Newest commit first. */
  entries: TimelineEntry[];
  /** Reviews of a commit not in the list (pushed over, or older than it goes back), newest first. */
  elsewhere: TimelineReview[];
}

/** When a Claude review is placed: when it finished, or else when it was asked for. */
function claudeAt(job: AiReviewSummary): string {
  return job.finishedAt ?? job.startedAt ?? job.createdAt;
}

const newestFirst = (a: TimelineReview, b: TimelineReview) => b.at.localeCompare(a.at);

/**
 * The pull request's commits, newest first, each with the reviews of it:
 * GitHub's and Claude's.
 */
export function commitTimeline(history: CommitHistory, claude: readonly AiReviewSummary[]): CommitTimeline {
  const bySha = new Map<string, TimelineReview[]>(history.commits.map((c) => [c.sha, []]));
  const elsewhere: TimelineReview[] = [];
  const place = (sha: string | null, review: TimelineReview) => {
    const list = sha ? bySha.get(sha) : undefined;
    (list ?? elsewhere).push(review);
  };
  for (const review of history.reviews) place(review.sha, { kind: "github", at: review.at, review });
  for (const job of claude) place(job.headSha || null, { kind: "claude", at: claudeAt(job), job });

  const entries = history.commits
    .map((commit) => ({ commit, reviews: (bySha.get(commit.sha) ?? []).sort(newestFirst) }))
    .reverse();
  return { entries, elsewhere: elsewhere.sort(newestFirst) };
}
