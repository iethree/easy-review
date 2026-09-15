import { Anchor, Avatar, Badge, Group, Spoiler, Text } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";
import type { TimelineItem } from "../../shared/types.ts";
import { relativeTime } from "../time.ts";
import { Markdown } from "./Markdown.tsx";

export type DiffThreadItem = Extract<TimelineItem, { kind: "thread" }>;

/**
 * An existing inline discussion, shown under the line it was left on.
 *
 * Deliberately more compact than the same thread in the Description tab: here
 * it sits inside the code, and the point is to see there *is* a conversation
 * without losing your place in the diff.
 */
export function DiffThread({ thread }: { thread: DiffThreadItem }) {
  // Settled discussions start folded, as they do on GitHub.
  const [open, setOpen] = useState(!thread.resolved);
  const count = thread.comments.length + thread.more;

  return (
    <div className="er-diff-thread" data-resolved={thread.resolved}>
      <Group
        gap={5}
        wrap="nowrap"
        className="er-diff-thread-head"
        onClick={() => setOpen((o) => !o)}
        role="button"
        aria-expanded={open}
      >
        {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        <Text size="xs" fw={600} style={{ flex: "none" }}>
          {count} comment{count === 1 ? "" : "s"}
        </Text>
        {thread.resolved && (
          <Badge size="xs" variant="light" color="teal" style={{ flex: "none" }}>
            resolved
          </Badge>
        )}
        {thread.outdated && (
          <Badge size="xs" variant="light" color="gray" style={{ flex: "none" }}>
            outdated
          </Badge>
        )}
        {!open && (
          <Text size="xs" c="dimmed" truncate style={{ minWidth: 0 }}>
            {thread.comments[0]?.author.login}: {thread.comments[0]?.body.replace(/\s+/g, " ")}
          </Text>
        )}
      </Group>

      {open && (
        <div className="er-diff-thread-body">
          {thread.comments.map((comment) => (
            <div className="er-diff-comment" key={comment.id}>
              <Avatar src={comment.author.avatarUrl} size={18} radius="xl" mt={1}>
                {comment.author.login.slice(0, 1).toUpperCase()}
              </Avatar>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Group gap={5} wrap="nowrap" mb={1}>
                  <Text size="xs" fw={600} truncate>
                    {comment.author.login}
                  </Text>
                  <Anchor
                    href={comment.url || undefined}
                    target="_blank"
                    size="xs"
                    c="dimmed"
                    style={{ flex: "none" }}
                  >
                    {relativeTime(comment.createdAt)}
                  </Anchor>
                </Group>
                <Spoiler maxHeight={140} showLabel="Show more" hideLabel="Show less">
                  <Markdown allowHtml>{comment.body}</Markdown>
                </Spoiler>
              </div>
            </div>
          ))}
          {thread.more > 0 && (
            <Anchor href={thread.comments.at(-1)?.url} target="_blank" size="xs">
              {thread.more} more repl{thread.more === 1 ? "y" : "ies"} on GitHub
            </Anchor>
          )}
        </div>
      )}
    </div>
  );
}
