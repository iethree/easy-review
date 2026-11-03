/**
 * The order you've put your reviewers in, in Settings. It is the order
 * everywhere: the reviewer menus, the tabs over a pull request, the default
 * reviewer (the first). Reviewers you haven't placed — new ones, or every one
 * before you first drag — come after, by name.
 */

/** `items` in that order; `key` gives each one's reviewer id and name. */
export function inReviewerOrder<T>(
  items: readonly T[],
  order: readonly string[],
  key: (item: T) => { id: string; name: string },
): T[] {
  const place = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const pa = place.get(ka.id) ?? Number.POSITIVE_INFINITY;
    const pb = place.get(kb.id) ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa < pb ? -1 : 1;
    return ka.name.localeCompare(kb.name) || ka.id.localeCompare(kb.id);
  });
}

/** `ids` with `id` taken out and put back at `index`. Unchanged if `id` isn't there. */
export function moveId(ids: readonly string[], id: string, index: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const rest = ids.filter((x) => x !== id);
  const to = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, to), id, ...rest.slice(to)];
}
