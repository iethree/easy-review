import {
  ActionIcon,
  Badge,
  Button,
  Code,
  Group,
  Popover,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconMessageCircle, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { composeApprovalBody, DEFAULT_APPROVAL_EMOJI } from "../../shared/approval.ts";
import type { PullRequest, ReviewEvent } from "../../shared/types.ts";
import { removeDrafts, reviewCommit, useDrafts, type DraftComment } from "../drafts.ts";
import { EmojiPicker } from "./EmojiPicker.tsx";

interface Props {
  pr: PullRequest;
  /** Shared with the keyboard shortcuts so both paths behave identically. */
  onSubmit: (pr: PullRequest, event: ReviewEvent, body?: string) => Promise<void>;
  /** Set once this pull request has been reviewed in this session. */
  reviewed?: ReviewEvent;
  /** Let the keyboard shortcuts open either box. */
  changesOpen?: boolean;
  onChangesOpenChange?: (open: boolean) => void;
  approveOpen?: boolean;
  onApproveOpenChange?: (open: boolean) => void;
  /**
   * Your own pull request. GitHub won't let you approve it or request
   * changes on it, so the only review left is a comment.
   */
  ownPr?: boolean;
}

/** Controlled when the parent passes a value, self-managed otherwise. */
function useOpenState(controlled: boolean | undefined, onChange?: (open: boolean) => void) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (next: boolean) => {
    onChange?.(next);
    setInner(next);
  };
  return [open, setOpen] as const;
}

/**
 * Approving is two separate actions: Approve opens the confirmation, and the
 * confirmation's own button (or Enter) posts it. The confirm button is not
 * where the first click landed, so a double-click can't approve by accident.
 */
export function ReviewActions({
  pr,
  onSubmit,
  reviewed,
  changesOpen: changesOpenProp,
  onChangesOpenChange,
  approveOpen: approveOpenProp,
  onApproveOpenChange,
  ownPr = false,
}: Props) {
  const [busy, setBusy] = useState<ReviewEvent | null>(null);
  const [changesOpen, setChangesOpen] = useOpenState(changesOpenProp, onChangesOpenChange);
  const [approveOpen, setApproveOpen] = useOpenState(approveOpenProp, onApproveOpenChange);
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_APPROVAL_EMOJI);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  // Comments on the code go up inside whichever review you submit.
  const drafts = useDrafts(pr.id);
  const blocked = reviewCommit(drafts).error !== null;

  // Every approval starts from 🎉; picking another is a choice for this one
  // approval, not a setting that sticks.
  useEffect(() => {
    if (approveOpen) setEmoji(DEFAULT_APPROVAL_EMOJI);
  }, [approveOpen]);

  async function send(event: ReviewEvent, body: string | undefined, done: () => void) {
    setBusy(event);
    try {
      await onSubmit(pr, event, body);
      done();
    } catch {
      // onSubmit already showed the failure. Swallow it here so the rejection
      // does not escape as an unhandled rejection, and leave the box open with
      // what was typed so it can be retried.
    } finally {
      setBusy(null);
    }
  }

  const confirmApproval = () => {
    if (busy || blocked) return;
    void send("APPROVE", composeApprovalBody(emoji, note), () => {
      setApproveOpen(false);
      setNote("");
    });
  };

  const requestChanges = (event: "REQUEST_CHANGES" | "COMMENT") => {
    if (blocked) return;
    void send(event, comment, () => {
      setChangesOpen(false);
      setComment("");
    });
  };

  const alreadyReviewed = reviewed !== undefined;

  return (
    <Group gap={6} wrap="nowrap">
      {!ownPr && (
        <Popover
          opened={approveOpen}
          onChange={setApproveOpen}
          width={360}
          position="bottom-end"
          shadow="md"
          trapFocus
        >
          <Popover.Target>
            <Tooltip
              label={alreadyReviewed ? "Already reviewed — refresh to update the queue" : "Approve… (Enter)"}
            >
              <Button
                size="compact-sm"
                variant="light"
                color="teal"
                leftSection={<IconCheck size={14} stroke={2.6} />}
                disabled={alreadyReviewed}
                onClick={() => {
                  setChangesOpen(false);
                  setApproveOpen(!approveOpen);
                }}
                aria-expanded={approveOpen}
                aria-label={`Approve ${pr.repo}#${pr.number} (asks to confirm)`}
              >
                Approve
              </Button>
            </Tooltip>
          </Popover.Target>

          <Popover.Dropdown>
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Approve {pr.repo}#{pr.number}?
              </Text>
              <EmojiPicker
                value={emoji}
                onChange={(next) => {
                  setEmoji(next);
                  // Back to the comment, so the next Enter confirms.
                  noteRef.current?.focus();
                }}
              />
              <Textarea
                ref={noteRef}
                // Focused as soon as the box opens, so Enter-then-Enter works.
                data-autofocus
                placeholder="Add a comment (optional)"
                autosize
                minRows={2}
                maxRows={8}
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    // A held key repeats; it must not both open and confirm.
                    if (!e.repeat) confirmApproval();
                  }
                  if (e.key === "Escape") setApproveOpen(false);
                  e.stopPropagation();
                }}
              />
              <PendingComments pr={pr} drafts={drafts} />
              <Group justify="space-between" wrap="nowrap" align="center">
                <Text size="xs" c="dimmed" truncate style={{ minWidth: 0 }}>
                  Posts <Code fz={11}>{composeApprovalBody(emoji, note).split("\n")[0]}</Code>
                </Text>
                <Button
                  size="compact-sm"
                  color="teal"
                  loading={busy === "APPROVE"}
                  disabled={blocked}
                  onClick={confirmApproval}
                  style={{ flex: "none" }}
                >
                  Approve with {emoji}
                </Button>
              </Group>
              <Text size="10px" c="dimmed" ta="right">
                Enter to approve · Shift+Enter for a new line · Esc to cancel
              </Text>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      )}

      <Popover
        opened={changesOpen}
        onChange={setChangesOpen}
        width={360}
        position="bottom-end"
        shadow="md"
        trapFocus
      >
        <Popover.Target>
          <Tooltip label={alreadyReviewed ? "Already reviewed" : ownPr ? "Comment (r)" : "Request changes (r)"}>
            <ActionIcon
              variant="light"
              color="orange"
              size="md"
              disabled={alreadyReviewed}
              onClick={() => {
                setApproveOpen(false);
                setChangesOpen(!changesOpen);
              }}
              aria-label={`${ownPr ? "Comment on" : "Request changes on"} ${pr.repo}#${pr.number}`}
            >
              <IconMessageCircle size={15} stroke={2.2} />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>

        <Popover.Dropdown>
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              {ownPr ? "Commenting on your own" : "Requesting changes on"}{" "}
              <Text span fw={600} c="inherit">
                {pr.repo}#{pr.number}
              </Text>
            </Text>
            <Textarea
              data-autofocus
              placeholder={ownPr ? "Notes for reviewers, or for yourself" : "What needs to change?"}
              autosize
              minRows={3}
              maxRows={10}
              value={comment}
              onChange={(e) => setComment(e.currentTarget.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && comment.trim()) {
                  e.preventDefault();
                  requestChanges(ownPr ? "COMMENT" : "REQUEST_CHANGES");
                }
                if (e.key === "Escape") setChangesOpen(false);
                e.stopPropagation();
              }}
            />
            <PendingComments pr={pr} drafts={drafts} />
            {ownPr ? (
              <Group justify="flex-end">
                <Button
                  size="compact-sm"
                  loading={busy === "COMMENT"}
                  disabled={!comment.trim() || blocked}
                  onClick={() => requestChanges("COMMENT")}
                >
                  Comment
                </Button>
              </Group>
            ) : (
              <Group justify="space-between">
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  loading={busy === "COMMENT"}
                  disabled={!comment.trim() || blocked}
                  onClick={() => requestChanges("COMMENT")}
                >
                  Comment only
                </Button>
                <Button
                  size="compact-sm"
                  color="orange"
                  loading={busy === "REQUEST_CHANGES"}
                  disabled={!comment.trim() || blocked}
                  onClick={() => requestChanges("REQUEST_CHANGES")}
                >
                  Request changes
                </Button>
              </Group>
            )}
            <Text size="10px" c="dimmed" ta="right">
              ⌘/Ctrl + Enter to submit
            </Text>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}

