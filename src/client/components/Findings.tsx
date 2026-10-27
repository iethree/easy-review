import { Badge, Button, Code, Group, Stack, Text } from "@mantine/core";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { addFinding, findingKey, useAssembly } from "../assembly.ts";
import { peek } from "../hooks/diffStore.ts";
import type { Finding, FindingSeverity } from "../../shared/findings.ts";
import type { PullRequest } from "../../shared/types.ts";
import { Markdown } from "./Markdown.tsx";

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
}

/**
 * Claude's points, one section each, to pick from for your own review. Adding
 * one puts it on its lines in the diff — with its suggested change, which the
 * author can apply — when it can, and in the summary when not.
 */
export function Findings({ pr, review, findings, onAdded }: Props) {
  const { added } = useAssembly(pr.id);
  const isAdded = (i: number) => added.includes(findingKey(review.id, i));
  const remaining = findings.map((_, i) => i).filter((i) => !isAdded(i));

  const add = (indexes: number[]) => {
    const entry = peek(pr);
    const diff = entry?.status === "ready" ? entry.data.diff : null;
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
            <Group gap={6} wrap="nowrap" pr={110}>
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
            <div className="er-finding-action">
              {done ? (
                <Badge size="sm" variant="light" color="teal" leftSection={<IconCheck size={11} />}>
                  In review
                </Badge>
              ) : (
                <Button size="compact-xs" leftSection={<IconPlus size={12} />} onClick={() => add([i])}>
                  Add to review
                </Button>
              )}
            </div>
          </section>
        );
      })}
    </Stack>
  );
}
