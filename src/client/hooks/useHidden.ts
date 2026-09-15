import { useCallback, useEffect, useState } from "react";
import { prKey } from "../../shared/aiReview.ts";
import { parseHidden, type HiddenMap } from "../hidden.ts";

const STORAGE_KEY = "easy-review.hidden.v1";

function read(): HiddenMap {
  try {
    return parseHidden(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

/** Hidden pull requests, kept in the browser: a view preference, not server state. */
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
    (pr: { owner: string; name: string; number: number }, on: boolean) => {
      setHidden((prev) => {
        const key = prKey(pr);
        if (on === Object.hasOwn(prev, key)) return prev;
        const next = { ...prev };
        if (on) next[key] = new Date().toISOString();
        else delete next[key];
        return next;
      });
    },
    [],
  );

  return { hidden, setHiddenFor };
}
