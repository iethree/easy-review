import { useEffect, useState } from "react";
import type { Conversation, PullRequest } from "../../shared/types.ts";

export type ConversationEntry =
  | { status: "ready"; data: Conversation }
  | { status: "error"; message: string };

// Keyed by id and updatedAt: a new comment bumps the PR's updatedAt, so a
// cached conversation can never be staler than the queue that shows the PR.
const cache = new Map<string, ConversationEntry>();
/** PRs whose next load should skip the server's cache too — you just posted. */
const stale = new Set<string>();
const listeners = new Set<(prId: string) => void>();

const keyOf = (pr: PullRequest) => `${pr.id}@${pr.updatedAt}`;

/** After posting a review: your comment is now part of the conversation. */
export function invalidateConversation(prId: string): void {
  for (const key of [...cache.keys()]) if (key.startsWith(`${prId}@`)) cache.delete(key);
  stale.add(prId);
  for (const listener of listeners) listener(prId);
}

/** The comments on one pull request, fetched when it's first looked at. */
export function useConversation(pr: PullRequest) {
  const key = keyOf(pr);
  const [entry, setEntry] = useState<ConversationEntry | undefined>(() => cache.get(key));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const onInvalidate = (id: string) => {
      if (id === pr.id) setAttempt((n) => n + 1);
    };
    listeners.add(onInvalidate);
    return () => {
      listeners.delete(onInvalidate);
    };
  }, [pr.id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: key covers the pull request's fields; attempt forces a refetch
  useEffect(() => {
    const hit = cache.get(key);
    if (hit) {
      setEntry(hit);
      return;
    }
    setEntry(undefined);

    let alive = true;
    const params = new URLSearchParams({
      owner: pr.owner,
      name: pr.name,
      number: String(pr.number),
      updated: pr.updatedAt,
    });
    if (stale.delete(pr.id)) params.set("fresh", "1");

    fetch(`/api/conversation?${params}`)
      .then(async (res) => {
        const json = (await res.json()) as Conversation | { error: string };
        const next: ConversationEntry =
          !res.ok || "error" in json
            ? { status: "error", message: "error" in json ? json.error : `HTTP ${res.status}` }
            : { status: "ready", data: json };
        if (next.status === "ready") cache.set(key, next);
        if (alive) setEntry(next);
      })
      .catch((err: unknown) => {
        if (alive) setEntry({ status: "error", message: err instanceof Error ? err.message : "Network error" });
      });

    return () => {
      alive = false;
    };
    // pr.owner/name/number are fixed for a given id, which the key contains.
  }, [key, attempt]);

  return { entry, retry: () => setAttempt((n) => n + 1) };
}
