import { ActionIcon, Avatar, Badge, Group, Tooltip } from "@mantine/core";
import { IconEye, IconGitPullRequestDraft } from "@tabler/icons-react";
import { memo } from "react";
import type { AiReviewSummary } from "../../shared/aiReview.ts";
import { rateDifficulty } from "../../shared/difficulty.ts";
import type { PullRequest, ReviewEvent, Settings } from "../../shared/types.ts";
import { DIFFICULTY_COLOR } from "../theme.ts";
import { relativeTime } from "../time.ts";
import { AiReviewButton } from "./AiReviewButton.tsx";
import { CiBadge } from "./CiBadge.tsx";
import { DiffStat } from "./DiffStat.tsx";
import { DifficultyBadge } from "./DifficultyBadge.tsx";

interface Props {
  pr: PullRequest;
  settings: Settings;
  selected: boolean;
  reviewed: ReviewEvent | undefined;
  onSelect: (pr: PullRequest) => void;
  /** Clicking the author narrows the queue to just their pull requests. */
  onFilterAuthor: (login: string) => void;
  /** False when every row shares a repo, so it isn't repeated on each one. */
  showRepo: boolean;
  // Flat, not an object, so the memoised row only re-renders when its own
  // review changes. The callbacks are absent when local reviews aren't
  // available (no claude CLI), which hides the robot.
  aiJob?: AiReviewSummary;
  onAiStart?: (pr: PullRequest) => void;
  onAiOpen?: (pr: PullRequest) => void;
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
  settings,
  selected,
  reviewed,
  onSelect,
  onFilterAuthor,
  showRepo,
  aiJob,
  onAiStart,
  onAiOpen,
  onUnhide,
}: Props) {
  const rating = rateDifficulty(pr, settings);
  const accent = `var(--mantine-color-${DIFFICULTY_COLOR[rating.level]}-5)`;

  return (
    // biome-ignore lint/a11y: rows are chosen with the keyboard through the app's keymap (j/k), not focus
    <div
      className="er-item"
      data-selected={selected}
      data-row-id={pr.id}
      style={{ "--er-accent": accent } as React.CSSProperties}
      onClick={() => onSelect(pr)}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
    >
      <div className="er-item-accent" />

      <DifficultyBadge rating={rating} size="sm" compact />

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
            <CiBadge pr={pr} />
          </div>
        </div>
      </div>

      <Group gap={4} wrap="nowrap">
        {onAiStart && onAiOpen && (
          <AiReviewButton
            job={aiJob}
            headSha={pr.headSha}
            label={`${pr.repo}#${pr.number}`}
            onStart={() => onAiStart(pr)}
            onOpen={() => onAiOpen(pr)}
          />
        )}
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

