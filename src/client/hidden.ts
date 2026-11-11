/**
 * What you've archived out of Review: pull requests, and Claude's reviews of a
 * diff or a repository. Pure helpers, so the rules are testable apart from
 * React and localStorage. (Archive was called Hidden; the names here, and
 * what's stored, kept the old word.)
 */

import type { PullRequest } from "../shared/types.ts";
import { rowKey } from "./reviewRows.ts";

/** A row's rowKey (a pull request's owner/name#number, lowercase) → when you archived it, as an ISO timestamp. */
export type HiddenMap = Record<string, string>;

type Row = Pick<PullRequest, "owner" | "name" | "number" | "target">;

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

export function isHidden(hidden: HiddenMap, row: Row): boolean {
  return Object.hasOwn(hidden, rowKey(row));
}

/** The queue minus what's archived, and the archived rows, most recently archived first. */
export function splitHidden<T extends Row>(
  prs: T[],
  hidden: HiddenMap,
): { shown: T[]; hidden: T[] } {
  const shown: T[] = [];
  const tucked: T[] = [];
  for (const pr of prs) (isHidden(hidden, pr) ? tucked : shown).push(pr);
  tucked.sort((a, b) => (hidden[rowKey(b)] ?? "").localeCompare(hidden[rowKey(a)] ?? ""));
  return { shown, hidden: tucked };
}

/** Where the selection should go when `id` leaves the list: the next row, else the one before. */
export function neighbourAfterRemoving<T extends { id: string }>(list: T[], id: string): string | null {
  const index = list.findIndex((pr) => pr.id === id);
  if (index < 0) return null;
  return list[index + 1]?.id ?? list[index - 1]?.id ?? null;
}

/**
 * Brings back what you archived that's been asked about again since: a pull
 * request whose review was requested again (the author wants you to look
 * again), or a diff or repository Claude was set to review again. Returns
 * `hidden` itself when nothing changes.
 */
export function unhideReRequested(
  hidden: HiddenMap,
  rows: readonly (Row & Partial<Pick<PullRequest, "reviewRequestedAt" | "createdAt">>)[],
): HiddenMap {
  let next: HiddenMap | null = null;
  for (const row of rows) {
    const key = rowKey(row);
    const hiddenAt = hidden[key];
    // A diff's or a repository's row is as old as its latest review.
    const askedAt = row.target ? row.createdAt : row.reviewRequestedAt;
    if (hiddenAt === undefined || !askedAt) continue;
    const requested = Date.parse(askedAt);
    const hid = Date.parse(hiddenAt);
    if (Number.isNaN(requested) || Number.isNaN(hid) || requested <= hid) continue;
    next ??= { ...hidden };
    delete next[key];
  }
  return next ?? hidden;
}
