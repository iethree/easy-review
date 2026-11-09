import { ActionIcon, Anchor, Badge, Button, Group, NavLink, Stack, Tabs, Text, Title, Tooltip } from "@mantine/core";
import { IconArrowLeft, IconExternalLink, IconList, IconPlus } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  describeTarget,
  isActive,
  reviewKey,
  type AiReviewSummary,
  type Reviewer,
  type ReviewKind,
} from "../../shared/aiReview.ts";
import { groupReviews, type NewReviewRequest } from "../hooks/useLocalReviews.ts";
import { relativeTime } from "../time.ts";
import { AiReviewPanel, StatusIcon } from "./AiReviewPanel.tsx";
import { ChatPane, type ChatRequest } from "./ChatPane.tsx";
import { ReviewerMenu } from "./ReviewerMenu.tsx";

interface Props {
  jobs: AiReviewSummary[];
  reviewers: Reviewer[];
  /** What's open: a review's key (see reviewKey), and which reviewer's. */
  selected: { key: string; reviewerId: string | null } | null;
  onSelect: (selected: { key: string; reviewerId: string | null }) => void;
  onStart: (request: NewReviewRequest) => Promise<AiReviewSummary[]>;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  ask: (id: string, question: string, quote?: string) => Promise<void>;
  question: (id: string, text: string) => Promise<void>;
  stopChat: (id: string) => void;
  /** A pull request's review whose pull request is in one of your lists, and opening it there. */
  listed: (job: AiReviewSummary) => boolean;
  openInList: (job: AiReviewSummary) => boolean;
  onNew: () => void;
  onManageReviewers: () => void;
  onClose: () => void;
}

const KIND_LABEL: Record<ReviewKind, string> = { pr: "Pull request", diff: "Diff", repo: "Repository" };

/** Where it is on GitHub. */
function githubUrl(job: AiReviewSummary): string {
  const repo = `https://github.com/${job.owner}/${job.name}`;
  if (job.kind === "diff") return `${repo}/compare/${job.baseSha}...${job.headSha}`;
  if (job.kind === "repo") return `${repo}/tree/${job.headSha}`;
  return `${repo}/pull/${job.number}`;
}

/** The same thing again, for re-running a reviewer or adding one. */
function requestFor(job: AiReviewSummary, reviewerId: string): NewReviewRequest {
  const common = { owner: job.owner, name: job.name, reviewers: [reviewerId] };
  if (job.kind === "diff") return { ...common, kind: "diff", base: job.baseSha ?? "", head: job.headSha };
  if (job.kind === "repo") return { ...common, kind: "repo", head: job.headSha };
  return { ...common, kind: "pr", number: job.number, adhoc: true };
}

/**
 * The reviews started from New review — of diffs, of whole repositories, and
 * of pull requests asked for by number — a page of their own, in place of the
 * pull requests. Escape goes back.
 */
