import { Text } from "@mantine/core";
import type { AiReviewSummary } from "../../shared/aiReview.ts";
import type { PullRequest } from "../../shared/types.ts";
import { useConversation } from "../hooks/useConversation.ts";
import { CommitTimeline } from "./CommitTimeline.tsx";
import { Conversation } from "./Conversation.tsx";
import { Markdown } from "./Markdown.tsx";
import { PrDetailsCard } from "./PrDetailsCard.tsx";

/**
 * The author's description, rendered as GitHub would — HTML and all,
 * sanitised — and under it, the whole conversation. Beside it, or above it
 * when the pane is narrow, GitHub's sidebar: reviewers, assignees, labels.
 * And another sidebar: the commits, newest first, with the reviews of each.
 */
export function PrDescription({
  pr,
  viewer,
  claude,
  onOpenReview,
}: {
  pr: PullRequest;
  viewer: string | null;
  /** Claude's reviews of it, to place on the commit timeline. */
  claude: readonly AiReviewSummary[];
  onOpenReview: (job: AiReviewSummary) => void;
}) {
  // The same fetch as the conversation's: it comes with it.
  const { entry } = useConversation(pr);
  return (
    <div className="er-desc">
      <div className="er-desc-grid">
        <div className="er-desc-main">
          {pr.body.trim() ? (
            <Markdown allowHtml>{pr.body}</Markdown>
          ) : (
            <Text size="sm" c="dimmed" py="sm">
              No description provided.
            </Text>
          )}
          <Conversation pr={pr} viewer={viewer} />
        </div>
        {entry?.status === "ready" && (
          <aside className="er-desc-aside" aria-label="Reviewers, assignees and labels">
            <PrDetailsCard details={entry.data.details} />
          </aside>
        )}
        {/* A conversation cached before there was a history has none. */}
        {entry?.status === "ready" && entry.data.history && (
          <aside className="er-desc-commits" aria-label="Commits and their reviews">
            <CommitTimeline
              history={entry.data.history}
              claude={claude}
              headSha={pr.headSha}
              onOpenReview={onOpenReview}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
