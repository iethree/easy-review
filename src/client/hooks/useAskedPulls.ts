import { useEffect, useMemo, useRef, useState } from "react";
import { prKey, type AiReviewSummary } from "../../shared/aiReview.ts";
import type { PullRequest } from "../../shared/types.ts";

/**
 * The pull requests you asked Claude to review by number (from New review)
 * that GitHub doesn't list as waiting for you: fetched one by one, to be rows
 * of the list like the rest. One goes when its reviews do.
 */
export function useAskedPulls(jobs: readonly AiReviewSummary[], listed: ReadonlySet<string>): PullRequest[] {
  const [fetched, setFetched] = useState<ReadonlyMap<string, PullRequest>>(new Map());
  const asked = useRef(new Set<string>());

  const wanted = useMemo(() => {
    const keys = new Map<string, AiReviewSummary>();
    for (const job of jobs) if (job.kind === "pr" && job.adhoc) keys.set(prKey(job), job);
    return keys;
  }, [jobs]);

  useEffect(() => {
    for (const [key, job] of wanted) {
      if (listed.has(key) || asked.current.has(key)) continue;
      asked.current.add(key);
      const params = new URLSearchParams({ owner: job.owner, name: job.name, number: String(job.number) });
      void fetch(`/api/pull?${params}`)
        .then(async (res) => (res.ok ? ((await res.json()) as PullRequest) : null))
        .then((pr) => {
          if (pr) setFetched((current) => new Map(current).set(key, pr));
        })
        // Asked again next time round.
        .catch(() => asked.current.delete(key));
    }
  }, [wanted, listed]);

  return useMemo(
    () => [...fetched].filter(([key]) => wanted.has(key) && !listed.has(key)).map(([, pr]) => pr),
    [fetched, wanted, listed],
  );
}
