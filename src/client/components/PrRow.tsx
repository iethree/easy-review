import { ActionIcon, Avatar, Badge, Group, HoverCard, Stack, Text, ThemeIcon, Tooltip } from "@mantine/core";
import { IconEye, IconGitPullRequestDraft } from "@tabler/icons-react";
import { createContext, type ReactNode, memo, useContext } from "react";
import { isActive, prKey, type AiReviewSummary } from "../../shared/aiReview.ts";
import type { AiVerdict } from "../../shared/findings.ts";
import type { PullRequest, ReviewEvent } from "../../shared/types.ts";
import { reviewStanding } from "../reviewStanding.ts";
import { relativeTime } from "../time.ts";
import { CiBadge } from "./CiBadge.tsx";
import { DiffStat } from "./DiffStat.tsx";
import { ReviewerIcon } from "./ReviewerIcon.tsx";
import { VERDICT_LOOK } from "./Verdict.tsx";

/**
 * Every pull request's reviews, for the card that lists them. Read from
 * context, not props, so a poll re-renders only an open card, not every row.
 */
export const RowReviewsContext = createContext<Map<string, AiReviewSummary[]>>(new Map());

interface Props {
  pr: PullRequest;
  selected: boolean;
  reviewed: ReviewEvent | undefined;
  onSelect: (pr: PullRequest) => void;
  /** Clicking the author narrows the queue to just their pull requests. */
  onFilterAuthor: (login: string) => void;
  /** False when every row shares a repo, so it isn't repeated on each one. */
  showRepo: boolean;
  // Flat, not an object, so the memoised row only re-renders when its own
  // reviews change: the one standing for them all, and how many there are.
  aiJob?: AiReviewSummary;
  aiCount?: number;
  /** The finished reviews' verdict on the current commit, the most severe of them. */
  aiVerdict?: AiVerdict | null;
  /** In the Hidden tab: brings the PR back. */
  onUnhide?: (pr: PullRequest) => void;
}

const REVIEWED_LABEL: Record<ReviewEvent, string> = {
  APPROVE: "approved",
  REQUEST_CHANGES: "changes requested",
  COMMENT: "commented",
};

export const PrRow = memo(function PrRow({
  pr,
  selected,
  reviewed,
  onSelect,
  onFilterAuthor,
  showRepo,
  aiJob,
  aiCount = 0,
  aiVerdict = null,
  onUnhide,
}: Props) {
  return (
    // biome-ignore lint/a11y: rows are chosen with the keyboard through the app's keymap (j/k), not focus
    <div
      className="er-item"
      data-pr-id={pr.id}
      data-selected={selected}
      data-row-id={pr.id}
      onClick={() => onSelect(pr)}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
    >
      {/* Uncoloured here: it keeps these rows in line with the Reviewed tab's, where it is the verdict. */}
      <div className="er-item-accent" />

      <div className="er-item-main">
        <div className="er-item-title">
          {pr.isDraft && (
            <Tooltip label="Draft">
              <IconGitPullRequestDraft size={13} color="var(--mantine-color-gray-6)" />
            </Tooltip>
          )}
          <span className="er-title">{pr.title}</span>
          {reviewed && (
            <Badge
              size="xs"
              color={reviewed === "APPROVE" ? "teal" : "orange"}
              variant="filled"
              style={{ flex: "none" }}
            >
              {REVIEWED_LABEL[reviewed]}
            </Badge>
          )}
        </div>

        <div className="er-item-meta">
          <div className="er-item-meta-left">
            <Tooltip label={pr.repo} openDelay={500}>
              <span style={{ flex: "none" }}>
                {showRepo ? pr.name : ""}#{pr.number}
              </span>
            </Tooltip>
            <span aria-hidden>·</span>
            <Tooltip label={`Show only ${pr.author}'s pull requests`} openDelay={500}>
              {/* biome-ignore lint/a11y: a mouse shortcut; from the keyboard, type author: in the filter */}
              <span
                className="er-author"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterAuthor(pr.author);
                }}
              >
                <Avatar src={pr.authorAvatar} size={14} radius="xl">
                  {pr.author.slice(0, 1).toUpperCase()}
                </Avatar>
                <span className="er-truncate">{pr.author}</span>
              </span>
            </Tooltip>
            <span aria-hidden>·</span>
            <span style={{ flex: "none" }}>{relativeTime(pr.updatedAt)}</span>
          </div>
          <div className="er-item-meta-right">
            <DiffStat
              additions={pr.additions}
              deletions={pr.deletions}
              files={pr.changedFiles}
              compact
            />
            <span className="er-ci-slot">
              <CiBadge pr={pr} />
            </span>
          </div>
        </div>
      </div>

      <Group gap={4} wrap="nowrap">
        <ReviewCount pr={pr} job={aiJob} count={aiCount} verdict={aiVerdict} />
        {/* No approve button here: approving is done from the preview, with the pull request in view. */}
        {onUnhide && (
          <Tooltip label="Unhide (⇧H)">
            <ActionIcon
              variant="light"
              color="gray"
              size="md"
              onClick={(e) => {
                e.stopPropagation();
                onUnhide(pr);
              }}
              aria-label={`Unhide ${pr.repo}#${pr.number}`}
            >
              <IconEye size={15} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </div>
  );
});

