/**
 * Client-side diff cache. A diff is fetched when its pull request is opened,
 * and kept for as long as the page is open, so going back to one is instant.
 *
 * It lives outside React and is read through `useSyncExternalStore`, so one
 * diff arriving re-renders only the components showing that diff.
 */

import { useSyncExternalStore } from "react";
import type { DiffResponse, PullRequest } from "../../shared/types.ts";
import { GITHUB_DIFF_LINE_LIMIT, TOO_LARGE_MESSAGE } from "../../shared/diff.ts";

export type DiffEntry =
  | { status: "loading" }
  | { status: "ready"; data: DiffResponse }
  | { status: "error"; message: string };

const entries = new Map<string, DiffEntry>();
const listeners = new Map<string, Set<() => void>>();

export function diffKey(pr: Pick<PullRequest, "owner" | "name" | "number" | "headSha">): string {
  return `${pr.owner}/${pr.name}#${pr.number}@${pr.headSha}`;
}

function emit(key: string): void {
  for (const fn of listeners.get(key) ?? []) fn();
}

function set(key: string, entry: DiffEntry): void {
  entries.set(key, entry);
  emit(key);
}

/** GitHub would answer 406, so resolve it locally and save the round trip. */
function isTooLarge(pr: PullRequest): boolean {
  return pr.additions + pr.deletions > GITHUB_DIFF_LINE_LIMIT;
}

async function load(pr: PullRequest): Promise<void> {
  const key = diffKey(pr);

  if (isTooLarge(pr)) {
    set(key, { status: "error", message: TOO_LARGE_MESSAGE });
    return;
  }

  set(key, { status: "loading" });

  const params = new URLSearchParams({
    owner: pr.owner,
    name: pr.name,
    number: String(pr.number),
    sha: pr.headSha,
  });

  try {
    const res = await fetch(`/api/diff?${params}`);
    const json = (await res.json()) as DiffResponse | { error: string };
    if (!res.ok || "error" in json) {
      set(key, { status: "error", message: "error" in json ? json.error : `HTTP ${res.status}` });
      return;
    }
    set(key, { status: "ready", data: json });
  } catch (err) {
    set(key, { status: "error", message: err instanceof Error ? err.message : "Network error" });
  }
}

/** Already fetched, in flight, or known to be unfetchable. */
function settled(pr: PullRequest): boolean {
  const existing = entries.get(diffKey(pr));
  if (!existing) return false;
  if (existing.status !== "error") return true;
  // A too-large verdict is final; asking again only costs a request.
  return existing.message === TOO_LARGE_MESSAGE;
}

/** Fetches a PR's diff, unless it's already here or on its way. */
export function requestDiff(pr: PullRequest): void {
  if (!settled(pr)) void load(pr);
}

export function peek(pr: PullRequest): DiffEntry | undefined {
  return entries.get(diffKey(pr));
}

/** Drop everything — used when the queue is refreshed. */
export function reset(): void {
  const keys = [...entries.keys()];
  entries.clear();
  for (const key of keys) emit(key);
}

/** Subscribe to a single PR's diff. */
export function useDiff(pr: PullRequest | null): DiffEntry | undefined {
  const key = pr ? diffKey(pr) : "";

  return useSyncExternalStore(
    (onChange) => {
      if (!key) return () => {};
      let subs = listeners.get(key);
      if (!subs) {
        subs = new Set();
        listeners.set(key, subs);
      }
      subs.add(onChange);
      return () => {
        subs.delete(onChange);
        if (subs.size === 0) listeners.delete(key);
      };
    },
    // Stable reference: entries only ever holds frozen entry objects.
    () => (key ? entries.get(key) : undefined),
    () => undefined,
  );
}
