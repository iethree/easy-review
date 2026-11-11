import { gemoji } from "gemoji";

/** One emoji, as GitHub names it: `:tada:` is 🎉. */
export interface EmojiMatch {
  emoji: string;
  /** The name that matched, without its colons. */
  name: string;
}

/**
 * The `:name` being typed just before the caret, and where its colon is; null
 * when the caret isn't at the end of one. The colon must start a word (so a
 * time like `10:30` or a URL's `https:` isn't one), and two letters must
 * follow it before anything is suggested.
 */
export function emojiQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|[\s([{"'])(:([+\-\w]{2,}))$/.exec(before);
  if (!match) return null;
  const query = match[3] ?? "";
  return { start: caret - query.length - 1, query: query.toLowerCase() };
}

/**
 * The emoji whose names fit `query`, best first: names that start with it, then
 * names that hold it, then emoji tagged with it. Each emoji appears once, under
 * the name that matched best.
 */
export function searchEmoji(query: string, limit = 8): EmojiMatch[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const tiers: EmojiMatch[][] = [[], [], []];
  for (const entry of gemoji) {
    const prefix = entry.names.find((n) => n.startsWith(q));
    if (prefix) {
      tiers[0]?.push({ emoji: entry.emoji, name: prefix });
      continue;
    }
    const inner = entry.names.find((n) => n.includes(q));
    if (inner) {
      tiers[1]?.push({ emoji: entry.emoji, name: inner });
      continue;
    }
    const first = entry.names[0];
    if (first && entry.tags.some((t) => t.startsWith(q))) tiers[2]?.push({ emoji: entry.emoji, name: first });
  }
  // Within a tier, the exact name, then the shortest: `:smile` finds 😄 before 😸.
  const rank = (a: EmojiMatch, b: EmojiMatch) =>
    Number(b.name === q) - Number(a.name === q) || a.name.length - b.name.length;
  return tiers.flatMap((tier) => tier.sort(rank)).slice(0, limit);
}

/** `text` with the `:name` from `start` to `caret` swapped for the emoji, and where the caret goes. */
export function insertEmoji(
  text: string,
  start: number,
  caret: number,
  emoji: string,
): { text: string; caret: number } {
  const after = text.slice(caret);
  // A space after it, unless one is already there.
  const gap = /^\s/.test(after) ? "" : " ";
  const head = `${text.slice(0, start)}${emoji}${gap}`;
  return { text: head + after, caret: head.length };
}
