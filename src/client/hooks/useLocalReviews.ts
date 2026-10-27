import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isActive,
  prKey,
  type AiReviewConfig,
  type AiReviewJob,
  type AiReviewSummary,
  type CheckoutsResponse,
  type LocalStatus,
  type RemoveCheckoutsResult,
} from "../../shared/aiReview.ts";

export type AiReviewDetail = AiReviewJob & { resumeCommand: string | null };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

const FAST = 1_500;
const SLOW = 30_000;

/**
 * Local Claude reviews. `available` is false until the server has reported its
 * status, and whenever the claude CLI can't be found; every robot in the UI
 * hides accordingly.
 */
export function useLocalReviews(onFinished: (job: AiReviewSummary) => void) {
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [supported, setSupported] = useState(false);
  const [jobs, setJobs] = useState<AiReviewSummary[]>([]);
  const previous = useRef(new Map<string, AiReviewSummary>());
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    let alive = true;
    fetch("/api/local/status")
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) return; // Leave local features hidden.
        setStatus((await res.json()) as LocalStatus);
        setSupported(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const { jobs: next } = await call<{ jobs: AiReviewSummary[] }>("/api/local/reviews");
    const before = previous.current;
    const after = new Map<string, AiReviewSummary>();
    // Keep the same object for anything that hasn't changed, so the list rows
    // that show it (memoised) don't re-render on every poll.
    const merged = next.map((job) => {
      const old = before.get(job.id);
      const kept = old && old.updatedAt === job.updatedAt ? old : job;
      after.set(job.id, kept);
      if (old && isActive(old.status) && !isActive(job.status)) finishedRef.current(job);
      return kept;
    });
    previous.current = after;
    setJobs((current) =>
      current.length === merged.length && current.every((j, i) => j === merged[i]) ? current : merged,
    );
  }, []);

  const anyActive = jobs.some((j) => isActive(j.status));

  useEffect(() => {
    if (!supported) return;
    void refresh().catch(() => {});
    const id = setInterval(() => void refresh().catch(() => {}), anyActive ? FAST : SLOW);
    return () => clearInterval(id);
  }, [supported, anyActive, refresh]);

  const { byPr, reviewsByPr } = useMemo(() => groupByPr(jobs), [jobs]);

  const start = useCallback(
    /** No reviewers: the server uses the first. */
    async (pr: { owner: string; name: string; number: number }, reviewers?: string[]) => {
      await call("/api/local/reviews", {
        method: "POST",
        body: JSON.stringify({ owner: pr.owner, name: pr.name, number: pr.number, reviewers }),
      });
      await refresh();
    },
    [refresh],
  );

  const cancel = useCallback(
    async (id: string) => {
      await call(`/api/local/reviews/${id}/cancel`, { method: "POST" });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await call(`/api/local/reviews/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return {
    /** The server can run reviews, and the claude CLI was found. */
    available: supported && status?.claude.available === true,
    /** The server has reported its status (the claude CLI may still be missing). */
    supported,
    status,
    jobs,
    byPr,
    reviewsByPr,
    start,
    cancel,
    remove,
  };
}

/**
 * For each pull request: the latest review by each reviewer (by name), and
 * one review to stand for them all on its robot — one still running if any
 * is, then one that failed, then the latest.
 */
export function groupByPr(jobs: readonly AiReviewSummary[]) {
  const latest = new Map<string, Map<string, AiReviewSummary>>();
  for (const job of jobs) {
    const key = prKey(job);
    const reviewers = latest.get(key) ?? new Map<string, AiReviewSummary>();
    latest.set(key, reviewers);
    const existing = reviewers.get(job.reviewerId);
    if (!existing || job.createdAt > existing.createdAt) reviewers.set(job.reviewerId, job);
  }

  const reviewsByPr = new Map<string, AiReviewSummary[]>();
  const byPr = new Map<string, AiReviewSummary>();
  for (const [key, reviewers] of latest) {
    const list = [...reviewers.values()].sort(
      (a, b) => a.reviewerName.localeCompare(b.reviewerName) || a.createdAt.localeCompare(b.createdAt),
    );
    reviewsByPr.set(key, list);
    const newest = list.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    const shown =
      list.find((j) => isActive(j.status)) ??
      list.find((j) => j.status === "failed") ??
      // A cancelled review is idle only if nothing else has been done.
      list.filter((j) => j.status !== "cancelled").reduce<AiReviewSummary | undefined>(
        (a, b) => (!a || b.createdAt > a.createdAt ? b : a),
        undefined,
      ) ??
      newest;
    byPr.set(key, shown);
  }
  return { byPr, reviewsByPr };
}

/** The full job — review text, activity, paths — for the one being looked at. */
export function useReviewDetail(summary: AiReviewSummary | undefined) {
  const [detail, setDetail] = useState<AiReviewDetail | null>(null);
  const id = summary?.id;
  const version = summary?.updatedAt;

  // biome-ignore lint/correctness/useExhaustiveDependencies: version (updatedAt) is the trigger to refetch
  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    let alive = true;
    call<AiReviewDetail>(`/api/local/reviews/${id}`)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null));
    return () => {
      alive = false;
    };
    // Re-fetched whenever the polled summary says the job changed.
  }, [id, version]);

  return detail?.id === id ? detail : null;
}

export function useLocalConfig(enabled: boolean) {
  const [config, setConfig] = useState<AiReviewConfig | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    call<AiReviewConfig>("/api/local/config")
      .then(setConfig)
      .catch(() => setConfig(null));
  }, [enabled]);

  const pending = useRef<AiReviewConfig | null>(null);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    call<AiReviewConfig>("/api/local/config", { method: "PUT", body: JSON.stringify(next) })
      .then(() => setSaving("saved"))
      .catch(() => setSaving("error"));
  }, []);

  /** Applies at once, saves shortly after typing stops. */
  const update = useCallback(
    (next: AiReviewConfig) => {
      setConfig(next);
      setSaving("saving");
      pending.current = next;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush],
  );

  // The settings modal unmounts this when it closes. Save what's pending
  // rather than dropping it — closing right after typing must not lose edits.
  useEffect(() => flush, [flush]);

  return { config, update, saving };
}

/** What's checked out, for Settings → Checkouts. Sizes arrive a moment after the list. */
export function useCheckouts(enabled: boolean) {
  const [data, setData] = useState<CheckoutsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  // Only the latest load may write, so a slow size check can't bring back
  // checkouts that were removed while it ran.
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const list = await call<CheckoutsResponse>("/api/local/checkouts");
      if (mine !== seq.current) return;
      // Keep sizes already known while they're measured again.
      setData((prev) => {
        const known = new Map(prev?.checkouts.map((c) => [c.path, c.sizeBytes]) ?? []);
        return {
          ...list,
          checkouts: list.checkouts.map((c) => ({ ...c, sizeBytes: known.get(c.path) ?? null })),
        };
      });
      setError(null);
      const sized = await call<CheckoutsResponse>("/api/local/checkouts?sizes=1");
      if (mine === seq.current) setData(sized);
    } catch (err) {
      if (mine === seq.current) setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const remove = useCallback(
    async (paths: string[]): Promise<RemoveCheckoutsResult> => {
      setRemoving((prev) => new Set([...prev, ...paths]));
      try {
        return await call<RemoveCheckoutsResult>("/api/local/checkouts/remove", {
          method: "POST",
          body: JSON.stringify({ paths }),
        });
      } finally {
        setRemoving((prev) => {
          const next = new Set(prev);
          for (const path of paths) next.delete(path);
          return next;
        });
        void load();
      }
    },
    [load],
  );

  return { data, error, removing, remove };
}
