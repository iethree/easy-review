/**
 * Client-side diff cache and prefetcher.
 *
 * This is what makes hovering and opening feel instant: as soon as the queue
 * loads, every diff is fetched in the background, cheapest first, at a
 * bounded concurrency. By the time a pointer reaches a row the bytes are
 * usually already here.
 *
 * It lives outside React and is read through `useSyncExternalStore`, so one
 * diff arriving re-renders only the components showing that diff.
 */

import { useSyncExternalStore } from "react";
import type { DiffResponse, PullRequest } from "../../shared/types.ts";
import { reviewCost } from "../../shared/difficulty.ts";
import { GITHUB_DIFF_LINE_LIMIT, TOO_LARGE_MESSAGE } from "../../shared/diff.ts";

export type DiffEntry =
  | { status: "loading" }
  | { status: "ready"; data: DiffResponse }
  | { status: "error"; message: string };

const MAX_CONCURRENT = 4;

/**
 * Diffs bigger than this are deferred to idle time. Parsing a multi-megabyte
 * diff response blocks the main thread, and doing several at once while the
 * user is hovering rows janks the whole page — which is exactly what the
 * prefetcher exists to prevent. Small diffs (the ones hover previews show)
 * still load immediately; big ones arrive during the first idle moment, or
 * instantly on demand if the user gets there first.
 */
const EAGER_LINE_LIMIT = 2_000;

const entries = new Map<string, DiffEntry>();
const listeners = new Map<string, Set<() => void>>();
const globalListeners = new Set<() => void>();

let queue: PullRequest[] = [];
let idleQueue: PullRequest[] = [];
let active = 0;
let idleScheduled = false;

export function diffKey(pr: Pick<PullRequest, "owner" | "name" | "number" | "headSha">): string {
  return `${pr.owner}/${pr.name}#${pr.number}@${pr.headSha}`;
}

function emit(key: string): void {
  for (const fn of listeners.get(key) ?? []) fn();
  for (const fn of globalListeners) fn();
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
  // A too-large verdict is final; retrying only wastes a slot.
  return existing.message === TOO_LARGE_MESSAGE;
}

const onIdle: (fn: () => void) => void =
  typeof requestIdleCallback === "function"
    ? (fn) => requestIdleCallback(() => fn(), { timeout: 2_000 })
    : (fn) => {
        setTimeout(fn, 200);
      };

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const pr = queue.shift();
    if (!pr) break;
    if (settled(pr)) continue;
    active++;
    void load(pr).finally(() => {
      active--;
      pump();
    });
  }

  // Only reach for the heavy ones once the cheap ones are done.
  if (active === 0 && queue.length === 0 && idleQueue.length > 0) scheduleIdle();
}

/** Drains the big diffs one at a time, between frames. */
function scheduleIdle(): void {
  if (idleScheduled) return;
  idleScheduled = true;

  onIdle(() => {
    idleScheduled = false;
    const pr = idleQueue.shift();
    if (!pr) return;
    if (settled(pr)) {
      scheduleIdle();
      return;
    }
    active++;
    void load(pr).finally(() => {
      active--;
      pump();
    });
  });
}

/** Queue every PR for background fetching, cheapest diffs first. */
export function prefetchAll(prs: PullRequest[]): void {
  const known = new Set([...queue, ...idleQueue].map(diffKey));
  const pending = prs
    .filter((pr) => !entries.has(diffKey(pr)) && !known.has(diffKey(pr)))
    .sort((a, b) => reviewCost(a) - reviewCost(b));

  for (const pr of pending) {
    if (pr.additions + pr.deletions > EAGER_LINE_LIMIT) idleQueue.push(pr);
    else queue.push(pr);
  }
  pump();
}

/** Jump a PR to the front — used on hover intent and on open. */
export function requestNow(pr: PullRequest): void {
  if (settled(pr)) return;
  const key = diffKey(pr);
  // Promote out of whichever queue it is waiting in.
  queue = queue.filter((q) => diffKey(q) !== key);
  idleQueue = idleQueue.filter((q) => diffKey(q) !== key);
  queue.unshift(pr);
  pump();
}

export function peek(pr: PullRequest): DiffEntry | undefined {
  return entries.get(diffKey(pr));
}

/** Drop everything — used when the queue is refreshed. */
export function reset(): void {
  queue = [];
  idleQueue = [];
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

/** How many diffs are cached — drives the "prefetched N/M" indicator. */
export function useReadyCount(): number {
  return useSyncExternalStore(
    (onChange) => {
      globalListeners.add(onChange);
      return () => globalListeners.delete(onChange);
    },
    () => {
      let n = 0;
      for (const entry of entries.values()) if (entry.status === "ready") n++;
      return n;
    },
    () => 0,
  );
}
