import { ActionIcon, Group, SegmentedControl, Text, TextInput } from "@mantine/core";
import { IconSearch, IconX } from "@tabler/icons-react";
import type { RefObject } from "react";
import type { ReviewVerdict } from "../../shared/types.ts";
import { FacetSelect, type Facet } from "./FacetSelect.tsx";

export type VerdictFilter = ReviewVerdict | "all";

interface Props {
  query: string;
  onQueryChange: (next: string) => void;
  verdict: VerdictFilter;
  onVerdictChange: (next: VerdictFilter) => void;
  counts: Map<ReviewVerdict, number>;
  repos: Facet[];
  loaded: number;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function HistoryFilterBar({
  query,
  onQueryChange,
  verdict,
  onVerdictChange,
  counts,
  repos,
  loaded,
  inputRef,
}: Props) {
  return (
    <Group gap="xs" mb="sm" wrap="nowrap" align="center">
      <TextInput
        ref={inputRef}
        size="xs"
        placeholder="Search your reviews — title, repo, author…"
        leftSection={<IconSearch size={14} />}
        rightSection={
          query ? (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
            >
              <IconX size={13} />
            </ActionIcon>
          ) : (
            <Text size="10px" c="dimmed" pr={6}>
              /
            </Text>
          )
        }
        value={query}
        onChange={(e) => onQueryChange(e.currentTarget.value)}
        style={{ flex: 1, minWidth: 180 }}
      />
      <FacetSelect
        token="repo"
        facets={repos}
        query={query}
        onQueryChange={onQueryChange}
        placeholder="Any repository"
        w={210}
        visibleFrom="md"
      />
      <SegmentedControl
        size="xs"
        value={verdict}
        onChange={(v) => onVerdictChange(v as VerdictFilter)}
        data={[
          { label: `All ${loaded}`, value: "all" },
          { label: `Approved ${counts.get("APPROVED") ?? 0}`, value: "APPROVED" },
          {
            label: `Changes ${counts.get("CHANGES_REQUESTED") ?? 0}`,
            value: "CHANGES_REQUESTED",
          },
          { label: `Comment ${counts.get("COMMENTED") ?? 0}`, value: "COMMENTED" },
        ]}
      />
    </Group>
  );
}
