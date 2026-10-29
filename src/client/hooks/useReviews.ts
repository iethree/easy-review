import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewsResponse, Settings } from "../../shared/types.ts";
import { reset as resetDiffs } from "./diffStore.ts";

interface State {
  data: ReviewsResponse | null;
  loading: boolean;
  error: string | null;
}

export function useReviews(settings: Settings) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });
  // Guards against an in-flight response from a superseded query landing last.
  const requestId = useRef(0);

  const { includeTeamRequests, hideDrafts } = settings;

  const load = useCallback(
    async (fresh: boolean) => {
      const id = ++requestId.current;
      setState((s) => ({ ...s, loading: true, error: null }));

      const params = new URLSearchParams({
        teams: includeTeamRequests ? "1" : "0",
        drafts: hideDrafts ? "0" : "1",
      });
      if (fresh) params.set("fresh", "1");

      try {
        const res = await fetch(`/api/reviews?${params}`);
        const json = (await res.json()) as ReviewsResponse | { error: string };
        if (id !== requestId.current) return;

        if (!res.ok || "error" in json) {
          setState({
            data: null,
            loading: false,
            error: "error" in json ? json.error : `HTTP ${res.status}`,
          });
          return;
        }

        setState({ data: json, loading: false, error: null });
        if (fresh) resetDiffs();
      } catch (err) {
        if (id !== requestId.current) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Network error",
        });
      }
    },
    [includeTeamRequests, hideDrafts],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { ...state, refresh };
}
