/**
 * Black or white text, whichever reads better on a GitHub label's colour
 * (hex, without the #): the one with more contrast, as WCAG measures it.
 */
export function readableOn(hex: string): string {
  const value = /^[0-9a-f]{6}$/i.test(hex) ? hex : "888888";
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Where black and white have the same contrast.
  return luminance > 0.179 ? "#1f2328" : "#ffffff";
}
