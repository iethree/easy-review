import { ActionIcon, Avatar, Badge, Group, ThemeIcon, Tooltip } from "@mantine/core";
import { IconEye, IconGitPullRequestDraft } from "@tabler/icons-react";
import { memo } from "react";
import { isActive, type AiReviewSummary } from "../../shared/aiReview.ts";
import type { AiVerdict } from "../../shared/findings.ts";
import type { PullRequest, ReviewEvent } from "../../shared/types.ts";
import { relativeTime } from "../time.ts";
import { CiBadge } from "./CiBadge.tsx";
import { DiffStat } from "./DiffStat.tsx";
import { VERDICT_LOOK } from "./Verdict.tsx";

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
        <ReviewCount job={aiJob} count={aiCount} headSha={pr.headSha} verdict={aiVerdict} />
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
 * How many Claude reviews the pull request has, coloured by how they stand.
 * Always takes its place, so rows line up whether or not they have any.
 */
/**
 * The row's Claude reviews: how many, coloured by how the latest is doing.
 * Once they're done, of this commit, and say what they'd do, the verdict's
 * icon in place of the count.
 */
function ReviewCount({
  job,
  count,
  headSha,
  verdict,
}: {
  job: AiReviewSummary | undefined;
  count: number;
  headSha: string;
  verdict: AiVerdict | null;
}) {
  if (!job || count === 0) return <span className="er-review-count" />;
  const running = isActive(job.status);
  const stale = job.status === "done" && headSha !== "" && job.headSha !== headSha;
  const reviews = `${count} Claude review${count === 1 ? "" : "s"}`;
  if (verdict && job.status === "done" && !stale) {
    const look = VERDICT_LOOK[verdict];
    const label = `${reviews} — ${look.label.toLowerCase()}`;
    return (
      <span className="er-review-count">
        <Tooltip label={label} openDelay={250}>
          <ThemeIcon size={18} radius="xl" variant="light" color={look.color} aria-label={label}>
            <look.Icon size={14} />
          </ThemeIcon>
        </Tooltip>
      </span>
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
  const label = `${reviews} — ${state}`;
  return (
    <span className="er-review-count">
      <Tooltip label={label} openDelay={250}>
        <Badge size="sm" circle variant="light" color={color} className="er-breathe" data-running={running} aria-label={label}>
          {count}
        </Badge>
      </Tooltip>
    </span>
  );
}
