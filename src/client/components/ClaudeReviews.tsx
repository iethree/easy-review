import { ActionIcon, Loader, Tabs, Tooltip } from "@mantine/core";
import { IconPlus, IconRobot } from "@tabler/icons-react";
import { useState } from "react";
import { isActive, type AiReviewSummary } from "../../shared/aiReview.ts";
import type { PullRequest } from "../../shared/types.ts";
import { AiReviewPanel } from "./AiReviewPanel.tsx";

interface Props {
  pr: PullRequest;
  /** The latest review by each reviewer, as from groupByPr. */
  jobs: AiReviewSummary[];
  /** Reviewers that still exist, so a review can be re-run by the same one. */
  reviewerIds: ReadonlySet<string>;
  /** No ids: ask which reviewers. */
  onStart: (reviewerIds?: string[]) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}

/** One tab per reviewer that has looked at this pull request. */
export function ClaudeReviews({ pr, jobs, reviewerIds, onStart, onCancel, onRemove }: Props) {
  const [chosen, setChosen] = useState<string | null>(null);

  if (jobs.length === 0) {
    return <AiReviewPanel pr={pr} job={undefined} onStart={() => onStart()} onCancel={onCancel} onRemove={onRemove} />;
  }

  const job = jobs.find((j) => j.reviewerId === chosen) ?? jobs[0];
  if (!job) return null;
  // Re-run by the same reviewer; one deleted since, or a review from before
  // there were reviewers, asks instead.
  const rerun = () => (reviewerIds.has(job.reviewerId) ? onStart([job.reviewerId]) : onStart());

  return (
    <>
      <Tabs value={job.reviewerId} onChange={setChosen} variant="pills" radius="xl" mb="sm">
        <Tabs.List>
          {jobs.map((j) => (
            <Tabs.Tab key={j.reviewerId} value={j.reviewerId} leftSection={<StatusIcon job={j} />}>
              {j.reviewerName}
            </Tabs.Tab>
          ))}
          <Tooltip label="Review with more reviewers">
            <ActionIcon variant="subtle" color="gray" onClick={() => onStart()} aria-label="Add reviewers" ml={4}>
              <IconPlus size={15} />
            </ActionIcon>
          </Tooltip>
        </Tabs.List>
      </Tabs>
      <AiReviewPanel key={job.id} pr={pr} job={job} onStart={rerun} onCancel={onCancel} onRemove={onRemove} />
    </>
  );
}

export function StatusIcon({ job }: { job: AiReviewSummary | undefined }) {
  if (job && isActive(job.status)) return <Loader size={12} color="indigo" />;
  const color =
    job?.status === "done"
      ? "var(--mantine-color-teal-6)"
      : job?.status === "failed"
        ? "var(--mantine-color-red-6)"
        : undefined; // currentColor
  return <IconRobot size={14} color={color} />;
}
