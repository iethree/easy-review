import { MantineProvider } from "@mantine/core";
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import type { AiReviewSummary } from "../../shared/aiReview.ts";
import type { PullRequest } from "../../shared/types.ts";
import { ClaudeReviews } from "./ClaudeReviews.tsx";

const job = (id: string, reviewerId: string, reviewerName: string) =>
  ({
    id,
    reviewerId,
    reviewerName,
    owner: "metabase",
    name: "metabase",
    number: 1,
    title: "A change",
    headSha: "abc",
    status: "done",
    phase: "Review ready",
    createdAt: "2026-10-01T00:00:00Z",
    startedAt: null,
    finishedAt: null,
    updatedAt: "2026-10-01T00:00:00Z",
    error: null,
    costUsd: null,
    turns: null,
  }) as AiReviewSummary;

const render = (jobs: AiReviewSummary[]) =>
  renderToString(
    <MantineProvider>
      <ClaudeReviews
        pr={{ id: "pr", headSha: "abc" } as PullRequest}
        jobs={jobs}
        reviewerIds={new Set()}
        onStart={() => {}}
        onCancel={() => {}}
        onRemove={() => {}}
        onFindingAdded={() => {}}
      />
    </MantineProvider>,
  );

test("a review from before there were reviewers gets a tab, beside a reviewer's", () => {
  // Saved without a reviewer, it has "" for one — which, as a tab's value,
  // made Mantine throw and took the whole page down.
  const html = render([job("old", "", "Claude"), job("new", "security", "Security")]);
  expect(html).toContain("Claude");
  expect(html).toContain("Security");
});
