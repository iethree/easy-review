import type { ReviewEvent, SubmitReviewRequest } from "../shared/types.ts";

export async function submitReview(input: SubmitReviewRequest): Promise<{ state: string; url: string }> {
  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { ok?: boolean; state?: string; url?: string; error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `Review failed (${res.status})`);
  return { state: json.state ?? "", url: json.url ?? "" };
}

export const EVENT_LABEL: Record<ReviewEvent, string> = {
  APPROVE: "Approved",
  REQUEST_CHANGES: "Changes requested",
  COMMENT: "Comment posted",
};
