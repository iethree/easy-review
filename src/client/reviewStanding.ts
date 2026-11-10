import type { AiReviewSummary } from "../shared/aiReview.ts";
import type { AiVerdict } from "../shared/findings.ts";

/**
 * How one review stands, in a word: its verdict once it's done and gives
 * one, or else where it is. `stale` when it reviewed an older commit than
 * the pull request's head (`headSha` "" means the head isn't known).
 */
export type ReviewStanding =
  | { kind: "verdict"; verdict: AiVerdict; stale: boolean }
  | { kind: "status"; label: string; color: string; stale: boolean };

const STATUS_WORDS: Record<Exclude<AiReviewSummary["status"], "done">, { label: string; color: string }> = {
  queued: { label: "Queued", color: "gray" },
  preparing: { label: "Preparing", color: "indigo" },
  reviewing: { label: "Reviewing", color: "indigo" },
  failed: { label: "Failed", color: "red" },
  cancelled: { label: "Cancelled", color: "gray" },
};

export function reviewStanding(job: Pick<AiReviewSummary, "status" | "verdict" | "headSha">, headSha: string): ReviewStanding {
  const stale = job.status === "done" && headSha !== "" && job.headSha !== headSha;
  if (job.status === "done") {
    return job.verdict
      ? { kind: "verdict", verdict: job.verdict, stale }
      : { kind: "status", label: "No verdict", color: "gray", stale };
  }
  return { kind: "status", ...STATUS_WORDS[job.status], stale };
}
