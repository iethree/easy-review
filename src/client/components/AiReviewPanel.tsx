import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Code,
  CopyButton,
  Group,
  Loader,
  Popover,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconMessageChatbot,
  IconPlayerStop,
  IconRefresh,
  IconRobot,
  IconTerminal2,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { isActive, type AiReviewSummary } from "../../shared/aiReview.ts";
import type { PullRequest } from "../../shared/types.ts";
import { useReviewDetail } from "../hooks/useLocalReviews.ts";
import { relativeTime } from "../time.ts";
import { splitReview } from "../../shared/findings.ts";
import { Findings } from "./Findings.tsx";
import { ReviewScreenshots } from "./Markdown.tsx";
import { ProseReview } from "./ProseReview.tsx";

interface Props {
  pr: PullRequest;
  job: AiReviewSummary;
  /** Run this reviewer again. */
  onStart: () => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  /** A finding went into your review. */
  onFindingAdded?: () => void;
  /** Open the chat about this review: about one part of it, if quoted. */
  onAsk?: (quote?: string) => void;
}

const STATUS = {
  queued: { label: "Queued", color: "gray" },
  preparing: { label: "Preparing", color: "indigo" },
  reviewing: { label: "Reviewing", color: "indigo" },
  done: { label: "Done", color: "teal" },
  failed: { label: "Failed", color: "red" },
  cancelled: { label: "Cancelled", color: "gray" },
} as const;

