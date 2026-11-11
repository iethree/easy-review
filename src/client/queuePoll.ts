import type { PullRequest } from "../shared/types.ts";

/**
 * The rows a background fetch of the queue would take away: those in the
 * queue as shown (`before`, which includes rows kept from earlier fetches)
 * that aren't in `fetched`.
 *
 * A fetch in the background brings in new pull requests and pull requests
 * whose review was asked for again. It doesn't take a row away while you might
 * be reading it, so these rows stay until you refresh the list.
 */
export function lingering(before: readonly PullRequest[], fetched: readonly PullRequest[]): PullRequest[] {
  const now = new Set(fetched.map((pr) => pr.id));
  return before.filter((pr) => !now.has(pr.id));
}
