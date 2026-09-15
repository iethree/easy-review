import { Badge, Text, Tooltip, type MantineSize } from "@mantine/core";
import type { DifficultyResult } from "../../shared/difficulty.ts";
import { DIFFICULTY_COLOR } from "../theme.ts";

const LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

export function DifficultyBadge({
  rating,
  size,
  compact = false,
}: {
  rating: DifficultyResult;
  size?: MantineSize;
  /** Just the colored initial — E, M or H — for the list, where space is tight. */
  compact?: boolean;
}) {
  const label = LABEL[rating.level];

  return (
    <Tooltip
      label={
        <>
          <Text size="xs" fw={600}>
            {label} review
          </Text>
          <Text size="xs" c="dimmed">
            {rating.reason}
          </Text>
        </>
      }
      multiline
      w={220}
    >
      <Badge
        color={DIFFICULTY_COLOR[rating.level]}
        variant="light"
        size={size}
        circle={compact}
        fullWidth={!compact}
        // The initial alone means nothing to a screen reader.
        aria-label={compact ? `${label} review` : undefined}
        style={{ cursor: "default" }}
      >
        {compact ? label[0] : label}
      </Badge>
    </Tooltip>
  );
}
