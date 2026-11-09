import { Group, Text, Tooltip } from "@mantine/core";
import { type Icon, IconCircleCheck, IconCircleX, IconMessageCircle } from "@tabler/icons-react";
import type { AiReviewSummary } from "../../shared/aiReview.ts";
import type { AiVerdict, ReviewVerdict } from "../../shared/findings.ts";
import { reviewStanding } from "../reviewStanding.ts";

/** How each verdict looks, wherever it's shown: GitHub's own words, in its colours. */
export const VERDICT_LOOK: Record<AiVerdict, { label: string; color: string; Icon: Icon }> = {
  approve: { label: "Approve", color: "teal", Icon: IconCircleCheck },
  comment: { label: "Comment", color: "blue", Icon: IconMessageCircle },
  "request-changes": { label: "Request changes", color: "red", Icon: IconCircleX },
};

/**
 * A finished review's verdict, as a bare icon on its tab; nothing until it
 * has one. Faded when it was of an older commit.
 */
export function TabVerdict({ job, headSha }: { job: AiReviewSummary; headSha: string }) {
  const standing = reviewStanding(job, headSha);
  if (standing.kind !== "verdict") return null;
  const look = VERDICT_LOOK[standing.verdict];
  const label = `${look.label}${standing.stale ? ", of an older commit" : ""}`;
  return (
    <Tooltip label={label} openDelay={300}>
      <look.Icon
        size={14}
        color={`var(--mantine-color-${look.color}-6)`}
        opacity={standing.stale ? 0.45 : 1}
        aria-label={label}
        role="img"
      />
    </Tooltip>
  );
}

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