/**
 * The row's Claude reviews: how many, coloured by how the latest is doing.
 * Once they're done, of this commit, and say what they'd do, the verdict's
 * icon in place of the count. Hovering lists each review and how it stands.
 * Always takes its place, so rows line up whether or not they have any.
 */
function ReviewCount({
  pr,
  job,
  count,
  verdict,
}: {
  pr: PullRequest;
  job: AiReviewSummary | undefined;
  count: number;
  verdict: AiVerdict | null;
}) {
  if (!job || count === 0) return <span className="er-review-count" />;
  const headSha = pr.headSha;
  const running = isActive(job.status);
  const stale = job.status === "done" && headSha !== "" && job.headSha !== headSha;
  const reviews = `${count} Claude review${count === 1 ? "" : "s"}`;
  if (verdict && job.status === "done" && !stale) {
    const look = VERDICT_LOOK[verdict];
    return (
      <ReviewsCard pr={pr} label={look.label}>
        <ThemeIcon size={18} radius="xl" variant="light" color={look.color} aria-label={`${reviews} — ${look.label.toLowerCase()}`}>
          <look.Icon size={14} />
        </ThemeIcon>
      </ReviewsCard>
    );
  }
  const [color, state] = running
    ? ["indigo", job.phase]
    : job.status === "failed"
      ? ["red", "the latest failed"]
      : stale
        ? ["yellow", "of an older commit"]
        : job.status === "cancelled"
          ? ["gray", "cancelled"]
          : ["teal", "ready"];
  return (
    <ReviewsCard pr={pr} label={running ? "Reviewing" : "Claude reviews"}>
      <Badge size="sm" circle variant="light" color={color} className="er-breathe" data-running={running} aria-label={`${reviews} — ${state}`}>
        {count}
      </Badge>
    </ReviewsCard>
  );
}

/** Hovering a row's reviews: each reviewer, and its verdict or where it is — like the checks' card. */
function ReviewsCard({ pr, label, children }: { pr: PullRequest; label: string; children: ReactNode }) {
  return (
    <span className="er-review-count">
      <HoverCard width={280} shadow="md" openDelay={180} closeDelay={80} position="bottom-end" withinPortal>
        <HoverCard.Target>
          <span style={{ display: "inline-flex", cursor: "default" }}>{children}</span>
        </HoverCard.Target>
        <HoverCard.Dropdown>
          <ReviewsList pr={pr} label={label} />
        </HoverCard.Dropdown>
      </HoverCard>
    </span>
  );
}

function ReviewsList({ pr, label }: { pr: PullRequest; label: string }) {
  const reviews = useContext(RowReviewsContext).get(prKey(pr)) ?? [];
  return (
    <Stack gap={6}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={600}>
          {label}
        </Text>
        <Text size="xs" c="dimmed">
          {reviews.length} review{reviews.length === 1 ? "" : "s"}
        </Text>
      </Group>
      {reviews.map((r) => {
        const standing = reviewStanding(r, pr.headSha);
        const look = standing.kind === "verdict" ? VERDICT_LOOK[standing.verdict] : null;
        const words = standing.kind === "verdict" ? VERDICT_LOOK[standing.verdict] : standing;
        const color = `var(--mantine-color-${words.color}-6)`;
        return (
          <Group key={r.id} gap={6} wrap="nowrap" justify="space-between">
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
              <ReviewerIcon id={r.reviewerId} fallback="var(--mantine-color-gray-6)" />
              <Text size="xs" truncate>
                {r.reviewerName}
              </Text>
            </Group>
            <Group gap={4} wrap="nowrap" style={{ flex: "none", opacity: standing.stale ? 0.55 : 1 }}>
              {look && <look.Icon size={13} color={color} />}
              <Text size="xs" c={color} fw={500}>
                {words.label}
              </Text>
            </Group>
          </Group>
        );
      })}
      {reviews.some((r) => reviewStanding(r, pr.headSha).stale) && (
        <Text size="10px" c="dimmed" fs="italic">
          Faded: of an older commit.
        </Text>
      )}
    </Stack>
  );
}
