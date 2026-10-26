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
  notify(notice: { id: string; title: string; body: string }): void;
  onNotificationClick(callback: (id: string) => void): () => void;
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

/**
 * A macOS notification, when the app is in the background — in front, the
 * page's own toast says the same thing. Does nothing in a browser.
 */
export function notifyDesktop(notice: { id: string; title: string; body: string }): boolean {
  const bridge = window.easyReviewDesktop;
  if (!bridge || document.hasFocus()) return false;
  bridge.notify(notice);
  return true;
}

/** Run `handler` with a notification's id when it is clicked. */
export function useNotificationClicks(handler: (id: string) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => window.easyReviewDesktop?.onNotificationClick((id) => latest.current(id)), []);
}