/**
 * The comments on the code that will go up with this review — so submitting
 * never posts something you'd forgotten was waiting.
 */
function PendingComments({ pr, drafts }: { pr: PullRequest; drafts: DraftComment[] }) {
  if (drafts.length === 0) return null;
  const { error } = reviewCommit(drafts);
  const older = drafts.filter((draft) => draft.commitId !== pr.headSha).length;

  return (
    <Stack
      gap={4}
      p={8}
      style={{ border: "1px solid var(--er-row-border)", borderRadius: "var(--mantine-radius-sm)" }}
    >
      <Text size="xs" fw={600}>
        Also posts {drafts.length} comment{drafts.length === 1 ? "" : "s"} on the code
      </Text>
      <Stack gap={2} mah={132} style={{ overflowY: "auto" }}>
        {drafts.map((draft) => (
          <Group key={draft.id} gap={6} wrap="nowrap">
            <Text size="xs" ff="monospace" c="dimmed" style={{ flex: "none" }}>
              {draft.path.slice(draft.path.lastIndexOf("/") + 1)}:{draft.line}
            </Text>
            <Text size="xs" truncate style={{ minWidth: 0, flex: 1 }}>
              {draft.body}
            </Text>
            {draft.commitId !== pr.headSha && (
              <Badge size="xs" variant="light" color="yellow" style={{ flex: "none" }}>
                older commit
              </Badge>
            )}
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              onClick={() => removeDrafts(pr.id, [draft.id])}
              aria-label={`Remove the comment on ${draft.path}:${draft.line} from this review`}
            >
              <IconX size={12} />
            </ActionIcon>
          </Group>
        ))}
      </Stack>
      {error ? (
        <Text size="xs" c="red.6">
          {error}
        </Text>
      ) : (
        older > 0 && (
          <Text size="xs" c="dimmed">
            Written on an older commit than the pull request is at now, so they're posted against
            that commit and may show as outdated.
          </Text>
        )
      )}
    </Stack>
  );
}
