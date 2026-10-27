import { Avatar, Badge, Tooltip } from "@mantine/core";
import { memo } from "react";
import type { ReviewedPullRequest } from "../../shared/types.ts";
import { PR_STATE, VERDICT } from "../reviewMeta.ts";
import { absoluteTime, relativeTime } from "../time.ts";
import { DiffStat } from "./DiffStat.tsx";

interface Props {
  pr: ReviewedPullRequest;
  selected: boolean;
  onSelect: (pr: ReviewedPullRequest) => void;
  onFilterAuthor: (login: string) => void;
  /** False when every row shares a repo, so it isn't repeated on each one. */
  showRepo: boolean;
}

export const ReviewedRow = memo(function ReviewedRow({
  pr,
  selected,
  onSelect,
  onFilterAuthor,
  showRepo,
}: Props) {
  const verdict = VERDICT[pr.verdict];
  const state = PR_STATE[pr.state];
  const StateIcon = state.Icon;
  const accent = `var(--mantine-color-${verdict.color}-5)`;

  return (
    // biome-ignore lint/a11y: rows are chosen with the keyboard through the app's keymap (j/k), not focus
    <div
      className="er-item er-item-history"
      data-selected={selected}
      data-row-id={pr.id}
      style={{ "--er-accent": accent } as React.CSSProperties}
      onClick={() => onSelect(pr)}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
    >
      <div className="er-item-accent" />

      <Tooltip label={`${verdict.full} ${relativeTime(pr.reviewedAt)}`}>
        <Badge
          color={verdict.color}
          variant="light"
          size="sm"
          fullWidth
          style={{ cursor: "default", textTransform: "none" }}
        >
          {verdict.label}
        </Badge>
      </Tooltip>

      <div className="er-item-main">
        <div className="er-item-title">
          <span className="er-title">{pr.title}</span>
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
            {/* The tab and the badge already say "reviewed"; the row just says when. */}
            <Tooltip label={`Reviewed ${absoluteTime(pr.reviewedAt)}`}>
              <span style={{ flex: "none" }}>{relativeTime(pr.reviewedAt)}</span>
            </Tooltip>
          </div>
          <div className="er-item-meta-right">
            <DiffStat
              additions={pr.additions}
              deletions={pr.deletions}
              files={pr.changedFiles}
              compact
            />
            <span className="er-state">
              <StateIcon size={13} color={`var(--mantine-color-${state.color}-6)`} />
              {state.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
