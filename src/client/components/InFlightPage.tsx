import { ActionIcon, Badge, Group, Loader, Text, Title, Tooltip } from "@mantine/core";
import { IconArrowLeft, IconPlayerStop } from "@tabler/icons-react";
import { useContext, useEffect, useRef, type CSSProperties } from "react";
import type { AiReviewSummary } from "../../shared/aiReview.ts";
import { inFlightReviews, statusLine } from "../inFlight.ts";
import { duration, useTick } from "./AiReviewPanel.tsx";
import { ReviewerIcon, ReviewerLooksContext, reviewerColor } from "./ReviewerIcon.tsx";

interface Props {
  jobs: readonly AiReviewSummary[];
  /** Show the review, with its pull request. */
  onOpen: (job: AiReviewSummary) => void;
  onCancel: (id: string) => void;
  onClose: () => void;
}

const STAGE = {
  queued: { label: "Queued", color: "gray" },
  preparing: { label: "Preparing", color: "indigo" },
  reviewing: { label: "Reviewing", color: "indigo" },
} as const;

/**
 * Every review still to finish, as a grid of cards: who is reviewing what,
 * how long it has taken, and what it is doing now. The summaries are polled
 * every second or two while any review runs, so each card's line keeps up.
 */
export function InFlightPage({ jobs, onOpen, onCancel, onClose }: Props) {
  const flying = inFlightReviews(jobs);
  useTick(flying.length > 0);

  // Escape goes back to the pull requests, as from Settings.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const running = flying.filter((j) => j.status !== "queued").length;
  const queued = flying.length - running;

  return (
    <div className="er-page">
      <div className="er-page-head">
        <Group gap="xs">
          <Tooltip label="Back to pull requests (Esc)">
            <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Back">
              <IconArrowLeft size={17} />
            </ActionIcon>
          </Tooltip>
          <Title order={2}>Reviews in progress</Title>
          {flying.length > 0 && (
            <Text size="sm" c="dimmed">
              {running} running{queued > 0 ? `, ${queued} queued` : ""}
            </Text>
          )}
        </Group>
      </div>

      <div className="er-flights">
        {flying.length === 0 ? (
          <div className="er-flights-empty">
            <Text fw={600}>No reviews are running</Text>
            <Text size="sm" c="dimmed">
              Start one from a pull request's + tab. It shows here until it finishes.
            </Text>
          </div>
        ) : (
          <ul className="er-flight-grid">
            {flying.map((job) => (
              <FlightCard key={job.id} job={job} onOpen={onOpen} onCancel={onCancel} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FlightCard({
  job,
  onOpen,
  onCancel,
}: {
  job: AiReviewSummary;
  onOpen: (job: AiReviewSummary) => void;
  onCancel: (id: string) => void;
}) {
  const look = useContext(ReviewerLooksContext)[job.reviewerId];
  const accent = look?.color ? reviewerColor(look.color) : "var(--mantine-color-indigo-5)";
  const stage = STAGE[job.status as keyof typeof STAGE] ?? STAGE.queued;
  const queued = job.status === "queued";
  const line = statusLine(job);
  const elapsed = queued ? duration(job.createdAt, null) : duration(job.startedAt ?? job.createdAt, null);

  return (
    <li className="er-flight" data-status={job.status} style={{ "--er-flight-accent": accent } as CSSProperties}>
      <div className="er-flight-head">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <ReviewerIcon id={job.reviewerId} size={15} fallback="var(--mantine-color-indigo-5)" />
          <Text size="xs" fw={600} truncate>
            {job.reviewerName}
          </Text>
        </Group>
        <Badge size="xs" variant="light" color={stage.color}>
          {stage.label}
        </Badge>
      </div>

      <button type="button" className="er-flight-open" onClick={() => onOpen(job)} title={job.title}>
        {job.title || `#${job.number}`}
      </button>
      <Text size="xs" c="dimmed" truncate>
        {job.owner}/{job.name}#{job.number}
      </Text>

      <div className="er-flight-status" title={line}>
        {queued ? <span className="er-flight-dot" aria-hidden="true" /> : <Loader size={12} color="currentColor" />}
        <span className="er-flight-line">{line}</span>
      </div>

      <div className="er-flight-foot">
        <Text size="xs" c="dimmed" ff="monospace">
          {queued ? `waiting ${elapsed}` : elapsed}
        </Text>
        <Tooltip label={queued ? "Take it out of the queue" : "Stop this review"}>
          <ActionIcon
            className="er-flight-cancel"
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => onCancel(job.id)}
            aria-label={`Stop ${job.reviewerName}'s review of ${job.owner}/${job.name}#${job.number}`}
          >
            <IconPlayerStop size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
    </li>
  );
}
