import { Anchor, Avatar, Paper, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconGitCommit } from "@tabler/icons-react";
import { useMemo } from "react";
import type { AiReviewSummary } from "../../shared/aiReview.ts";
import type { CommitHistory } from "../../shared/types.ts";
import { commitTimeline, type TimelineReview } from "../commitTimeline.ts";
import { reviewStanding } from "../reviewStanding.ts";
import { absoluteTime, relativeTime } from "../time.ts";
import { REVIEWER_STATE } from "./PrDetailsCard.tsx";
import { ReviewerIcon } from "./ReviewerIcon.tsx";
import { VERDICT_LOOK } from "./Verdict.tsx";

/**
 * The pull request's commits, newest first, and under each the reviews of it:
 * on GitHub, and by Claude. Clicking one of Claude's opens its tab.
 */
export function CommitTimeline({
  history,
  claude,
  headSha,
  onOpenReview,
}: {
  history: CommitHistory;
  claude: readonly AiReviewSummary[];
  headSha: string;
  onOpenReview: (job: AiReviewSummary) => void;
}) {
  const { entries, elsewhere } = useMemo(() => commitTimeline(history, claude), [history, claude]);
  return (
    <Paper withBorder radius="md" p="sm" className="er-timeline">
      <Text size="xs" fw={600} c="dimmed" mb={8}>
        Commits · {history.commits.length + history.earlier}
      </Text>
      {entries.length === 0 ? (
        <Text size="sm" c="dimmed">
          No commits
        </Text>
      ) : (
        <ol className="er-timeline-list">
          {entries.map(({ commit, reviews }) => (
            <li key={commit.sha} className="er-commit" data-head={commit.sha === headSha}>
              <IconGitCommit size={14} className="er-commit-dot" aria-hidden />
              <div className="er-commit-body">
                <Tooltip label={commit.headline} openDelay={400} multiline maw={320} withinPortal>
                  <Text size="sm" className="er-truncate">
                    {commit.headline || "(no message)"}
                  </Text>
                </Tooltip>
                <Text size="xs" c="dimmed" className="er-commit-meta">
                  <Anchor href={commit.url} target="_blank" size="xs" ff="monospace" c="dimmed">
                    {commit.sha.slice(0, 7)}
                  </Anchor>
                  {" · "}
                  {commit.author.login}
                  {" · "}
                  <span title={absoluteTime(commit.committedAt)}>{relativeTime(commit.committedAt)}</span>
                </Text>
                {reviews.length > 0 && <Reviews reviews={reviews} headSha={headSha} onOpenReview={onOpenReview} />}
              </div>
            </li>
          ))}
        </ol>
      )}
      {history.earlier > 0 && (
        <Text size="xs" c="dimmed" mt={6}>
          {history.earlier} earlier commit{history.earlier === 1 ? "" : "s"} not shown
        </Text>
      )}
      {elsewhere.length > 0 && (
        <Stack gap={4} mt={10}>
          <Text size="xs" fw={600} c="dimmed">
            Of commits no longer here
          </Text>
          <Reviews reviews={elsewhere} headSha={headSha} onOpenReview={onOpenReview} />
        </Stack>
      )}
    </Paper>
  );
}

function Reviews({
  reviews,
  headSha,
  onOpenReview,
}: {
  reviews: readonly TimelineReview[];
  headSha: string;
  onOpenReview: (job: AiReviewSummary) => void;
}) {
  return (
    <Stack gap={2} mt={4}>
      {reviews.map((r) => (r.kind === "github" ? <GithubReview key={r.review.id} r={r} /> : <ClaudeReview key={r.job.id} r={r} headSha={headSha} onOpen={onOpenReview} />))}
    </Stack>
  );
}

function GithubReview({ r }: { r: Extract<TimelineReview, { kind: "github" }> }) {
  const { label, color, Icon } = REVIEWER_STATE[r.review.state];
  return (
    <Anchor href={r.review.url} target="_blank" underline="never" c="inherit" className="er-commit-review" title={absoluteTime(r.at)}>
      <Avatar src={r.review.author.avatarUrl} size={16} radius="xl">
        {r.review.author.login.slice(0, 1).toUpperCase()}
      </Avatar>
      <Text size="xs" className="er-truncate" style={{ flex: 1, minWidth: 0 }}>
        {r.review.author.login}
      </Text>
      <Icon size={14} color={`var(--mantine-color-${color}-6)`} aria-label={label} />
    </Anchor>
  );
}

function ClaudeReview({
  r,
  headSha,
  onOpen,
}: {
  r: Extract<TimelineReview, { kind: "claude" }>;
  headSha: string;
  onOpen: (job: AiReviewSummary) => void;
}) {
  const standing = reviewStanding(r.job, headSha);
  const look = standing.kind === "verdict" ? VERDICT_LOOK[standing.verdict] : null;
  const label = look ? look.label : standing.kind === "status" ? standing.label : "";
  const color = `var(--mantine-color-${look ? look.color : standing.kind === "status" ? standing.color : "gray"}-6)`;
  return (
    <UnstyledButton className="er-commit-review" onClick={() => onOpen(r.job)} title={`${label} · ${absoluteTime(r.at)}`}>
      <ReviewerIcon id={r.job.reviewerId} size={16} fallback="var(--mantine-color-gray-6)" />
      <Text size="xs" className="er-truncate" style={{ flex: 1, minWidth: 0 }}>
        {r.job.reviewerName}
      </Text>
      {look ? (
        <look.Icon size={14} color={color} aria-label={label} />
      ) : (
        <Text size="10px" c={color} fw={500}>
          {label}
        </Text>
      )}
    </UnstyledButton>
  );
}
