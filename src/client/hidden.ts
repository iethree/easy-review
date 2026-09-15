/**
 * Pull requests you've hidden from the queue. Pure helpers, so the rules are
 * testable apart from React and localStorage.
 */

import { prKey } from "../shared/aiReview.ts";

/** owner/name#number (lowercase) → when you hid it, as an ISO timestamp. */
export type HiddenMap = Record<string, string>;

/** Reads what was stored, shrugging off anything that isn't a map of strings. */
export function parseHidden(raw: string | null): HiddenMap {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: HiddenMap = {};
    for (const [key, at] of Object.entries(value)) if (typeof at === "string") out[key] = at;
    return out;
  } catch {
    return {};
  }
}

export function isHidden(hidden: HiddenMap, pr: { owner: string; name: string; number: number }): boolean {
  return Object.hasOwn(hidden, prKey(pr));
}

/** The queue minus what's hidden, and the hidden ones, most recently hidden first. */
export function splitHidden<T extends { owner: string; name: string; number: number }>(
  prs: T[],
  hidden: HiddenMap,
): { shown: T[]; hidden: T[] } {
  const shown: T[] = [];
  const tucked: T[] = [];
  for (const pr of prs) (isHidden(hidden, pr) ? tucked : shown).push(pr);
  tucked.sort((a, b) => (hidden[prKey(b)] ?? "").localeCompare(hidden[prKey(a)] ?? ""));
  return { shown, hidden: tucked };
}

/** Where the selection should go when `id` leaves the list: the next row, else the one before. */
export function neighbourAfterRemoving<T extends { id: string }>(list: T[], id: string): string | null {
  const index = list.findIndex((pr) => pr.id === id);
  if (index < 0) return null;
  return list[index + 1]?.id ?? list[index - 1]?.id ?? null;
}
