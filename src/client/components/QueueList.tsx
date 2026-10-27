import { Alert, Button, Center, Group, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconEyeOff, IconInbox } from "@tabler/icons-react";
import { prKey, type AiReviewSummary } from "../../shared/aiReview.ts";
import type { PullRequest, ReviewEvent, Settings } from "../../shared/types.ts";
import { PrRow } from "./PrRow.tsx";
import { LoadingScene, MINE_MESSAGES, QUEUE_MESSAGES } from "./Loading.tsx";

interface Props {
  rows: PullRequest[];
  /** Everything in the queue before filtering, so we can explain an empty result. */
  total: number;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
  settings: Settings;
  selectedId: string | null;
  reviewed: Record<string, ReviewEvent>;
  onSelect: (pr: PullRequest) => void;
  onFilterAuthor: (login: string) => void;
  onClearFilter: () => void;
  onRetry: () => void;
  /**
   * "hidden" lists the PRs you tucked away, each with an unhide button;
   * "mine" lists your own.
   */
  variant?: "queue" | "hidden" | "mine";
  onUnhide?: (pr: PullRequest) => void;
  /** Present only when local Claude reviews are available. */
  ai?: {
    byPr: Map<string, AiReviewSummary>;
    onStart: (pr: PullRequest) => void;
    onOpen: (pr: PullRequest) => void;
  };
}

export function QueueList({
  rows,
  total,
  loaded,
  loading,
  error,
  fetchedAt,
  settings,
  selectedId,
  reviewed,
  onSelect,
  onFilterAuthor,
  onClearFilter,
  onRetry,
  variant = "queue",
  onUnhide,
  ai,
}: Props) {
  if (error) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        color="red"
        title="Could not load your review queue"
        m="sm"
      >
        <Stack gap="xs" align="flex-start">
          <Text size="sm">{error}</Text>
          <Button size="xs" variant="light" color="red" onClick={onRetry}>
            Try again
          </Button>
        </Stack>
      </Alert>
    );
  }

  if (loading && !loaded) {
    return <LoadingScene messages={variant === "mine" ? MINE_MESSAGES : QUEUE_MESSAGES} />;
  }

  if (rows.length === 0 && variant === "hidden") {
    return (
      <Center py="xl" px="md">
        <Stack align="center" gap={6}>
          <IconEyeOff size={38} color="var(--mantine-color-gray-5)" />
          <Text fw={600}>Nothing hidden.</Text>
          <Text size="sm" c="dimmed" ta="center">
            Press ⇧H on a pull request in Needs review to tuck it away here. It stays hidden
            until you unhide it.
          </Text>
        </Stack>
      </Center>
    );
  }

  if (rows.length === 0) {
    return (
      <Center py="xl" px="md">
        <Stack align="center" gap={6}>
          <IconInbox size={38} color="var(--mantine-color-gray-5)" />
          <Text fw={600}>
            {total > 0 ? "Nothing matches that filter." : variant === "mine" ? "Nothing open." : "Inbox zero."}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {total === 0
              ? variant === "mine"
                ? "You have no open pull requests, and none are assigned to you."
                : "No pull requests are waiting on your review."
              : `${total} request${total === 1 ? " is" : "s are"} hidden by the current filter.`}
          </Text>
          {total > 0 && (
            <Button size="xs" variant="light" onClick={onClearFilter}>
              Clear filter
            </Button>
          )}
        </Stack>
      </Center>
    );
  }

  const showRepo = rows.some((pr) => pr.repo !== rows[0]?.repo);

  return (
    <>
      <div
        role="listbox"
        aria-label={
          variant === "hidden"
            ? "Hidden pull requests"
            : variant === "mine"
              ? "Your pull requests"
              : "Pull requests waiting on your review"
        }
      >
        {rows.map((pr) => (
          <PrRow
            key={pr.id}
            pr={pr}
            settings={settings}
            selected={pr.id === selectedId}
            reviewed={reviewed[pr.id]}
            onSelect={onSelect}
            onFilterAuthor={onFilterAuthor}
            showRepo={showRepo}
            aiJob={ai?.byPr.get(prKey(pr))}
            onAiStart={ai?.onStart}
            onAiOpen={ai?.onOpen}
            onUnhide={variant === "hidden" ? onUnhide : undefined}
          />
        ))}
      </div>

      <Group justify="space-between" px="sm" py={8}>
        <Text size="10px" c="dimmed">
          {variant === "hidden" ? (
            <>{rows.length} hidden · ⇧H unhides the selected one</>
          ) : (
            <>
              {rows.length} of {total} · press{" "}
              <Text span fz="inherit" fw={700}>
                ?
              </Text>{" "}
              for shortcuts
            </>
          )}
        </Text>
        {fetchedAt && (
          <Text size="10px" c="dimmed">
            Updated {new Date(fetchedAt).toLocaleTimeString()}
          </Text>
        )}
      </Group>
    </>
  );
}
