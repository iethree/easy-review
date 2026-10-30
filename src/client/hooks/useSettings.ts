import { useCallback, useEffect, useState } from "react";
import { cleanLooks } from "../../shared/reviewerLook.ts";
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
      reviewerLooks: cleanLooks(parsed.reviewerLooks),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage disabled — settings just won't persist */
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Read after mount so the first render matches in every environment.
  useEffect(() => setSettings(load()), []);

  const update = useCallback((next: Settings) => {
    setSettings(next);
    save(next);
  }, []);

  // Back to the default thresholds and queue — but your reviewers keep their
  // looks: they're set elsewhere, and one at a time.
  const reset = useCallback(() => {
    setSettings((current) => {
      const next = { ...DEFAULT_SETTINGS, reviewerLooks: current.reviewerLooks };
      save(next);
      return next;
    });
  }, []);

  return { settings, update, reset };
}
