import { Text } from "@mantine/core";
import type { PullRequest } from "../../shared/types.ts";
import { useConversation } from "../hooks/useConversation.ts";
import { Conversation } from "./Conversation.tsx";
import { Markdown } from "./Markdown.tsx";
import { PrDetailsCard } from "./PrDetailsCard.tsx";

/**
 * The author's description, rendered as GitHub would — HTML and all,
 * sanitised — and under it, the whole conversation. Beside it, or above it
 * when the pane is narrow, GitHub's sidebar: reviewers, assignees, labels.
 */
export function PrDescription({ pr, viewer }: { pr: PullRequest; viewer: string | null }) {
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
      </div>
    </div>
  );
}
