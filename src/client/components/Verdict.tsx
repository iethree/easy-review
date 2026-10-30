import { Alert, Text } from "@mantine/core";
import { type Icon, IconCircleCheck, IconCircleX, IconMessageCircle } from "@tabler/icons-react";
import type { AiVerdict, ReviewVerdict } from "../../shared/findings.ts";

/** How each verdict looks, wherever it's shown: GitHub's own words, in its colours. */
export const VERDICT_LOOK: Record<AiVerdict, { label: string; color: string; Icon: Icon }> = {
  approve: { label: "Approve", color: "teal", Icon: IconCircleCheck },
  comment: { label: "Comment", color: "blue", Icon: IconMessageCircle },
  "request-changes": { label: "Request changes", color: "red", Icon: IconCircleX },
};

/** The verdict at the top of a review, with the reviewer's reason under it. */
export function VerdictBlock({ verdict, reviewerName }: { verdict: ReviewVerdict; reviewerName: string }) {
  const look = VERDICT_LOOK[verdict.verdict];
  return (
    <Alert
      className="er-verdict"
      color={look.color}
      variant="light"
      icon={<look.Icon size={20} />}
      title={look.label}
      aria-label={`${reviewerName}'s verdict: ${look.label}`}
    >
      {verdict.summary && <Text size="sm">{verdict.summary}</Text>}
    </Alert>
  );
}
