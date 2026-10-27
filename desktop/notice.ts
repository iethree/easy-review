/**
 * A notification the page asks the main process to post: when a Claude
 * review finishes while you're looking elsewhere. The page is ours, but the
 * main process checks what crosses the bridge all the same.
 */

export interface Notice {
  /** Echoed back when it's clicked, so the page can open the review. */
  id: string;
  title: string;
  body: string;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function parseNotice(input: unknown): Notice | null {
  if (!input || typeof input !== "object") return null;
  const { id, title, body } = input as Record<string, unknown>;
  if (typeof id !== "string" || !id || id.length > 200) return null;
  if (typeof title !== "string" || !title.trim()) return null;
  return {
    id,
    title: clip(title.trim(), 120),
    body: typeof body === "string" ? clip(body.trim(), 300) : "",
  };
}
