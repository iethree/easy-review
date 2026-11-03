import {
  type Icon,
  IconBolt,
  IconBook,
  IconBug,
  IconCamera,
  IconEye,
  IconFlask,
  IconPalette,
  IconRobot,
  IconShield,
  IconSitemap,
  IconStack2,
  IconUser,
} from "@tabler/icons-react";
import { createContext, useContext } from "react";
import type { ReviewerColor, ReviewerIconName, ReviewerLooks } from "../../shared/reviewerLook.ts";

export const REVIEWER_ICON: Record<ReviewerIconName, Icon> = {
  robot: IconRobot,
  user: IconUser,
  shield: IconShield,
  bug: IconBug,
  bolt: IconBolt,
  eye: IconEye,
  flask: IconFlask,
  book: IconBook,
  layers: IconStack2,
  sitemap: IconSitemap,
  camera: IconCamera,
  palette: IconPalette,
};

/** Every reviewer's look, from your settings: given once, by App. */
export const ReviewerLooksContext = createContext<ReviewerLooks>({});

/** A Mantine colour as CSS, a shade that reads in light and dark alike. */
export const reviewerColor = (color: ReviewerColor) => `var(--mantine-color-${color}-6)`;

/**
 * A reviewer's icon, in its colour. `fallback` is the colour for a reviewer
 * that hasn't been given one — and `color`, when set, overrides both (a failed
 * review is red, whoever's it is).
 */
export function ReviewerIcon({
  id,
  size = 14,
  color,
  fallback,
}: {
  id: string;
  size?: number;
  color?: string;
  fallback?: string;
}) {
  const look = useContext(ReviewerLooksContext)[id];
  const Glyph = REVIEWER_ICON[look?.icon ?? "robot"];
  return <Glyph size={size} color={color ?? (look?.color ? reviewerColor(look.color) : fallback)} />;
}
