/**
 * The list is of things to review, not only pull requests: Claude's reviews
 * of a diff or a whole repository are rows in it too, made here from the
 * reviews themselves.
 */

import { describeTarget, prKey, reviewKey, type AiReviewSummary } from "../shared/aiReview.ts";
import type { PullRequest } from "../shared/types.ts";

/** What a row's reviews are filed under: its pull request's key, or what its reviews are of. */
export function rowKey(pr: Pick<PullRequest, "owner" | "name" | "number" | "target">): string {
  return pr.target ? pr.target.key : prKey(pr);
}

/** Where it is on GitHub. */
export function targetUrl(job: Pick<AiReviewSummary, "owner" | "name" | "kind" | "baseSha" | "headSha" | "number">): string {
  const repo = `https://github.com/${job.owner}/${job.name}`;
  if (job.kind === "diff") return `${repo}/compare/${job.baseSha}...${job.headSha}`;
  if (job.kind === "repo") return `${repo}/tree/${job.headSha}`;
  return `${repo}/pull/${job.number}`;
}

const NO_CHECKS: PullRequest["ci"] = {
  state: "NONE",
  total: 0,
  passed: 0,
  failed: 0,
  pending: 0,
  skipped: 0,
  contexts: [],
  namesComplete: true,
};

/** One row for each diff or repository reviewed, as of its latest review. */
export function targetRows(jobs: readonly AiReviewSummary[]): PullRequest[] {
  const latest = new Map<string, AiReviewSummary>();
  for (const job of jobs) {
    if (job.kind === "pr") continue;
    const key = reviewKey(job);
    const seen = latest.get(key);
    if (!seen || job.createdAt > seen.createdAt) latest.set(key, job);
  }
  return [...latest.entries()].map(([key, job]) => {
    const kind = job.kind as "diff" | "repo";
    const url = targetUrl(job);
    return {
      id: `review:${key}`,
      number: 0,
      title: job.title,
      body:
        kind === "diff"
          ? `Claude's reviews of the changes from \`${job.baseSha}\` to \`${job.headSha}\` in ${job.owner}/${job.name}.\n\n[Compare them on GitHub](${url})`
          : `Claude's reviews of the whole of ${job.owner}/${job.name} at \`${job.headSha}\`.\n\n[Browse it on GitHub](${url})`,
      url,
      repo: `${job.owner}/${job.name}`,
      owner: job.owner,
      name: job.name,
      author: "",
      authorAvatar: null,
      isDraft: false,
      createdAt: job.createdAt,
      updatedAt: job.createdAt,
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      headSha: job.headSha,
      baseRef: describeTarget(job),
      reviewDecision: null,
      ci: NO_CHECKS,
      target: { kind, key, baseSha: job.baseSha },
    };
  });
}
