/**
 * Comments on lines of the diff that haven't been posted yet.
 *
 * They go up with your review — approve, request changes or comment only — as
 * one GitHub review, so they appear together or not at all. Until then they
 * live in this browser, per pull request, so a reload doesn't lose them.
 */

import { useSyncExternalStore } from "react";
import type { ReviewCommentDraft } from "../shared/types.ts";
import { threadKey } from "./comments.ts";

export interface DraftComment extends ReviewCommentDraft {
  id: string;
  /** The commit the diff was at when this was written: what GitHub anchors it to. */
  commitId: string;
  createdAt: string;
}

/** Pull request id → its drafts, oldest first. */
export type DraftMap = Record<string, DraftComment[]>;

const STORAGE_KEY = "easy-review.drafts.v1";

function isDraft(value: unknown): value is DraftComment {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.id === "string" &&
    typeof d.path === "string" &&
    d.path !== "" &&
    Number.isInteger(d.line) &&
    (d.line as number) > 0 &&
    (d.side === "LEFT" || d.side === "RIGHT") &&
    typeof d.body === "string" &&
    typeof d.commitId === "string" &&
    typeof d.createdAt === "string"
  );
}

/** Reads what was stored, dropping anything that isn't a well-formed draft. */
export function parseDrafts(raw: string | null): DraftMap {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: DraftMap = {};
    for (const [prId, list] of Object.entries(value)) {
      if (!Array.isArray(list)) continue;
      const drafts = list.filter(isDraft);
      if (drafts.length > 0) out[prId] = drafts;
    }
    return out;
  } catch {
    return {};
  }
}

export function withDraft(map: DraftMap, prId: string, draft: DraftComment): DraftMap {
  return { ...map, [prId]: [...(map[prId] ?? []), draft] };
}

export function withBody(map: DraftMap, prId: string, id: string, body: string): DraftMap {
  const list = map[prId];
  if (!list) return map;
  return { ...map, [prId]: list.map((draft) => (draft.id === id ? { ...draft, body } : draft)) };
}

/** Without these drafts; a pull request left with none drops out entirely. */
export function withoutDrafts(map: DraftMap, prId: string, ids: ReadonlySet<string>): DraftMap {
  const list = map[prId];
  if (!list) return map;
  const kept = list.filter((draft) => !ids.has(draft.id));
  const next = { ...map };
  if (kept.length > 0) next[prId] = kept;
  else delete next[prId];
  return next;
}

/**
 * The commit a set of drafts can be posted against. GitHub puts a whole review
 * on one commit, so drafts written on two different ones can't go up together
 * — say so, rather than quietly mis-anchoring half of them.
 */
export function reviewCommit(drafts: readonly DraftComment[]): {
  commitId: string | null;
  error: string | null;
} {
  const commits = new Set(drafts.map((draft) => draft.commitId));
  if (commits.size === 0) return { commitId: null, error: null };
  if (commits.size === 1) return { commitId: drafts[0]?.commitId ?? null, error: null };
  return {
    commitId: null,
    error:
      "These comments were written on different commits of the pull request, and a review can only go on one. Remove the ones marked “older commit”, then submit.",
  };
}

/**
 * Drafts placed on their lines — only those written on the commit on screen.
 * One from an older commit may point at a line that now holds different code.
 */
export function draftsOnLines(
  drafts: readonly DraftComment[],
  commitId: string | null,
): Map<string, DraftComment[]> {
  const map = new Map<string, DraftComment[]>();
  if (!commitId) return map;
  for (const draft of drafts) {
    if (draft.commitId !== commitId) continue;
    const key = threadKey(draft.path, draft.side, draft.line);
    map.set(key, [...(map.get(key) ?? []), draft]);
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

let cache: DraftMap | null = null;
const listeners = new Set<() => void>();
const NONE: DraftComment[] = [];

function current(): DraftMap {
  if (cache === null) {
    try {
      cache = parseDrafts(localStorage.getItem(STORAGE_KEY));
    } catch {
      cache = {};
    }
  }
  return cache;
}

function commit(next: DraftMap): void {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage disabled — drafts last until the page reloads */
  }
  for (const listener of listeners) listener();
}

/** Another tab of the app changed its drafts. */
function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY) return;
  cache = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** A pull request's drafts, oldest first. Stable until they change. */
export function useDrafts(prId: string | null | undefined): DraftComment[] {
  return useSyncExternalStore(
    subscribe,
    () => (prId ? (current()[prId] ?? NONE) : NONE),
    () => NONE,
  );
}

export function getDrafts(prId: string): DraftComment[] {
  return current()[prId] ?? NONE;
}

export function addDraft(prId: string, draft: ReviewCommentDraft & { commitId: string }): void {
  commit(
    withDraft(current(), prId, {
      ...draft,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }),
  );
}

export function editDraft(prId: string, id: string, body: string): void {
  commit(withBody(current(), prId, id, body));
}

export function removeDrafts(prId: string, ids: Iterable<string>): void {
  commit(withoutDrafts(current(), prId, new Set(ids)));
}