/** How long from one time to another, or to now: "42s", "3m 07s", "1h 02m". */
export function duration(fromIso: string | null, toIso: string | null): string {
  if (!fromIso) return "";
  const ms = (toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso);
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, "0")}m`;
}

/** Re-renders once a second while running, for the elapsed-time counter. */
function useTick(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function AiReviewPanel({ pr, job, onStart, onCancel, onRemove, onFindingAdded, onAsk }: Props) {
  const detail = useReviewDetail(job);
  // The prose, and the findings block the review ends with, apart.
  const review = useMemo(() => (detail?.review ? splitReview(detail.review) : null), [detail?.review]);
  const running = isActive(job.status);
  useTick(running);

  if (job.status === "cancelled") {
    return (
      <Center py={60} px="md">
        <Stack align="center" gap="sm" maw={420}>
          <IconRobot size={40} color="var(--mantine-color-gray-5)" />
          <Text fw={600}>Review cancelled</Text>
          <Text size="sm" c="dimmed" ta="center">
            Checks out #{pr.number} into its own worktree and has Claude Code review it as{" "}
            {job.reviewerName}.
          </Text>
          <Button leftSection={<IconRobot size={16} />} onClick={onStart}>
            Review again
          </Button>
        </Stack>
      </Center>
    );
  }

  const status = STATUS[job.status];
  const stale = job.status === "done" && job.headSha !== pr.headSha;
  const activity = detail?.activity ?? [];
  // Its session goes on in its checkout; once that's removed, it can't.
  const ask = job.status === "done" && detail?.sessionId && detail.worktreePath ? onAsk : undefined;

  return (
    // Its screenshots, for the Markdown in it to show.
    <ReviewScreenshots.Provider value={job.id}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="center">
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            <Badge
              color={status.color}
              variant="light"
              leftSection={running ? <Loader size={10} color={status.color} /> : null}
              style={{ flex: "none" }}
            >
              {status.label}
            </Badge>
            <Text size="sm" c="dimmed" truncate>
              {running ? job.phase : job.finishedAt ? `finished ${relativeTime(job.finishedAt)}` : ""}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace" style={{ flex: "none" }}>
              {duration(job.startedAt ?? job.createdAt, running ? null : job.finishedAt)}
            </Text>
          </Group>

          <Group gap={6} wrap="nowrap">
            {running ? (
              <Button
                size="compact-sm"
                variant="light"
                color="red"
                leftSection={<IconPlayerStop size={14} />}
                onClick={() => onCancel(job.id)}
              >
                Cancel
              </Button>
            ) : (
              <Button
                size="compact-sm"
                variant="light"
                leftSection={<IconRefresh size={14} />}
                onClick={onStart}
              >
                Re-run
              </Button>
            )}

            {ask && (
              <Button
                size="compact-sm"
                variant="light"
                leftSection={<IconMessageChatbot size={14} />}
                onClick={() => ask()}
              >
                {job.chatPhase ? "Answering…" : detail?.chat?.length ? "Chat" : "Ask"}
              </Button>
            )}

            {detail?.review && (
              <CopyButton value={detail.review}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? "Copied" : "Copy the review as Markdown"}>
                    <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy} aria-label="Copy review">
                      {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            )}

            {detail?.resumeCommand && <ResumeButton command={detail.resumeCommand} />}

            {!running && (
              <Tooltip label="Delete this review and its worktree">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => onRemove(job.id)}
                  aria-label="Delete review"
                >
                  <IconTrash size={15} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>

        {stale && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
            <Text size="xs">
              This review is of {job.headSha.slice(0, 7)}; the pull request is now at{" "}
              {pr.headSha.slice(0, 7)}. Re-run to review the new commits.
            </Text>
          </Alert>
        )}

        {job.status === "failed" && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="The review failed">
            <Text size="sm">{job.error}</Text>
            {detail?.stderrTail && (
              <Code block mt="xs" fz={11}>
                {detail.stderrTail}
              </Code>
            )}
          </Alert>
        )}

        {job.status === "done" && review && (
          <>
            <ProseReview
              pr={pr}
              review={{ id: job.id, headSha: job.headSha }}
              markdown={review.prose}
              onAdded={() => onFindingAdded?.()}
              onAsk={ask}
            />
            {review.findings.length > 0 && (
              <Findings
                pr={pr}
                review={{ id: job.id, headSha: job.headSha }}
                findings={review.findings}
                onAdded={() => onFindingAdded?.()}
                onAsk={ask}
              />
            )}
          </>
        )}
        {job.status === "done" && !detail && (
          <Center py="lg">
            <Loader size="sm" />
          </Center>
        )}

        {(running || (job.status !== "done" && activity.length > 0)) && (
          <Stack gap={2} className="er-activity">
            {activity.length === 0 ? (
              <Text size="xs" c="dimmed">
                {job.status === "queued" ? "Waiting for another review to finish…" : "Getting started…"}
              </Text>
            ) : (
              activity
                .slice(-60)
                .reverse()
                .map((a, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: entries can share a timestamp; the index tells them apart
                  <Group key={`${a.at}:${i}`} gap={8} wrap="nowrap">
                    <Text size="xs" c="dimmed" ff="monospace" style={{ flex: "none" }} w={64}>
                      {new Date(a.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hourCycle: "h23",
                      })}
                    </Text>
                    <Text size="xs" ff="monospace" truncate>
                      {a.text}
                    </Text>
                  </Group>
                ))
            )}
          </Stack>
        )}

        {detail && (
          <Text size="10px" c="dimmed" mt="xs" style={{ lineHeight: 1.6 }}>
            Commit {job.headSha.slice(0, 7)}
            {detail.model && ` · ${detail.model}`}
            {running
              ? ` · ${activity.length} step${activity.length === 1 ? "" : "s"} so far`
              : job.turns !== null && ` · ${job.turns} turns`}
            {job.costUsd !== null && ` · $${job.costUsd.toFixed(2)}`}
            {!running && job.startedAt && job.finishedAt && ` · took ${duration(job.startedAt, job.finishedAt)}`}
            {detail.clonePath && ` · clone ${detail.clonePath} (${detail.cloneSource})`}
            {detail.worktreePath ? (
              <>
                <br />
                Worktree {detail.worktreePath}
              </>
            ) : (
              detail.sessionId &&
              !running && (
                <>
                  <br />
                  Its checkout has been removed, so this session can't be continued in a terminal —
                  re-run to review it again.
                </>
              )
            )}
          </Text>
        )}
      </Stack>
    </ReviewScreenshots.Provider>
  );
}

function ResumeButton({ command }: { command: string }) {
  return (
    <Popover width={460} position="bottom-end" shadow="md">
      <Popover.Target>
        <Tooltip label="Continue this conversation in a terminal">
          <ActionIcon variant="subtle" color="gray" aria-label="Continue in terminal">
            <IconTerminal2 size={15} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="xs">
            Picks up this exact session to ask follow-up questions. It keeps the same restrictions,
            since the folder holds the pull request's code, not yours.
          </Text>
          <Code block fz={11} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {command}
          </Code>
          <CopyButton value={command}>
            {({ copied, copy }) => (
              <Button size="compact-xs" variant="light" onClick={copy} leftSection={copied ? <IconCheck size={13} /> : <IconCopy size={13} />}>
                {copied ? "Copied" : "Copy command"}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** A review's state, as the icon on its tab. */
export function StatusIcon({ job }: { job: AiReviewSummary | undefined }) {
  // The tab's own text colour: an indigo loader vanished on the selected tab, which is indigo too.
  if (job && isActive(job.status)) return <Loader size={14} color="currentColor" />;
  const color =
    job?.status === "done"
      ? "var(--mantine-color-teal-6)"
      : job?.status === "failed"
        ? "var(--mantine-color-red-6)"
        : undefined; // currentColor
  return <IconRobot size={14} color={color} />;
}
