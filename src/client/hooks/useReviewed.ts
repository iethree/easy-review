import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewedPullRequest, ReviewedResponse } from "../../shared/types.ts";

const PAGE_SIZE = 30;

interface State {
  pullRequests: ReviewedPullRequest[];
  total: number;
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const EMPTY: State = {
  pullRequests: [],
  total: 0,
  cursor: null,
  hasMore: false,
  loading: false,
  loadingMore: false,
  error: null,
};

/**
 * Review history, paged. Only loaded once the tab is actually opened — there
 * is no reason to spend a couple of seconds on it for someone who never
 * leaves the queue.
 */
export function useReviewed(active: boolean) {
  const [state, setState] = useState<State>(EMPTY);
  const requestId = useRef(0);
  const started = useRef(false);

  const fetchPage = useCallback(async (cursor: string | null, fresh: boolean) => {
    const id = ++requestId.current;
    setState((s) => ({
      ...s,
      loading: cursor === null,
      loadingMore: cursor !== null,
      error: null,
    }));

    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) params.set("cursor", cursor);
    if (fresh) params.set("fresh", "1");

    try {
      const res = await fetch(`/api/reviewed?${params}`);
      const json = (await res.json()) as ReviewedResponse | { error: string };
      if (id !== requestId.current) return;

      if (!res.ok || "error" in json) {
        setState((s) => ({
          ...s,
          loading: false,
          loadingMore: false,
          error: "error" in json ? json.error : `HTTP ${res.status}`,
        }));
        return;
      }

      setState((s) => ({
        // A cursor means we are appending a page, not replacing the list.
        pullRequests:
          cursor === null ? json.pullRequests : [...s.pullRequests, ...json.pullRequests],
        total: json.total,
        cursor: json.cursor,
        hasMore: json.hasMore,
        loading: false,
        loadingMore: false,
        error: null,
      }));
    } catch (err) {
      if (id !== requestId.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        loadingMore: false,
        error: err instanceof Error ? err.message : "Network error",
      }));
    }
  }, []);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    void fetchPage(null, false);
  }, [active, fetchPage]);

  const loadMore = useCallback(() => {
    if (state.hasMore && !state.loadingMore && state.cursor) void fetchPage(state.cursor, false);
  }, [state.hasMore, state.loadingMore, state.cursor, fetchPage]);

  const refresh = useCallback(() => {
    started.current = true;
    void fetchPage(null, true);
  }, [fetchPage]);

  return { ...state, loadMore, refresh };
}
