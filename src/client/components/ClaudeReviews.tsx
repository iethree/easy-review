import { ActionIcon, Loader, Tabs, Tooltip } from "@mantine/core";
import { IconPlus, IconRobot } from "@tabler/icons-react";
import { useState, type ComponentProps } from "react";
import { isActive, type AiReviewSummary } from "../../shared/aiReview.ts";
import type { PullRequest } from "../../shared/types.ts";
import { AiReviewPanel } from "./AiReviewPanel.tsx";
import { ReviewerPicker } from "./ReviewerPicker.tsx";

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
  onFindingAdded: () => void;
  /** Present while choosing who should review: shown in place, at the top. */
  picker?: ComponentProps<typeof ReviewerPicker>;
}

/** One tab per reviewer that has looked at this pull request. */
export function ClaudeReviews({ pr, jobs, reviewerIds, onStart, onCancel, onRemove, onFindingAdded, picker }: Props) {
  const [chosen, setChosen] = useState<string | null>(null);
  const picking = picker && <ReviewerPicker {...picker} />;

  if (jobs.length === 0) {
    return (
      picking ?? <AiReviewPanel pr={pr} job={undefined} onStart={() => onStart()} onCancel={onCancel} onRemove={onRemove} />
    );
  }

  const job = jobs.find((j) => j.reviewerId === chosen) ?? jobs[0];
  if (!job) return null;
  // Re-run by the same reviewer; one deleted since, or a review from before
  // there were reviewers, asks instead.
  const rerun = () => (reviewerIds.has(job.reviewerId) ? onStart([job.reviewerId]) : onStart());

  return (
    <>
      {picking}
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
      <AiReviewPanel
        key={job.id}
        pr={pr}
        job={job}
        onStart={rerun}
        onCancel={onCancel}
        onRemove={onRemove}
        onFindingAdded={onFindingAdded}
      />
    </>
  );
}

export function StatusIcon({ job }: { job: AiReviewSummary | undefined }) {
  // The tab's own text colour: an indigo loader vanished on the selected tab, which is indigo too.
  if (job && isActive(job.status)) return <Loader size={14} color="currentColor" />;
  const color =
    job?.status === "done"
      ? "var(--mantine-color-teal-6)"
      : job?.status === "failed"
        ? "var(--mantine-color-red-6)"
        : undefined; // currentColor
  return <IconRobot size={14} color={color} />;
}
