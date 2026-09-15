import {
  ActionIcon,
  Badge,
  Group,
  SegmentedControl,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconSearch, IconX } from "@tabler/icons-react";
import { useMemo, type RefObject } from "react";
import type { Difficulty } from "../../shared/difficulty.ts";
import { describeFilters, readLevel, removeTerm, setLevel } from "../../shared/filter.ts";
import { FacetSelect, type Facet } from "./FacetSelect.tsx";

export type SortKey = "quickest" | "newest" | "oldest";

interface Props {
  query: string;
  onQueryChange: (next: string) => void;
  sort: SortKey;
  onSortChange: (next: SortKey) => void;
  authors: Facet[];
  repos: Facet[];
  counts: Record<Difficulty, number>;
  total: number;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function FilterBar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  authors,
  repos,
  counts,
  total,
  inputRef,
}: Props) {
  const level = readLevel(query);
  const chips = useMemo(() => describeFilters(query), [query]);

  return (
    <>
      <Group gap="xs" mb={chips.length > 0 ? 6 : "sm"} wrap="nowrap" align="center">
        <TextInput
          ref={inputRef}
          size="xs"
          placeholder="Search title, repo, author…  try author:kim or is:easy"
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
          token="author"
          facets={authors}
          query={query}
          onQueryChange={onQueryChange}
          placeholder="Any author"
          w={168}
          visibleFrom="sm"
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
          value={level ?? "all"}
          onChange={(v) => onQueryChange(setLevel(query, v === "all" ? null : (v as Difficulty)))}
          data={[
            { label: `All ${total}`, value: "all" },
            { label: `Easy ${counts.easy}`, value: "easy" },
            { label: `Med ${counts.medium}`, value: "medium" },
            { label: `Hard ${counts.hard}`, value: "hard" },
          ]}
        />

        <SegmentedControl
          size="xs"
          value={sort}
          onChange={(v) => onSortChange(v as SortKey)}
          data={[
            { label: "Quickest", value: "quickest" },
            { label: "Newest", value: "newest" },
            { label: "Oldest", value: "oldest" },
          ]}
          visibleFrom="lg"
        />
      </Group>

      {chips.length > 0 && (
        <Group gap={6} mb="sm" wrap="wrap">
          {chips.map((chip) => (
            <Badge
              key={chip.term}
              size="sm"
              variant="light"
              color={chip.color}
              rightSection={
                <Tooltip label="Remove">
                  <ActionIcon
                    size={13}
                    variant="transparent"
                    color={chip.color}
                    onClick={() => onQueryChange(removeTerm(query, chip.term))}
                    aria-label={`Remove filter ${chip.label}`}
                  >
                    <IconX size={11} />
                  </ActionIcon>
                </Tooltip>
              }
              style={{ textTransform: "none" }}
            >
              {chip.label}
            </Badge>
          ))}
          <Text
            size="10px"
            c="dimmed"
            style={{ cursor: "pointer" }}
            td="underline"
            onClick={() => onQueryChange("")}
          >
            clear all
          </Text>
        </Group>
      )}
    </>
  );
}
