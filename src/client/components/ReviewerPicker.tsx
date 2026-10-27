import { ActionIcon, Anchor, Button, Checkbox, Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconRobot, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { Reviewer } from "../../shared/aiReview.ts";

const STORAGE_KEY = "easy-review:picked-reviewers";

/** Last time's choice, minus any reviewer that has gone since; else the first. */
export function initialPick(reviewers: readonly Reviewer[], stored: string | null): string[] {
  let saved: unknown = null;
  try {
    saved = stored ? JSON.parse(stored) : null;
  } catch {
    // A damaged entry is just no memory.
  }
  const ids = new Set(reviewers.map((r) => r.id));
  const kept = Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string" && ids.has(id)) : [];
  return kept.length > 0 ? kept : reviewers.slice(0, 1).map((r) => r.id);
}

interface Props {
  reviewers: Reviewer[];
  onStart: (reviewerIds: string[]) => void;
  onCancel: () => void;
  onManage: () => void;
}

/**
 * Which reviewers should look at this pull request — a popover from the
 * robot in its header. Enter starts them; Escape puts it away.
 */
export function ReviewerPicker({ reviewers, onStart, onCancel, onManage }: Props) {
  const [picked, setPicked] = useState<string[]>(() => initialPick(reviewers, localStorage.getItem(STORAGE_KEY)));
  const firstRef = useRef<HTMLInputElement>(null);

  // Ready for the keyboard as soon as it appears.
  useEffect(() => firstRef.current?.focus({ preventScroll: true }), []);

  const start = () => {
    if (picked.length === 0) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(picked));
    onStart(picked);
  };

  const all = picked.length === reviewers.length;

  return (
    <form
      aria-label="Choose reviewers"
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
      // Its keys are its own: Enter on a checkbox starts too, and Escape
      // closes this rather than reaching the app's shortcuts.
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          e.stopPropagation();
          start();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={600}>
            Who should review this?
          </Text>
          <Group gap={8} wrap="nowrap">
            {reviewers.length > 1 && (
              <Anchor
                component="button"
                type="button"
                size="xs"
                onClick={() => setPicked(all ? reviewers.slice(0, 1).map((r) => r.id) : reviewers.map((r) => r.id))}
              >
                {all ? "Just one" : "All"}
              </Anchor>
            )}
            <Tooltip label="Cancel (Esc)">
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={onCancel} aria-label="Cancel">
                <IconX size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        <Checkbox.Group value={picked} onChange={setPicked}>
          <Stack gap={8}>
            {reviewers.map((r, i) => (
              <Checkbox
                key={r.id}
                ref={i === 0 ? firstRef : undefined}
                value={r.id}
                label={r.name}
                description={firstLine(r.instructions)}
                styles={{ description: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }}
              />
            ))}
          </Stack>
        </Checkbox.Group>
        <Group justify="space-between">
          <Anchor component="button" type="button" size="xs" c="dimmed" onClick={onManage}>
            Edit reviewers…
          </Anchor>
          <Button type="submit" size="xs" leftSection={<IconRobot size={15} />} disabled={picked.length === 0}>
            {picked.length > 1 ? `Start ${picked.length} reviews` : "Start review"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim())?.trim() ?? "";
}
