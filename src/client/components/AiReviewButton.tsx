import { ActionIcon, Tooltip } from "@mantine/core";
import { IconRobot } from "@tabler/icons-react";
import { memo } from "react";
import { isActive, type AiReviewSummary } from "../../shared/aiReview.ts";

interface Props {
  job: AiReviewSummary | undefined;
  /** The PR's current head, to notice a review of an older commit. */
  headSha: string;
  label: string;
  onStart: () => void;
  onOpen: () => void;
}

/**
 * One click starts a review. Once one exists, the same click opens it instead
 * — re-running costs time and tokens, so it lives behind an explicit button in
 * the review itself.
 */
export const AiReviewButton = memo(function AiReviewButton({
  job,
  headSha,
  label,
  onStart,
  onOpen,
}: Props) {
  const idle = !job || job.status === "cancelled";
  const running = job !== undefined && isActive(job.status);
  const stale = job?.status === "done" && headSha !== "" && job.headSha !== headSha;

  const color = idle
    ? "gray"
    : running
      ? "indigo"
      : job.status === "failed"
        ? "red"
        : stale
          ? "yellow"
          : "teal";

  const tip = idle
    ? "Review with Claude (c)"
    : running
      ? job.phase
      : job.status === "failed"
        ? "Claude's review failed — open to see why"
        : stale
          ? "Claude reviewed an older commit — open to re-run"
          : "Claude's review is ready";

  return (
    <Tooltip label={tip} openDelay={250} maw={280} multiline>
      <ActionIcon
        variant={idle ? "subtle" : "light"}
        color={color}
        size="md"
        className="er-robot"
        data-running={running}
        onClick={(e) => {
          // On a list row this must not also select the row twice over.
          e.stopPropagation();
          if (idle) onStart();
          else onOpen();
        }}
        aria-label={idle ? `Review ${label} with Claude` : `Open Claude's review of ${label}`}
      >
        <IconRobot size={16} stroke={1.9} />
      </ActionIcon>
    </Tooltip>
  );
});
