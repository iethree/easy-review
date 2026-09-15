import { Anchor, Avatar, Badge, Button, Center, Group, Loader, Spoiler, Stack, Text, Tooltip } from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCode,
  IconMessageCircle,
  IconPencilMinus,
} from "@tabler/icons-react";
import { useState } from "react";
import type {
  ConversationComment,
  Person,
  PullRequest,
  ReviewSummaryState,
  TimelineItem,
} from "../../shared/types.ts";
import { useConversation } from "../hooks/useConversation.ts";
import { absoluteTime, relativeTime } from "../time.ts";
import { Markdown } from "./Markdown.tsx";

const VERDICT: Record<ReviewSummaryState, { color: string; verb: string; Icon: typeof IconCheck }> = {
  APPROVED: { color: "teal", verb: "approved", Icon: IconCheck },
  CHANGES_REQUESTED: { color: "orange", verb: "requested changes", Icon: IconPencilMinus },
  COMMENTED: { color: "blue", verb: "reviewed", Icon: IconMessageCircle },
  DISMISSED: { color: "gray", verb: "had a review dismissed", Icon: IconMessageCircle },
};

type IsMine = (person: Person) => boolean;

/**
 * Every comment on the pull request, oldest first: conversation comments,
 * review summaries and inline code threads, as little chat bubbles — yours on
 * the right. Bodies are other people's Markdown, so they go through the same
 * sanitising renderer as the description.
 */
export function Conversation({ pr, viewer }: { pr: PullRequest; viewer: string | null }) {
  const { entry, retry } = useConversation(pr);
  const mine: IsMine = (person) =>
    viewer !== null && person.login.toLowerCase() === viewer.toLowerCase();

  let content: React.ReactNode;
  let count: number | null = null;

  if (!entry) {
    content = (
      <Center py="md">
        <Group gap={6}>
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            Loading comments…
          </Text>
        </Group>
      </Center>
    );
  } else if (entry.status === "error") {
    content = (
      <Group gap={6} py="sm">
        <Text size="xs" c="red.6">
          Couldn't load the comments: {entry.message}
        </Text>
        <Button size="compact-xs" variant="subtle" onClick={retry}>
          Retry
        </Button>
      </Group>
    );
  } else {
    const { items, truncated } = entry.data;
    count = items.reduce(
      (n, item) =>
        n + (item.kind === "thread" ? item.comments.length : item.kind === "review" && !item.body.trim() ? 0 : 1),
      0,
    );
    content = (
      <>
        {items.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No comments yet.
          </Text>
        ) : (
          <Stack gap="sm">
            {items.map((item) => (
              <Item key={item.id} item={item} mine={mine} />
            ))}
          </Stack>
        )}
        {truncated && (
          <Text size="xs" c="dimmed" ta="center" mt="sm">
            There's more than fits here —{" "}
            <Anchor href={pr.url} target="_blank" size="xs">
              the rest is on GitHub
            </Anchor>
            .
          </Text>
        )}
      </>
    );
  }

  return (
    <section className="er-conversation" aria-label="Conversation">
      <Group justify="space-between" mb="sm">
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
          Conversation
        </Text>
        {count !== null && (
          <Text size="xs" c="dimmed">
            {count} comment{count === 1 ? "" : "s"}
          </Text>
        )}
      </Group>
      {content}
    </section>
  );
}

function Item({ item, mine }: { item: TimelineItem; mine: IsMine }) {
  if (item.kind === "comment") return <Bubble comment={item} mine={mine(item.author)} />;
  if (item.kind === "thread") return <Thread item={item} mine={mine} />;
  if (!item.body.trim()) return <VerdictEvent item={item} />;
  return (
    <Bubble
      comment={{ ...item, minimizedReason: null }}
      mine={mine(item.author)}
      verdict={item.state}
    />
  );
}

