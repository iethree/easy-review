import { Anchor, Button, Checkbox, Group, Modal, Stack, Text } from "@mantine/core";
import { IconRobot } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { Reviewer } from "../../shared/aiReview.ts";
import type { PullRequest } from "../../shared/types.ts";

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
  pr: PullRequest | null;
  reviewers: Reviewer[];
  onClose: () => void;
  onStart: (pr: PullRequest, reviewerIds: string[]) => void;
  onManage: () => void;
}

/** Which reviewers should look at this pull request. Enter starts them. */
export function ReviewerPicker({ pr, reviewers, onClose, onStart, onManage }: Props) {
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (pr) setPicked(initialPick(reviewers, localStorage.getItem(STORAGE_KEY)));
  }, [pr, reviewers]);

  const start = () => {
    if (!pr || picked.length === 0) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(picked));
    onStart(pr, picked);
    onClose();
  };

  const all = picked.length === reviewers.length;

  return (
    <Modal opened={pr !== null} onClose={onClose} title="Review with Claude" size="md" radius="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
        // Enter on a checkbox starts too, not just on the button.
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            start();
          }
        }}
      >
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Each reviewer runs as its own Claude session, in its own tab.
            </Text>
            <Anchor
              component="button"
              type="button"
              size="xs"
              onClick={() => setPicked(all ? reviewers.slice(0, 1).map((r) => r.id) : reviewers.map((r) => r.id))}
            >
              {all ? "Just one" : "All"}
            </Anchor>
          </Group>
          <Checkbox.Group value={picked} onChange={setPicked}>
            <Stack gap={10}>
              {reviewers.map((r, i) => (
                <Checkbox
                  key={r.id}
                  value={r.id}
                  data-autofocus={i === 0 || undefined}
                  label={r.name}
                  description={firstLine(r.instructions)}
                  styles={{ description: { maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }}
                />
              ))}
            </Stack>
          </Checkbox.Group>
          <Group justify="space-between" mt="xs">
            <Anchor component="button" type="button" size="xs" c="dimmed" onClick={onManage}>
              Edit reviewers…
            </Anchor>
            <Button type="submit" leftSection={<IconRobot size={16} />} disabled={picked.length === 0}>
              {picked.length > 1 ? `Start ${picked.length} reviews` : "Start review"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim())?.trim() ?? "";
}
