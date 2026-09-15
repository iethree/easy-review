import { Text } from "@mantine/core";
import type { PullRequest } from "../../shared/types.ts";
import { Conversation } from "./Conversation.tsx";
import { Markdown } from "./Markdown.tsx";

/**
 * The author's description, rendered as GitHub would — HTML and all,
 * sanitised — and under it, the whole conversation.
 */
export function PrDescription({ pr, viewer }: { pr: PullRequest; viewer: string | null }) {
  return (
    <>
      {pr.body.trim() ? (
        <Markdown allowHtml>{pr.body}</Markdown>
      ) : (
        <Text size="sm" c="dimmed" py="sm">
          No description provided.
        </Text>
      )}
      <Conversation pr={pr} viewer={viewer} />
    </>
  );
}