function Bubble({
  comment,
  mine,
  verdict,
  small = false,
}: {
  comment: ConversationComment;
  mine: boolean;
  verdict?: ReviewSummaryState;
  small?: boolean;
}) {
  const [showHidden, setShowHidden] = useState(false);

  // GitHub collapsed this one (outdated, off-topic…); so do we, one click away.
  if (comment.minimizedReason && !showHidden) {
    return (
      <Text className="er-minimized" onClick={() => setShowHidden(true)} style={{ cursor: "pointer" }}>
        {comment.author.login}'s comment was hidden as {comment.minimizedReason.toLowerCase().replace(/_/g, " ")} — show
      </Text>
    );
  }

  const v = verdict && verdict !== "COMMENTED" ? VERDICT[verdict] : null;

  return (
    <div className="er-bubble-row" data-mine={mine}>
      <Avatar src={comment.author.avatarUrl} size={small ? 20 : 26} radius="xl" mt={2}>
        {comment.author.login.slice(0, 1).toUpperCase()}
      </Avatar>
      <div className="er-bubble" data-mine={mine}>
        <Group gap={6} mb={3} wrap="nowrap">
          <Text size="xs" fw={600} truncate>
            {comment.author.login}
          </Text>
          {comment.author.isBot && (
            <Badge size="xs" variant="light" color="gray">
              bot
            </Badge>
          )}
          {v && (
            <Badge size="xs" variant="light" color={v.color} style={{ textTransform: "none" }}>
              {v.verb}
            </Badge>
          )}
          <Tooltip label={absoluteTime(comment.createdAt)}>
            <Anchor
              href={comment.url || undefined}
              target="_blank"
              size="xs"
              c="dimmed"
              style={{ flex: "none" }}
            >
              {relativeTime(comment.createdAt)}
            </Anchor>
          </Tooltip>
        </Group>
        {/* Long ones — bot reports, mostly — are clipped, one click from the rest. */}
        <Spoiler maxHeight={240} showLabel="Show more" hideLabel="Show less">
          {comment.body.trim() ? (
            <Markdown allowHtml>{comment.body}</Markdown>
          ) : (
            <Text size="xs" c="dimmed" fs="italic">
              (no text)
            </Text>
          )}
        </Spoiler>
      </div>
    </div>
  );
}

function VerdictEvent({ item }: { item: Extract<TimelineItem, { kind: "review" }> }) {
  const v = VERDICT[item.state];
  return (
    <div className="er-verdict">
      <Tooltip label={absoluteTime(item.createdAt)}>
        <span className="er-verdict-pill">
          <v.Icon size={13} color={`var(--mantine-color-${v.color}-6)`} />
          <span>
            <b>{item.author.login}</b> {v.verb} · {relativeTime(item.createdAt)}
          </span>
        </span>
      </Tooltip>
    </div>
  );
}

function Thread({ item, mine }: { item: Extract<TimelineItem, { kind: "thread" }>; mine: IsMine }) {
  // Like GitHub: resolved discussions start folded away.
  const [open, setOpen] = useState(!item.resolved);
  const where = item.line !== null ? `${item.path}:${item.line}` : item.path;
  const last = item.comments.at(-1);

  return (
    <div className="er-thread-card">
      <Group
        gap={6}
        wrap="nowrap"
        className="er-thread-head"
        onClick={() => setOpen((o) => !o)}
        mb={open ? 8 : 0}
        role="button"
        aria-expanded={open}
      >
        {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        <IconCode size={13} color="var(--mantine-color-dimmed)" />
        <Text size="xs" ff="monospace" truncate style={{ minWidth: 0 }}>
          {where}
        </Text>
        {item.resolved && (
          <Badge size="xs" variant="light" color="teal" style={{ flex: "none" }}>
            resolved
          </Badge>
        )}
        {item.outdated && (
          <Badge size="xs" variant="light" color="gray" style={{ flex: "none" }}>
            outdated
          </Badge>
        )}
        {!open && (
          <Text size="xs" c="dimmed" style={{ flex: "none" }}>
            {item.comments.length + item.more} comment{item.comments.length + item.more === 1 ? "" : "s"}
          </Text>
        )}
      </Group>
      {open && (
        <Stack gap={6}>
          {item.comments.map((c) => (
            <Bubble key={c.id} comment={c} mine={mine(c.author)} small />
          ))}
          {item.more > 0 && last && (
            <Anchor href={last.url} target="_blank" size="xs" ta="center">
              {item.more} more repl{item.more === 1 ? "y" : "ies"} on GitHub
            </Anchor>
          )}
        </Stack>
      )}
    </div>
  );
}
