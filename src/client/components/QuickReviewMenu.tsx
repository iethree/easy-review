import { Loader, Menu, Text } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconRobot } from "@tabler/icons-react";
import { isActive, type AiReviewSummary, type Reviewer } from "../../shared/aiReview.ts";
import type { PullRequest } from "../../shared/types.ts";

interface Props {
  /** The pull request right-clicked, and where: null when closed. */
  at: { pr: PullRequest; x: number; y: number } | null;
  reviewers: Reviewer[];
  /** The pull request's reviews, the latest by each reviewer. */
  reviews: AiReviewSummary[];
  onStart: (pr: PullRequest, reviewerId: string) => void;
  onClose: () => void;
}

/**
 * A pull request's context menu in the list: start any reviewer on it, there
 * and then. A ✓ marks those that have reviewed it already (picking one runs
 * it again), and a spinner those at it now.
 */
export function QuickReviewMenu({ at, reviewers, reviews, onStart, onClose }: Props) {
  return (
    <Menu opened={at !== null} onChange={(open) => !open && onClose()} position="bottom-start" offset={2} width={240} shadow="md" radius="md">
      <Menu.Target>
        {/* Where the pointer was: the menu hangs from here. */}
        <div style={{ position: "fixed", left: at?.x ?? 0, top: at?.y ?? 0, width: 0, height: 0 }} />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Review #{at?.pr.number} with</Menu.Label>
        {reviewers.length === 0 && (
          <Text size="xs" c="dimmed" px="sm" py={6}>
            No reviewers yet — add them in Settings.
          </Text>
        )}
        {at &&
          reviewers.map((r) => {
            const review = reviews.find((j) => j.reviewerId === r.id);
            const running = review !== undefined && isActive(review.status);
            return (
              <Menu.Item
                key={r.id}
                leftSection={<StatusMark review={review} headSha={at.pr.headSha} />}
                rightSection={
                  running ? (
                    <Text size="10px" c="dimmed">
                      reviewing
                    </Text>
                  ) : undefined
                }
                disabled={running}
                onClick={() => onStart(at.pr, r.id)}
              >
                {r.name}
              </Menu.Item>
            );
          })}
      </Menu.Dropdown>
    </Menu>
  );
}

function StatusMark({ review, headSha }: { review: AiReviewSummary | undefined; headSha: string }) {
  if (review && isActive(review.status)) return <Loader size={14} />;
  if (review?.status === "done") {
    // Yellow when it was of an older commit, as on the row's count.
    const stale = headSha !== "" && review.headSha !== headSha;
    return <IconCheck size={14} color={`var(--mantine-color-${stale ? "yellow" : "teal"}-6)`} />;
  }
  if (review?.status === "failed") return <IconAlertTriangle size={14} color="var(--mantine-color-red-6)" />;
  return <IconRobot size={14} color="var(--mantine-color-dimmed)" />;
}
