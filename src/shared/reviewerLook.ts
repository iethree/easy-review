/**
 * How a reviewer looks: an icon and a colour, chosen in Settings to tell
 * reviewers apart at a glance — on their tabs, in the menus. Kept with the
 * rest of your settings on this computer, by reviewer id; a reviewer without
 * one has the robot, in the colours of its review's status.
 */

export const REVIEWER_ICONS = [
  "robot",
  "user",
  "shield",
  "bug",
  "bolt",
  "eye",
  "flask",
  "book",
  "layers",
  "sitemap",
  "camera",
  "palette",
] as const;

export type ReviewerIconName = (typeof REVIEWER_ICONS)[number];

/** Mantine colour names, so each has a shade for light and for dark. */
export const REVIEWER_COLORS = [
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "orange",
] as const;

export type ReviewerColor = (typeof REVIEWER_COLORS)[number];

export interface ReviewerLook {
  icon?: ReviewerIconName;
  color?: ReviewerColor;
}

/** By reviewer id. */
export type ReviewerLooks = Record<string, ReviewerLook>;

const ICONS = new Set<string>(REVIEWER_ICONS);
const COLORS = new Set<string>(REVIEWER_COLORS);

/** What's stored, keeping only icons and colours that exist: it may be from another version. */
export function cleanLooks(value: unknown): ReviewerLooks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const looks: ReviewerLooks = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const { icon, color } = raw as { icon?: unknown; color?: unknown };
    const look: ReviewerLook = {};
    if (typeof icon === "string" && ICONS.has(icon)) look.icon = icon as ReviewerIconName;
    if (typeof color === "string" && COLORS.has(color)) look.color = color as ReviewerColor;
    if (look.icon || look.color) looks[id] = look;
  }
  return looks;
}

/** `looks` with one reviewer's changed; an empty look is dropped. */
export function withLook(looks: ReviewerLooks, id: string, look: ReviewerLook): ReviewerLooks {
  const { [id]: _old, ...rest } = looks;
  return look.icon || look.color ? { ...rest, [id]: look } : rest;
}
