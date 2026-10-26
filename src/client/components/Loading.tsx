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

/** Cycles through `messages` every couple of seconds, so a wait has some company. */
function useRotating(messages: readonly string[], everyMs = 2400): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % messages.length), everyMs);
    return () => clearInterval(id);
  }, [messages, everyMs]);
  return messages[i % messages.length] ?? "";
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
  "Asking GitHub what needs your eyes…",
  "Lining up the quick wins…",
  "Counting the lines so you don't have to…",
  "Checking which builds are green…",
  "Sorting easy from hard…",
] as const;

export const MINE_MESSAGES = [
  "Gathering your pull requests…",
  "Finding everything with your name on it…",
  "Checking on your builds…",
] as const;

export const HISTORY_MESSAGES = [
  "Digging through your past reviews…",
  "Remembering what you approved…",
  "Dusting off old verdicts…",
] as const;

export const DIFF_MESSAGES = [
  "Fetching the diff…",
  "Unfolding the hunks…",
  "Painting the pluses green and the minuses red…",
  "Highlighting the syntax…",
] as const;
