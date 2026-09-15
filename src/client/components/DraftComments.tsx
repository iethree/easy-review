import { ActionIcon, Badge, Button, Group, Text, Textarea, Tooltip } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import type { DiffSide } from "../../shared/types.ts";
import { editDraft, removeDrafts, type DraftComment } from "../drafts.ts";
import { Markdown } from "./Markdown.tsx";

/**
 * The box for writing a comment on one line, or rewriting a pending one.
 *
 * It holds its own text, so typing never re-renders the diff around it. Nothing
 * is posted from here: the comment joins your review, and goes up when you
 * approve or request changes.
 */
export function LineCommentForm({
  where,
  initialBody = "",
  saveLabel,
  onSave,
  onClose,
}: {
  where: { path: string; line: number; side: DiffSide };
  initialBody?: string;
  saveLabel: string;
  onSave: (body: string) => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState(initialBody);

  const save = () => {
    const text = body.trim();
    if (!text) return;
    onSave(text);
    onClose();
  };

  return (
    <div className="er-diff-inline er-diff-compose">
      <Text size="xs" c="dimmed" mb={4} ff="monospace">
        {where.path}:{where.line} · {where.side === "LEFT" ? "old" : "new"}
      </Text>
      <Textarea
        data-autofocus
        autoFocus
        placeholder="Leave a comment on this line"
        autosize
        minRows={2}
        maxRows={10}
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") onClose();
          // The diff pane's own shortcuts must not fire while you're writing.
          e.stopPropagation();
        }}
      />
      <Group justify="space-between" mt={6}>
        <Text size="10px" c="dimmed">
          Posted with your review · ⌘/Ctrl + Enter
        </Text>
        <Group gap={6}>
          <Button size="compact-xs" variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button size="compact-xs" disabled={!body.trim()} onClick={save}>
            {saveLabel}
          </Button>
        </Group>
      </Group>
    </div>
  );
}

/** A comment waiting to go up with your review, shown under its line. */
export function DraftCard({ prId, draft }: { prId: string; draft: DraftComment }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <LineCommentForm
        where={draft}
        initialBody={draft.body}
        saveLabel="Save"
        onSave={(body) => editDraft(prId, draft.id, body)}
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      className="er-diff-thread"
      data-draft="true"
      style={{ borderLeftColor: "var(--mantine-color-yellow-6)" }}
    >
      <Group gap={6} wrap="nowrap" mb={4}>
        <Badge size="xs" variant="light" color="yellow" style={{ flex: "none" }}>
          Pending
        </Badge>
        <Text size="xs" c="dimmed" style={{ flex: 1 }}>
          Posted with your review
        </Text>
        <Tooltip label="Edit">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={() => setEditing(true)}
            aria-label="Edit this pending comment"
          >
            <IconPencil size={13} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            onClick={() => removeDrafts(prId, [draft.id])}
            aria-label="Delete this pending comment"
          >
            <IconTrash size={13} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <div className="er-diff-comment">
        <div style={{ minWidth: 0, flex: 1 }}>
          <Markdown>{draft.body}</Markdown>
        </div>
      </div>
    </div>
  );
}
