import { useCallback, useEffect, useRef, useState } from "react";
import type { PullRequest, ReviewsResponse, Settings } from "../../shared/types.ts";
import { lingering } from "../queuePoll.ts";
import { reset as resetDiffs } from "./diffStore.ts";

interface State {
  data: ReviewsResponse | null;
  /** Rows a background fetch no longer had, kept until you refresh: see `lingering`. */
  kept: PullRequest[];
  loading: boolean;
  error: string | null;
}

/** How often the queue is fetched again in the background, while the app is in view. */
const POLL_MS = 2 * 60 * 1000;
/** Coming back to the app fetches the queue if it's older than this. */
const STALE_MS = 60 * 1000;

const NO_ROWS: PullRequest[] = [];

export function useReviews(settings: Settings) {
  const [state, setState] = useState<State>({ data: null, kept: NO_ROWS, loading: true, error: null });
  // Guards against an in-flight response from a superseded query landing last.
  const requestId = useRef(0);
  /** A fetch you asked for (or the first one) is on its way: a poll waits for it. */
  const loadingRef = useRef(false);
  const fetchedAt = useRef(0);

  const { includeTeamRequests, hideDrafts } = settings;

  const fetchQueue = useCallback(
    async (fresh: boolean) => {
      const params = new URLSearchParams({
        teams: includeTeamRequests ? "1" : "0",
        drafts: hideDrafts ? "0" : "1",
      });
      if (fresh) params.set("fresh", "1");
      const res = await fetch(`/api/reviews?${params}`);
      const json = (await res.json()) as ReviewsResponse | { error: string };
      if (!res.ok || "error" in json) throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      return json;
    },
    [includeTeamRequests, hideDrafts],
  );

  const load = useCallback(
    async (fresh: boolean) => {
      const id = ++requestId.current;
      loadingRef.current = true;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const json = await fetchQueue(fresh);
        if (id !== requestId.current) return;
        fetchedAt.current = Date.now();
        setState({ data: json, kept: NO_ROWS, loading: false, error: null });
        if (fresh) resetDiffs();
      } catch (err) {
        if (id !== requestId.current) return;
        setState({
          data: null,
          kept: NO_ROWS,
          loading: false,
          error: err instanceof Error ? err.message : "Network error",
        });
      } finally {
        if (id === requestId.current) loadingRef.current = false;
      }
    },
    [fetchQueue],
  );

  /**
   * The queue again from GitHub, quietly: new pull requests, and ones whose
   * review was asked for again, come in; rows that left stay until you
   * refresh. A failure leaves the list as it is.
   */
  const poll = useCallback(async () => {
    if (loadingRef.current) return;
    const id = ++requestId.current;
    try {
      const json = await fetchQueue(true);
      if (id !== requestId.current) return;
      fetchedAt.current = Date.now();
      setState((s) => {
        if (!s.data) return { data: json, kept: NO_ROWS, loading: false, error: null };
        const kept = lingering([...s.data.pullRequests, ...s.kept], json.pullRequests);
        return { ...s, data: json, kept: kept.length > 0 ? kept : NO_ROWS };
      });
    } catch {
      /* Next time round. */
    }
  }, [fetchQueue]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - fetchedAt.current > STALE_MS) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  const refresh = useCallback(() => load(true), [load]);

  return { ...state, refresh };
}
