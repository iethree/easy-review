import { ActionIcon, Alert, Button, Code, Group, ScrollArea, Stack, Text, Textarea, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconMessageCircle, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { composeApprovalBody, DEFAULT_APPROVAL_EMOJI } from "../../shared/approval.ts";
import type { PullRequest, ReviewEvent } from "../../shared/types.ts";
import { clearAssembly, setSummary, useAssembly } from "../assembly.ts";
import { removeDrafts, reviewCommit, useDrafts } from "../drafts.ts";

interface Props {
  pr: PullRequest | null;
  /** Your own pull request: GitHub only takes a comment on it. */
  ownPr: boolean;
  /** Already reviewed in this session. */
  reviewed: ReviewEvent | undefined;
  onSubmit: (pr: PullRequest, event: ReviewEvent, body?: string) => Promise<void>;
  onClose: () => void;
}

/**
 * The third pane: the review you're putting together for the pull request on
 * screen — its summary and its comments on the code, from you or picked from
 * Claude's findings — and the buttons that send it.
 */
export function ReviewPane({ pr, ownPr, reviewed, onSubmit, onClose }: Props) {
  const { summary } = useAssembly(pr?.id);
  const drafts = useDrafts(pr?.id);
  const [busy, setBusy] = useState<ReviewEvent | null>(null);
  // Approving takes two clicks, as everywhere else: the first only arms it.
  // (The pane is keyed by pull request, so moving on disarms it.)
  const [armed, setArmed] = useState(false);

  const commitProblem = reviewCommit(drafts).error;
  const hasContent = summary.trim() !== "" || drafts.length > 0;

  const send = async (event: ReviewEvent) => {
    if (!pr) return;
    setBusy(event);
    try {
      const body = event === "APPROVE" ? composeApprovalBody(DEFAULT_APPROVAL_EMOJI, summary) : summary;
      await onSubmit(pr, event, body);
      clearAssembly(pr.id);
    } catch {
      // onSubmit has said why; what was written stays, to retry.
    } finally {
      setBusy(null);
      setArmed(false);
    }
  };

  return (
    <aside className="er-pane er-review-pane" aria-label="Your review">
      <div className="er-pane-head">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={700} truncate>
            {pr ? `Your review of #${pr.number}` : "Your review"}
          </Text>
          <Tooltip label="Close the review pane">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose} aria-label="Close the review pane">
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>

      {!pr ? (
        <Text size="sm" c="dimmed" p="md">
          Pick a pull request to review.
        </Text>
      ) : (
        <>
          <ScrollArea style={{ flex: 1 }} type="auto">
            <Stack gap="sm" p="sm">
              <Textarea
                label="Summary"
                placeholder={ownPr ? "Notes for reviewers, or for yourself" : "What you think overall"}
                autosize
                minRows={5}
                value={summary}
                onChange={(e) => setSummary(pr.id, e.currentTarget.value)}
                styles={{ input: { fontSize: 13 } }}
              />

              <Text size="xs" fw={600}>
                Comments on the code · {drafts.length}
              </Text>
              {drafts.length === 0 ? (
                <Text size="xs" c="dimmed">
                  Comment on a line in the diff, or add Claude's findings from its review — they collect here
                  and go up together.
                </Text>
              ) : (
                drafts.map((draft) => (
                  <div key={draft.id} className="er-review-pane-comment">
                    <Group justify="space-between" wrap="nowrap" gap={6}>
                      <Code fz={11} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {draft.path}:{draft.line}
                      </Code>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={() => removeDrafts(pr.id, [draft.id])}
                        aria-label={`Remove the comment on ${draft.path}:${draft.line}`}
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    </Group>
                    <Text size="xs" mt={4} lineClamp={4} style={{ whiteSpace: "pre-wrap" }}>
                      {draft.body}
                    </Text>
                  </div>
                ))
              )}

              {commitProblem && (
                <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={14} />} p="xs">
                  <Text size="xs">{commitProblem}</Text>
                </Alert>
              )}
            </Stack>
          </ScrollArea>

          <div className="er-review-pane-actions">
            {reviewed ? (
              <Text size="xs" c="dimmed" ta="center">
                Reviewed — refresh to update the queue.
              </Text>
            ) : (
              <Group gap={6} grow>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<IconMessageCircle size={14} />}
                  loading={busy === "COMMENT"}
                  disabled={!hasContent || commitProblem !== null || busy !== null}
                  onClick={() => void send("COMMENT")}
                >
                  Comment
                </Button>
                {!ownPr && (
                  <Button
                    size="xs"
                    variant="light"
                    color="orange"
                    loading={busy === "REQUEST_CHANGES"}
                    // GitHub wants words with a change request.
                    disabled={summary.trim() === "" || commitProblem !== null || busy !== null}
                    onClick={() => void send("REQUEST_CHANGES")}
                  >
                    Request changes
                  </Button>
                )}
                {!ownPr && (
                  <Button
                    size="xs"
                    color="teal"
                    variant={armed ? "filled" : "light"}
                    leftSection={<IconCheck size={14} />}
                    loading={busy === "APPROVE"}
                    disabled={commitProblem !== null || busy !== null}
                    onClick={() => (armed ? void send("APPROVE") : setArmed(true))}
                  >
                    {armed ? "Confirm" : "Approve"}
                  </Button>
                )}
              </Group>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
