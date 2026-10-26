import { useCallback, useEffect, useState } from "react";
import type { Reviewer } from "../../shared/aiReview.ts";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

/** The reviewers in ~/.easy-review/reviewers, and the means to change them. */
export function useReviewers(enabled: boolean) {
  const [reviewers, setReviewers] = useState<Reviewer[] | null>(null);
  const [dir, setDir] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const body = await call<{ reviewers: Reviewer[]; dir: string }>("/api/local/reviewers");
    setReviewers(body.reviewers);
    setDir(body.dir);
  }, []);

  useEffect(() => {
    if (enabled) void refresh().catch(() => {});
  }, [enabled, refresh]);

  const create = useCallback(
    async (input: Pick<Reviewer, "name" | "instructions">) => {
      const created = await call<Reviewer>("/api/local/reviewers", { method: "POST", body: JSON.stringify(input) });
      await refresh();
      return created;
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, input: Pick<Reviewer, "name" | "instructions">) => {
      const saved = await call<Reviewer>(`/api/local/reviewers/${id}`, { method: "PUT", body: JSON.stringify(input) });
      await refresh();
      return saved;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await call(`/api/local/reviewers/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { reviewers: reviewers ?? [], loaded: reviewers !== null, dir, refresh, create, update, remove };
}
