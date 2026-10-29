import { useCallback, useEffect, useRef, useState } from "react";
import type { PullRequest, ReviewsResponse } from "../../shared/types.ts";

/** One empty list for every render before the first load, so memos keyed on it hold. */
const NONE: PullRequest[] = [];

interface State {
  data: ReviewsResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Your own open pull requests — written by you or assigned to you. Like the
 * history, only fetched once its tab has been opened.
 */
export function useMine(active: boolean) {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });
  const requestId = useRef(0);
  const started = useRef(false);

  const load = useCallback(async (fresh: boolean) => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/mine${fresh ? "?fresh=1" : ""}`);
      const json = (await res.json()) as ReviewsResponse | { error: string };
      if (id !== requestId.current) return;
      if (!res.ok || "error" in json) {
        setState({ data: null, loading: false, error: "error" in json ? json.error : `HTTP ${res.status}` });
        return;
      }
      setState({ data: json, loading: false, error: null });
    } catch (err) {
      if (id !== requestId.current) return;
      setState({ data: null, loading: false, error: err instanceof Error ? err.message : "Network error" });
    }
  }, []);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    void load(false);
  }, [active, load]);

  const refresh = useCallback(() => load(true), [load]);

  return { ...state, pullRequests: state.data?.pullRequests ?? NONE, refresh };
}
