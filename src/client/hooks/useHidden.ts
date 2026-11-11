import { useCallback, useEffect, useState } from "react";
import type { PullRequest } from "../../shared/types.ts";
import { parseHidden, unhideReRequested, type HiddenMap } from "../hidden.ts";
import { rowKey } from "../reviewRows.ts";

const STORAGE_KEY = "easy-review.hidden.v1";

function read(): HiddenMap {
  try {
    return parseHidden(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

/** What you archived (see hidden.ts), kept in the browser: a view preference, not server state. */
export function useHidden() {
  const [hidden, setHidden] = useState<HiddenMap>(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden));
    } catch {
      /* storage disabled — hiding just won't survive a reload */
    }
  }, [hidden]);

  // Another open tab of the app hid or unhid something.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setHidden(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setHiddenFor = useCallback(
    (row: Pick<PullRequest, "owner" | "name" | "number" | "target">, on: boolean) => {
      setHidden((prev) => {
        const key = rowKey(row);
        if (on === Object.hasOwn(prev, key)) return prev;
        const next = { ...prev };
        if (on) next[key] = new Date().toISOString();
        else delete next[key];
        return next;
      });
    },
    [],
  );

  /** Brings back those of `prs` asked about again since you archived them. */
  const unhideAskedAgain = useCallback((prs: Parameters<typeof unhideReRequested>[1]) => {
    setHidden((prev) => unhideReRequested(prev, prs));
  }, []);

  return { hidden, setHiddenFor, unhideAskedAgain };
}
