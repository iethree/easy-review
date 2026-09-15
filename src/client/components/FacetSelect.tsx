import { Select, type MantineBreakpoint } from "@mantine/core";
import { useMemo } from "react";
import { readToken, upsertToken } from "../../shared/filter.ts";

export interface Facet {
  key: string;
  count: number;
}

interface Props {
  /** The query token this picker reads and writes, e.g. `author` or `repo`. */
  token: string;
  facets: Facet[];
  query: string;
  onQueryChange: (next: string) => void;
  placeholder: string;
  w: number;
  visibleFrom?: MantineBreakpoint;
}

/**
 * A dropdown over one query token. Like every other control on the bar it
 * writes into the filter text rather than holding its own state, so the chips
 * and the search box can never disagree with it.
 */
export function FacetSelect({
  token,
  facets,
  query,
  onQueryChange,
  placeholder,
  w,
  visibleFrom,
}: Props) {
  const value = readToken(query, token);
  const data = useMemo(
    () => facets.map((f) => ({ value: f.key.toLowerCase(), label: `${f.key} · ${f.count}` })),
    [facets],
  );

  // A picker with one option is noise — unless it's holding an active filter
  // that still needs a way to be cleared.
  if (facets.length < 2 && !value) return null;

  return (
    <Select
      size="xs"
      w={w}
      placeholder={placeholder}
      searchable
      clearable
      nothingFoundMessage="No match"
      data={data}
      value={value}
      onChange={(v) => onQueryChange(upsertToken(query, token, v))}
      comboboxProps={{ withinPortal: true }}
      visibleFrom={visibleFrom}
      aria-label={placeholder}
    />
  );
}

/** Counts by key, most common first — the shape FacetSelect wants. */
export function tally<T>(items: T[], keyOf: (item: T) => string): Facet[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
