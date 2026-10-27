import { Box, Stack, Text } from "@mantine/core";
import { useEffect, useState, type HTMLAttributes } from "react";

/**
 * The app's loader, used by every Mantine <Loader> (see theme.ts): three
 * commits on a line, taking turns to hop — a pull request being worked on.
 * It sizes and colours itself from Mantine's --loader-size/--loader-color.
 */
export function CommitsLoader({ className, ...others }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <Box component="span" className={`er-commits ${className ?? ""}`} {...others}>
      <span className="er-commits-dot" />
      <span className="er-commits-line" />
      <span className="er-commits-dot" />
      <span className="er-commits-line" />
      <span className="er-commits-dot" />
    </Box>
  );
}

/**
 * The icon's mark drawing itself: the first commit pops in, the check runs
 * through to the second, and it pops too. For loads that fill a pane.
 */
export function ReviewMarkLoader({ size = 64 }: { size?: number }) {
  return (
    <svg className="er-mark" width={size} height={size * 0.8} viewBox="210 250 610 520" aria-hidden="true">
      <defs>
        <linearGradient id="er-mark-gradient" gradientUnits="userSpaceOnUse" x1="240" y1="300" x2="790" y2="700">
          <stop offset="0" stopColor="#5B6CFF" />
          <stop offset="0.5" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#F0508F" />
        </linearGradient>
      </defs>
      <path
        className="er-mark-check"
        d="M300 540 L446 686 L730 342"
        fill="none"
        stroke="url(#er-mark-gradient)"
        strokeWidth="64"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
      />
      <circle className="er-mark-ring er-mark-ring-a" cx="300" cy="540" r="60" fill="none" stroke="#5B6CFF" strokeWidth="40" />
      <circle className="er-mark-ring er-mark-ring-b" cx="730" cy="342" r="60" fill="none" stroke="#C057C9" strokeWidth="40" />
    </svg>
  );
}

/** A fresh order every time, so the first thing you read isn't always the same. */
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Cycles through `messages`, shuffled, every couple of seconds, so a wait has some company. */
function useRotating(messages: readonly string[], everyMs = 2200): string {
  const [order] = useState(() => shuffled(messages));
  const [i, setI] = useState(0);
  useEffect(() => {
    if (order.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % order.length), everyMs);
    return () => clearInterval(id);
  }, [order, everyMs]);
  return order[i % order.length] ?? "";
}

/** A load that fills a pane: the mark, and a message that changes as you wait. */
export function LoadingScene({ messages, py = 48 }: { messages: readonly string[]; py?: number }) {
  const message = useRotating(messages);
  return (
    <Stack align="center" gap="sm" py={py} role="status" aria-live="polite">
      <ReviewMarkLoader />
      <Text key={message} size="sm" c="dimmed" className="er-loading-message">
        {message}
      </Text>
    </Stack>
  );
}

export const QUEUE_MESSAGES = [
  "Shaking the pull request tree…",
  "Herding stray branches…",
  "Bribing the CI gremlins…",
  "Waking the Octocat gently…",
  "Sorting the one-liners from the sagas…",
  "Finding out what “small refactor” means this time…",
  "Brewing a fresh pot of diffs…",
  "Untangling someone’s rebase…",
  "Folding tiny origami LGTMs…",
  "Asking the merge conflicts to see themselves out…",
  "Counting semicolons. All of them.",
  "Checking who wrote “quick fix” at 2am…",
  "Polishing the green checkmarks…",
  "Rounding up the stragglers…",
  "Reading the room, and the README…",
] as const;

export const MINE_MESSAGES = [
  "Gathering your masterpieces…",
  "Reading your commit messages back to you…",
  "Checking whether CI likes you today…",
  "Finding everything with your fingerprints on it…",
  "Nudging your reviewers, politely…",
  "Admiring your branch names…",
  "Counting the TODOs you promised to fix…",
] as const;

export const HISTORY_MESSAGES = [
  "Rewinding the tape…",
  "Dusting off old LGTMs…",
  "Revisiting your greatest approvals…",
  "Consulting the archives…",
  "Remembering who you were last Tuesday…",
  "Leafing through your verdicts…",
] as const;

export const DIFF_MESSAGES = [
  "Unfurling the hunks…",
  "Painting the pluses green and the minuses red…",
  "Lining up the before and the after…",
  "Untangling the indentation…",
  "Ironing out the whitespace…",
  "Highlighting the interesting bits…",
  "Sharpening the syntax colours…",
] as const;
