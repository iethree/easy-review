/**
 * Every keyboard shortcut, in one table. The handler in App asks this what a
 * key means, and the shortcuts dialog is drawn from it — so the help can't
 * drift from what the keys actually do.
 *
 * The layout is WASD-shaped: w/s move through the list, a/d choose the pane,
 * the arrows drive the code pane, Enter approves (and Enter again confirms).
 */

export type Pane = "list" | "preview";

export type KeyAction =
  | { type: "move"; delta: -1 | 1 }
  | { type: "focusPane"; pane: Pane }
  | { type: "scrollPreview"; direction: -1 | 1 }
  | { type: "cycleTab"; direction: -1 | 1 }
  | { type: "approve" }
  | { type: "requestChanges" }
  | { type: "claude" }
  | { type: "toggleFocusMode" }
  | { type: "openGitHub" }
  | { type: "toggleHidden" }
  | { type: "switchList"; tab: "queue" | "reviewed" | "hidden" | "mine" }
  | { type: "search" }
  | { type: "settings" }
  | { type: "theme" }
  | { type: "refresh" }
  | { type: "help" };

export interface KeyBinding {
  /** KeyboardEvent.key values. */
  keys: string[];
  /** How the shortcuts dialog shows them. */
  display: string[];
  description: string;
  action: KeyAction;
  /**
   * Ignore auto-repeat. Holding Enter would otherwise open an approval and
   * confirm it in one press, which is the thing the confirmation is for.
   */
  once?: boolean;
}

export const KEYMAP: KeyBinding[] = [
  { keys: ["w", "k"], display: ["w", "k"], description: "Previous pull request", action: { type: "move", delta: -1 } },
  { keys: ["s", "j"], display: ["s", "j"], description: "Next pull request", action: { type: "move", delta: 1 } },
  { keys: ["a"], display: ["a"], description: "Focus the list", action: { type: "focusPane", pane: "list" } },
  { keys: ["d"], display: ["d"], description: "Focus the code", action: { type: "focusPane", pane: "preview" } },
  { keys: ["ArrowUp"], display: ["↑"], description: "Scroll the code up", action: { type: "scrollPreview", direction: -1 } },
  { keys: ["ArrowDown"], display: ["↓"], description: "Scroll the code down", action: { type: "scrollPreview", direction: 1 } },
  { keys: ["ArrowLeft"], display: ["←"], description: "Previous tab — Description / Diff / Claude review", action: { type: "cycleTab", direction: -1 } },
  { keys: ["ArrowRight"], display: ["→"], description: "Next tab", action: { type: "cycleTab", direction: 1 } },
  { keys: ["Enter"], display: ["Enter"], description: "Approve — then Enter again to confirm", action: { type: "approve" }, once: true },
  { keys: ["r"], display: ["r"], description: "Request changes", action: { type: "requestChanges" } },
  // Shift+H, like Shift+R: case is meaningful here. Repeats are ignored,
  // since each hide moves the selection on and a held key would keep going.
  { keys: ["H"], display: ["⇧H"], description: "Hide the pull request — or unhide it, in Hidden", action: { type: "toggleHidden" }, once: true },
  { keys: ["c"], display: ["c"], description: "Review with Claude, or flip to its review", action: { type: "claude" } },
  { keys: ["o"], display: ["o"], description: "Hide or show the list", action: { type: "toggleFocusMode" } },
  { keys: ["g"], display: ["g"], description: "Open on GitHub", action: { type: "openGitHub" } },
  { keys: ["1"], display: ["1"], description: "Needs review", action: { type: "switchList", tab: "queue" } },
  { keys: ["2"], display: ["2"], description: "Reviewed", action: { type: "switchList", tab: "reviewed" } },
  { keys: ["3"], display: ["3"], description: "Hidden", action: { type: "switchList", tab: "hidden" } },
  { keys: ["4"], display: ["4"], description: "My PRs — yours, and those assigned to you", action: { type: "switchList", tab: "mine" } },
  { keys: ["/"], display: ["/"], description: "Filter the list", action: { type: "search" } },
  { keys: [","], display: [","], description: "Settings", action: { type: "settings" } },
  { keys: ["t"], display: ["t"], description: "Light / dark", action: { type: "theme" } },
  { keys: ["R"], display: ["⇧R"], description: "Refresh from GitHub", action: { type: "refresh" } },
  { keys: ["?"], display: ["?"], description: "This list", action: { type: "help" } },
];

const BY_KEY = new Map<string, KeyBinding>(
  KEYMAP.flatMap((binding) => binding.keys.map((key) => [key, binding] as const)),
);

/** What a key press means, or null if it means nothing (or is a banned repeat). */
export function actionForKey(key: string, repeat = false): KeyAction | null {
  const binding = BY_KEY.get(key);
  if (!binding || (binding.once && repeat)) return null;
  return binding.action;
}
