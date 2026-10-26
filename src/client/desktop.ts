/**
 * What the page knows about the desktop app, when it runs inside one. The
 * bridge is set up by desktop/preload.cjs; in a browser it isn't there and
 * everything here is a no-op.
 */

import { useEffect, useRef } from "react";

export type DesktopCommand = "settings" | "refresh" | "help" | "reviewers";

interface DesktopBridge {
  platform: string;
  onCommand(callback: (name: DesktopCommand) => void): () => void;
}

declare global {
  interface Window {
    easyReviewDesktop?: DesktopBridge;
  }
}

/** Run `handler` for each command from the app's menus (Settings…, Refresh, …). */
export function useDesktopCommands(handler: (name: DesktopCommand) => void): void {
  // The latest handler, so the subscription doesn't churn on every render.
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => window.easyReviewDesktop?.onCommand((name) => latest.current(name)), []);
}
