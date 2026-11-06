import { Group, Text } from "@mantine/core";
import { type Icon, IconCircleCheck, IconCircleX, IconMessageCircle } from "@tabler/icons-react";
import type { AiVerdict, ReviewVerdict } from "../../shared/findings.ts";

/** How each verdict looks, wherever it's shown: GitHub's own words, in its colours. */
export const VERDICT_LOOK: Record<AiVerdict, { label: string; color: string; Icon: Icon }> = {
  approve: { label: "Approve", color: "teal", Icon: IconCircleCheck },
  comment: { label: "Comment", color: "blue", Icon: IconMessageCircle },
  "request-changes": { label: "Request changes", color: "red", Icon: IconCircleX },
};

/**
 * The verdict at the top of a review, with the reviewer's reason under it:
 * framed in the verdict's colour all round, so it stands out from the findings.
 */
export function VerdictBlock({ verdict, reviewerName }: { verdict: ReviewVerdict; reviewerName: string }) {
  const look = VERDICT_LOOK[verdict.verdict];
  const color = `var(--mantine-color-${look.color}-filled)`;
  return (
    <section
      className="er-ai-verdict"
      style={{ borderColor: color }}
      aria-label={`${reviewerName}'s verdict: ${look.label}`}
    >
      <Group gap={6} wrap="nowrap">
        <look.Icon size={16} color={color} />
        <Text size="sm" fw={600} c={color}>
          {look.label}
        </Text>
      </Group>
      {verdict.summary && (
        <Text size="sm" mt={2}>
          {verdict.summary}
        </Text>
      )}
    </section>
  );
}
