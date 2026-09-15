const UNITS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.348, "week"],
  [12, "month"],
];

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "narrow" });

/** "3d ago" / "2mo ago" from an ISO timestamp. */
export function relativeTime(iso: string): string {
  if (!iso) return "";
  let delta = (Date.parse(iso) - Date.now()) / 1000;
  if (!Number.isFinite(delta)) return "";

  for (const [step, unit] of UNITS) {
    if (Math.abs(delta) < step) return rtf.format(Math.round(delta), unit);
    delta /= step;
  }
  return rtf.format(Math.round(delta), "year");
}

export function absoluteTime(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.valueOf()) ? "" : date.toLocaleString();
}