export function OtherReviewsPage(props: Props) {
  const { jobs, reviewers, selected, onSelect, onClose } = props;

  // Each thing reviewed, newest first, with the latest review by each reviewer.
  const targets = useMemo(() => {
    const { reviewsByPr } = groupReviews(
      jobs.filter((j) => j.adhoc || j.kind !== "pr"),
      reviewKey,
    );
    return [...reviewsByPr.entries()]
      .map(([key, reviews]) => ({
        key,
        reviews,
        latest: reviews.reduce((a, b) => (b.createdAt > a.createdAt ? b : a)),
      }))
      .sort((a, b) => b.latest.createdAt.localeCompare(a.latest.createdAt));
  }, [jobs]);

  const target = targets.find((t) => t.key === selected?.key) ?? targets[0];
  const review =
    target?.reviews.find((r) => r.reviewerId === selected?.reviewerId) ?? target?.latest ?? undefined;

  const [picking, setPicking] = useState(false);
  const [chat, setChat] = useState<ChatRequest | null>(null);
  const asks = useRef(0);
  const chatJob = chat ? jobs.find((j) => j.id === chat.jobId) : undefined;

  // Escape goes back to the pull requests — once out of any text box.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".mantine-Modal-root")) return;
      const el = e.target as HTMLElement | null;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.blur();
      else closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const start = (request: NewReviewRequest) => void props.onStart(request).catch(() => {});

  return (
    <div className="er-page">
      <div className="er-page-head">
        <Group gap="xs">
          <Tooltip label="Back to pull requests (Esc)">
            <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Back">
              <IconArrowLeft size={17} />
            </ActionIcon>
          </Tooltip>
          <Title order={2}>Other reviews</Title>
        </Group>
        <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={props.onNew}>
          New review
        </Button>
      </div>

      <div className="er-page-body er-others" data-chat={chatJob !== undefined}>
        <nav className="er-pane er-page-nav" aria-label="Reviews">
          {targets.length === 0 && (
            <Text size="sm" c="dimmed" p="sm">
              Nothing yet. A review of a diff, a whole repository, or a pull request by number shows here.
            </Text>
          )}
          {targets.map((t) => (
            <NavLink
              key={t.key}
              active={t.key === target?.key}
              onClick={() => onSelect({ key: t.key, reviewerId: null })}
              label={t.latest.title}
              description={`${t.latest.owner}/${t.latest.name} · ${describeTarget(t.latest)} · ${relativeTime(t.latest.createdAt)}`}
              rightSection={
                <Group gap={2} wrap="nowrap">
                  {t.reviews.map((r) => (
                    <StatusIcon key={r.id} job={r} />
                  ))}
                </Group>
              }
            />
          ))}
        </nav>

        <div className="er-pane er-page-content">
          {target && review && (
            <Stack gap="sm" p="md">
              <Stack gap={4}>
                <Group gap="xs" wrap="nowrap">
                  <Badge variant="light" color="gray" style={{ flex: "none" }}>
                    {KIND_LABEL[review.kind]}
                  </Badge>
                  <Title order={3} lineClamp={1}>
                    {review.title}
                  </Title>
                </Group>
                <Group gap="xs">
                  <Text size="sm" c="dimmed">
                    {review.owner}/{review.name} · {describeTarget(review)}
                  </Text>
                  <Anchor href={githubUrl(review)} target="_blank" size="sm">
                    <Group gap={4} wrap="nowrap">
                      On GitHub <IconExternalLink size={13} />
                    </Group>
                  </Anchor>
                  {props.listed(review) && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      leftSection={<IconList size={13} />}
                      onClick={() => props.openInList(review)}
                      title="Open it in the list that has it, where its points can go into your review"
                    >
                      Open in your lists
                    </Button>
                  )}
                </Group>
              </Stack>

              <Tabs
                value={review.reviewerId}
                onChange={(v) => v && onSelect({ key: target.key, reviewerId: v })}
                className="er-pane-tabs"
              >
                <Tabs.List>
                  {target.reviews.map((r) => (
                    <Tabs.Tab key={r.id} value={r.reviewerId} leftSection={<StatusIcon job={r} />}>
                      {r.reviewerName}
                    </Tabs.Tab>
                  ))}
                  <ReviewerMenu
                    reviewers={reviewers}
                    reviews={target.reviews}
                    opened={picking}
                    onOpenChange={setPicking}
                    onStart={(id) => {
                      setPicking(false);
                      start(requestFor(review, id));
                      onSelect({ key: target.key, reviewerId: id });
                    }}
                    onShow={(id) => {
                      setPicking(false);
                      onSelect({ key: target.key, reviewerId: id });
                    }}
                    onManage={props.onManageReviewers}
                  />
                </Tabs.List>
              </Tabs>

              <AiReviewPanel
                key={review.id}
                pr={null}
                job={review}
                onStart={() => start(requestFor(review, review.reviewerId))}
                onCancel={props.onCancel}
                onRemove={props.onRemove}
                onAsk={(quote) => setChat({ jobId: review.id, quote: quote ?? null, n: ++asks.current })}
                onQuestion={isActive(review.status) ? (text) => props.question(review.id, text) : undefined}
              />
            </Stack>
          )}
        </div>

        {chatJob && chat && (
          <ChatPane
            key={chatJob.id}
            pr={null}
            job={chatJob}
            request={chat}
            onAsk={props.ask}
            onStop={props.stopChat}
            onClose={() => setChat(null)}
          />
        )}
      </div>
    </div>
  );
}
