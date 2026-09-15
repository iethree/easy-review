import { Alert, Button, Center, Group, Loader, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconHistory } from "@tabler/icons-react";
import type { ReviewedPullRequest } from "../../shared/types.ts";
import { ReviewedRow } from "./ReviewedRow.tsx";

interface Props {
  rows: ReviewedPullRequest[];
  /** Total fetched before filtering, so we can explain an empty result. */
  fetched: number;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (pr: ReviewedPullRequest) => void;
  onFilterAuthor: (login: string) => void;
  onLoadMore: () => void;
  onClearFilter: () => void;
  onRetry: () => void;
}

export function ReviewedList({
  rows,
  fetched,
  total,
  loading,
  loadingMore,
  hasMore,
  error,
  selectedId,
  onSelect,
  onFilterAuthor,
  onLoadMore,
  onClearFilter,
  onRetry,
}: Props) {
  if (error) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        color="red"
        title="Could not load your reviews"
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

  if (loading && fetched === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap="xs">
          <Loader />
          <Text size="sm" c="dimmed">
            Looking up what you have reviewed…
          </Text>
        </Stack>
      </Center>
    );
  }

  if (rows.length === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap={6}>
          <IconHistory size={38} color="var(--mantine-color-gray-5)" />
          <Text fw={600}>{fetched === 0 ? "No reviews yet." : "Nothing matches that filter."}</Text>
          {fetched > 0 && (
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
      <div role="listbox" aria-label="Your reviews">
        {rows.map((pr) => (
          <ReviewedRow
            key={pr.id}
            pr={pr}
            selected={pr.id === selectedId}
            onSelect={onSelect}
            onFilterAuthor={onFilterAuthor}
            showRepo={showRepo}
          />
        ))}
      </div>

      <Group justify="space-between" px="sm" py={8}>
        <Text size="10px" c="dimmed">
          {rows.length} of {fetched} loaded · {total.toLocaleString()} all time
        </Text>
        {hasMore && (
          <Button size="compact-xs" variant="subtle" loading={loadingMore} onClick={onLoadMore}>
            Load more
          </Button>
        )}
      </Group>
    </>
  );
}
