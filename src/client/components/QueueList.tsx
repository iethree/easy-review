import { Alert, Button, Center, Group, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconArchive, IconInbox } from "@tabler/icons-react";
import { useState } from "react";
import { verdictFor, type AiReviewSummary, type Reviewer } from "../../shared/aiReview.ts";
import { rowKey } from "../reviewRows.ts";
import type { PullRequest, ReviewEvent } from "../../shared/types.ts";
import { PrRow, RowReviewsContext } from "./PrRow.tsx";
import { QuickReviewMenu } from "./QuickReviewMenu.tsx";
import { LoadingScene, MINE_MESSAGES, QUEUE_MESSAGES } from "./Loading.tsx";

const NO_REVIEWS = new Map<string, AiReviewSummary[]>();

interface Props {
  rows: PullRequest[];
  /** Everything in the queue before filtering, so we can explain an empty result. */
  total: number;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
  selectedId: string | null;
  reviewed: Record<string, ReviewEvent>;
  onSelect: (pr: PullRequest) => void;
  onFilterAuthor: (login: string) => void;
  onClearFilter: () => void;
  onRetry: () => void;
  /**
   * "hidden" is Archive: what you archived, each row with a button to bring it back;
   * "mine" lists your own.
   */
  variant?: "queue" | "hidden" | "mine";
  onUnhide?: (pr: PullRequest) => void;
  /** Present only when local Claude reviews are available. */
  ai?: {
    /** One review per pull request, standing for all its reviewers (see groupByPr). */
    byPr: Map<string, AiReviewSummary>;
    reviewsByPr: Map<string, AiReviewSummary[]>;
    reviewers: Reviewer[];
    /** Start a reviewer on a pull request, without leaving what's on screen. */
    start: (pr: PullRequest, reviewerId: string) => void;
  };
}

export function QueueList({
  rows,
  total,
  loaded,
  loading,
  error,
  fetchedAt,
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
  const [menuAt, setMenuAt] = useState<{ pr: PullRequest; x: number; y: number } | null>(null);
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
          <IconArchive size={38} color="var(--mantine-color-gray-5)" />
          <Text fw={600}>Nothing archived.</Text>
          <Text size="sm" c="dimmed" ta="center">
            Press ⇧H on a pull request or a review in Review to archive it here. It
            stays out of Review until you bring it back.
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
    <RowReviewsContext.Provider value={ai?.reviewsByPr ?? NO_REVIEWS}>
      <div
        // Right-click a row for its reviewers. One handler for the list, so
        // the rows (memoised) don't each need one.
        onContextMenu={(e) => {
          if (!ai) return;
          const id = (e.target as HTMLElement).closest<HTMLElement>("[data-pr-id]")?.dataset.prId;
          const pr = id ? rows.find((r) => r.id === id) : undefined;
          if (!pr) return;
          e.preventDefault();
          setMenuAt({ pr, x: e.clientX, y: e.clientY });
        }}
        role="listbox"
        aria-label={
          variant === "hidden"
            ? "Archived pull requests and reviews"
            : variant === "mine"
              ? "Your pull requests"
              : "Pull requests and other reviews waiting on you"
        }
      >
        {rows.map((pr) => (
          <PrRow
            key={pr.id}
            pr={pr}
            selected={pr.id === selectedId}
            reviewed={reviewed[pr.id]}
            onSelect={onSelect}
            onFilterAuthor={onFilterAuthor}
            showRepo={showRepo}
            aiJob={ai?.byPr.get(rowKey(pr))}
            aiCount={ai?.reviewsByPr.get(rowKey(pr))?.length ?? 0}
            aiVerdict={verdictFor(ai?.reviewsByPr.get(rowKey(pr)) ?? [], pr.headSha)}
            onUnhide={variant === "hidden" ? onUnhide : undefined}
          />
        ))}
      </div>
      {ai && (
        <QuickReviewMenu
          at={menuAt}
          reviewers={ai.reviewers}
          reviews={(menuAt && ai.reviewsByPr.get(rowKey(menuAt.pr))) || []}
          onStart={ai.start}
          onClose={() => setMenuAt(null)}
        />
      )}

      <Group justify="space-between" px="sm" py={8}>
        <Text size="10px" c="dimmed">
          {variant === "hidden" ? (
            <>{rows.length} archived · ⇧H brings the selected one back</>
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
    </RowReviewsContext.Provider>
  );
}
