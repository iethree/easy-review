import { ActionIcon, Badge, Group, Menu, SegmentedControl, Text, TextInput, Tooltip } from "@mantine/core";
import { IconArrowsSort, IconCheck, IconSearch, IconX } from "@tabler/icons-react";
import { useMemo, type ReactNode, type RefObject } from "react";
import { describeFilters, removeTerm } from "../../shared/filter.ts";

export type SortKey = "quickest" | "newest" | "oldest";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "quickest", label: "Quickest to review" },
  { value: "newest", label: "Newest activity" },
  { value: "oldest", label: "Oldest activity" },
];

interface Props {
  query: string;
  onQueryChange: (next: string) => void;
  placeholder: string;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Absent for lists that keep their own order (history). */
  sort?: SortKey;
  onSortChange?: (next: SortKey) => void;
  /** A segmented control under the box: difficulty, or verdict. */
  segments?: { value: string; data: { label: string; value: string }[]; onChange: (value: string) => void };
  /** Shown in place of the box, for lists with nothing to search. */
  note?: ReactNode;
}

/**
 * The one search box, at the top of the list it searches. Free text matches
 * the title, repo, author and number; `author:`, `repo:` and `is:` narrow it
 * further, and each shows as a chip you can remove. The difficulty control and
 * an author's name on a row write into the same text, so what you see in the
 * box is always the whole filter.
 */
export function ListFilter({ query, onQueryChange, placeholder, inputRef, sort, onSortChange, segments, note }: Props) {
  const chips = useMemo(() => describeFilters(query), [query]);

  if (note) {
    return (
      <div className="er-pane-head er-list-filter">
        <Text size="xs" c="dimmed">
          {note}
        </Text>
      </div>
    );
  }

  return (
    <div className="er-pane-head er-list-filter">
      <Group gap={6} wrap="nowrap">
        <TextInput
          ref={inputRef}
          size="xs"
          placeholder={placeholder}
          leftSection={<IconSearch size={14} />}
          rightSection={
            query ? (
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => onQueryChange("")} aria-label="Clear search">
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
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Search the list"
        />
        {sort && onSortChange && (
          <Menu position="bottom-end" shadow="md" width={200}>
            <Menu.Target>
              <Tooltip label={`Sort: ${SORTS.find((s) => s.value === sort)?.label}`}>
                <ActionIcon variant="subtle" color="gray" size="md" aria-label="Sort">
                  <IconArrowsSort size={16} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              {SORTS.map((s) => (
                <Menu.Item
                  key={s.value}
                  onClick={() => onSortChange(s.value)}
                  rightSection={s.value === sort ? <IconCheck size={14} /> : null}
                >
                  {s.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>

      {segments && (
        <SegmentedControl
          size="xs"
          fullWidth
          mt={8}
          value={segments.value}
          onChange={segments.onChange}
          data={segments.data}
        />
      )}

      {chips.length > 0 && (
        <Group gap={6} mt={8} wrap="wrap">
          {chips.map((chip) => (
            <Badge
              key={chip.term}
              size="sm"
              variant="light"
              color={chip.color}
              rightSection={
                <ActionIcon
                  size={13}
                  variant="transparent"
                  color={chip.color}
                  onClick={() => onQueryChange(removeTerm(query, chip.term))}
                  aria-label={`Remove filter ${chip.label}`}
                >
                  <IconX size={11} />
                </ActionIcon>
              }
              style={{ textTransform: "none" }}
            >
              {chip.label}
            </Badge>
          ))}
          <Text
            component="button"
            type="button"
            size="10px"
            c="dimmed"
            td="underline"
            onClick={() => onQueryChange("")}
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
          >
            clear all
          </Text>
        </Group>
      )}
    </div>
  );
}
