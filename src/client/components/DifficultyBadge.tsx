import { Badge, Text, Tooltip, type MantineSize } from "@mantine/core";
import type { DifficultyResult } from "../../shared/difficulty.ts";
import { DIFFICULTY_COLOR } from "../theme.ts";

const LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

/** The difficulty in words, for the preview's header. In the list it is the row stripe's colour. */
export function DifficultyBadge({ rating, size }: { rating: DifficultyResult; size?: MantineSize }) {
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
        fullWidth
        style={{ cursor: "default" }}
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
