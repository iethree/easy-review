/**
 * How a review refers to its screenshots (see src/local/screenshots.ts): as
 * screenshots/<file> in an image, and as a fenced compare block of two, a
 * before and an after. The page fetches them from the review's own route.
 */

const NAME = /^(?:\.\/)?(?:\.easy-review\/)?screenshots\/([\w-][\w.-]*\.(?:png|jpe?g|webp))$/i;

/** The kept file a reference names, or null for anything else. */
export function screenshotName(src: string): string | null {
  return NAME.exec(src.trim())?.[1] ?? null;
}

export function screenshotUrl(reviewId: string, name: string): string {
  return `/api/local/reviews/${encodeURIComponent(reviewId)}/screenshots/${encodeURIComponent(name)}`;
}

/** A compare block's two screenshots, or null if it doesn't name both. */
export function parseCompare(text: string): { before: string; after: string } | null {
  const sides: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*(before|after)\s*:\s*(.+?)\s*$/i.exec(line);
    const name = m?.[2] ? screenshotName(m[2]) : null;
    if (m?.[1] && name) sides[m[1].toLowerCase()] = name;
  }
  return sides.before && sides.after ? { before: sides.before, after: sides.after } : null;
}
