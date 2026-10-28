import { Badge, Button, Code, Group, Stack, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { addFinding, findingKey, useAdded } from "../assembly.ts";
import { peek } from "../hooks/diffStore.ts";
import { placeFinding, summaryItem, type Finding, type FindingSeverity } from "../../shared/findings.ts";
import type { PullRequest } from "../../shared/types.ts";
import { Markdown } from "./Markdown.tsx";
import { AddButton, AskButton } from "./ProseReview.tsx";

const SEVERITY: Record<FindingSeverity, { color: string; label: string }> = {
  blocking: { color: "red", label: "Blocking" },
  suggestion: { color: "indigo", label: "Suggestion" },
  question: { color: "yellow", label: "Question" },
  nit: { color: "gray", label: "Nit" },
};

interface Props {
  pr: PullRequest;
  review: { id: string; headSha: string };
  findings: Finding[];
  /** Something went into the review: show it. */
  onAdded: () => void;
  /** Ask Claude about a finding; absent when its session can't be continued. */
  onAsk?: (text: string) => void;
}

/**
 * Claude's points, one section each, to pick from for your own review. Adding
 * one puts it on its lines in the diff — with its suggested change, which the
 * author can apply — when it can, and in the summary when not.
 */
export function Findings({ pr, review, findings, onAdded, onAsk }: Props) {
  const added = useAdded(pr.id);
  const isAdded = (i: number) => added.has(findingKey(review.id, i));
  const remaining = findings.map((_, i) => i).filter((i) => !isAdded(i));

  const entry = peek(pr);
  const diff = entry?.status === "ready" ? entry.data.diff : null;
  /** What the + will do with it, for its tooltip. */
  const destination = (finding: Finding) => {
    const place = placeFinding(finding, diff, review.headSha, pr.headSha);
    return place.kind === "line"
      ? `Comment on ${place.path.split("/").pop()}:${place.startLine ? `${place.startLine}–` : ""}${place.line}`
      : "Add to summary";
  };

  const add = (indexes: number[]) => {
    for (const i of indexes) {
      const finding = findings[i];
      if (finding) addFinding(pr, review, finding, i, diff);
    }
    onAdded();
  };

  return (
    <Stack gap="xs" mt="md">
      <Group justify="space-between">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.4 }}>
          Findings · {findings.length}
        </Text>
        {remaining.length > 1 && (
          <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={12} />} onClick={() => add(remaining)}>
            Add all to review
          </Button>
        )}
      </Group>
      {findings.map((finding, i) => {
        const severity = SEVERITY[finding.severity];
        const done = isAdded(i);
        const lines = finding.line ? `:${finding.startLine ? `${finding.startLine}–` : ""}${finding.line}` : "";
        return (
          // A section per point; its action shows on hover or focus, so the
          // list reads as a review rather than a wall of buttons.
          <section key={findingKey(review.id, i)} className="er-finding" data-added={done} aria-label={finding.title}>
            <Group gap={6} wrap="nowrap" pr={onAsk ? 60 : 32}>
              <Badge size="xs" variant="light" color={severity.color} style={{ flex: "none" }}>
                {severity.label}
              </Badge>
              <Text size="sm" fw={600} truncate>
                {finding.title}
              </Text>
            </Group>
            {finding.path && (
              <Code fz={11} mt={4} style={{ display: "inline-block" }}>
                {finding.path}
                {lines}
              </Code>
            )}
            {finding.body && (
              <div className="er-finding-body">
                <Markdown>{finding.body}</Markdown>
              </div>
            )}
            {finding.suggestion !== undefined && (
              <div className="er-finding-suggestion">
                <Text size="10px" fw={700} tt="uppercase" c="dimmed" mb={4} style={{ letterSpacing: 0.4 }}>
                  Suggested change
                </Text>
                <pre>{finding.suggestion || " "}</pre>
              </div>
            )}
            <Group gap={4} wrap="nowrap" className="er-finding-action">
              {onAsk && <AskButton onAsk={() => onAsk(summaryItem(finding))} />}
              <AddButton done={done} label={destination(finding)} onAdd={() => add([i])} />
            </Group>
          </section>
        );
      })}
    </Stack>
  );
}
