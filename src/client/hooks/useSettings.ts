import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type Settings } from "../../shared/types.ts";

const STORAGE_KEY = "easy-review.settings.v1";

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge tier-by-tier so a stored file from an older version still loads.
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      easy: { ...DEFAULT_SETTINGS.easy, ...parsed.easy },
      medium: { ...DEFAULT_SETTINGS.medium, ...parsed.medium },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Read after mount so the first render matches in every environment.
  useEffect(() => setSettings(load()), []);

  const update = useCallback((next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage disabled — settings just won't persist */
    }
  }, []);

  const reset = useCallback(() => update(DEFAULT_SETTINGS), [update]);

  return { settings, update, reset };
}
