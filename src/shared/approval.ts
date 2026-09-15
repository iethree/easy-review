/**
 * Approvals are posted with a positive emoji, optionally followed by a
 * comment. Shared so the client composes them and the server enforces them
 * with the same definition of "positive".
 */

export const POSITIVE_EMOJIS = [
  { emoji: "🎉", name: "party popper" },
  { emoji: "🚀", name: "rocket" },
  { emoji: "✅", name: "check mark" },
  { emoji: "👍", name: "thumbs up" },
  { emoji: "🙌", name: "raised hands" },
  { emoji: "💯", name: "hundred points" },
  { emoji: "✨", name: "sparkles" },
  { emoji: "🥳", name: "partying face" },
  { emoji: "👏", name: "clapping hands" },
  { emoji: "💚", name: "green heart" },
  { emoji: "🌟", name: "glowing star" },
  { emoji: "🏆", name: "trophy" },
] as const;

/** Every approval starts from this; choosing another is a per-approval act. */
export const DEFAULT_APPROVAL_EMOJI = "🎉";

const POSITIVE = new Set<string>(POSITIVE_EMOJIS.map((e) => e.emoji));

export function isPositiveEmoji(value: string): boolean {
  return POSITIVE.has(value);
}

/** The first character of the body, counting an emoji as one. */
export function leadingEmoji(body: string | undefined | null): string | null {
  const first = Array.from((body ?? "").trimStart())[0];
  return first ?? null;
}

export function startsWithPositiveEmoji(body: string | undefined | null): boolean {
  const first = leadingEmoji(body);
  return first !== null && isPositiveEmoji(first);
}

/** "🎉" or "🎉 Nice work". Throws rather than post an approval that breaks the rule. */
export function composeApprovalBody(emoji: string, comment = ""): string {
  if (!isPositiveEmoji(emoji)) throw new Error(`${emoji} isn't one of the approval emojis`);
  const text = comment.trim();
  return text ? `${emoji} ${text}` : emoji;
}
