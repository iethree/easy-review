import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Code,
  Group,
  Loader,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconArrowLeft, IconPlus, IconTrash, IconUser } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { Reviewer } from "../../shared/aiReview.ts";
import type { useReviewers } from "../hooks/useReviewers.ts";

type Reviewers = ReturnType<typeof useReviewers>;

/** What's in the editor: an existing reviewer (by id), or a new one (null). */
type Draft = { id: string | null; name: string; instructions: string };

const NEW: Draft = { id: null, name: "", instructions: "" };

const PLACEHOLDER = `What should this reviewer look for, and how should it report?

For example:
Review this pull request for security problems only: injection, missing permission checks, secrets in code, unsafe handling of user input. Start from .easy-review/pr.diff. For each problem give file:line, what is wrong, and a fix.`;

/**
 * Reviewers: named instructions for Claude, one Markdown file each. Pick one
 * or several when you start a review, and each gets its own tab.
 */
export function ReviewersPage({ store, onClose }: { store: Reviewers; onClose: () => void }) {
  const { reviewers, loaded, dir } = store;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-read the files on the way in: they may have been edited elsewhere.
  const { refresh } = store;
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);

  // Open the first reviewer once they've loaded.
  useEffect(() => {
    if (draft === null && reviewers[0]) setDraft(fromReviewer(reviewers[0]));
  }, [draft, reviewers]);

  const saved = draft?.id ? reviewers.find((r) => r.id === draft.id) : undefined;
  const dirty =
    draft !== null &&
    (draft.id === null
      ? draft.name.trim() !== "" || draft.instructions.trim() !== ""
      : !saved || saved.name !== draft.name || saved.instructions !== draft.instructions);

  /** Leaving unsaved changes is a question, not an accident. */
  const leave = (next: () => void) => {
    if (dirty && !window.confirm("Discard your changes to this reviewer?")) return;
    setError(null);
    next();
  };

  // Escape goes back to the pull requests — once out of any text box.
  const leaveRef = useRef(() => leave(onClose));
  leaveRef.current = () => leave(onClose);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (e.key !== "Escape") return;
      if (typing) target.blur();
      else leaveRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const input = { name: draft.name, instructions: draft.instructions };
      const result = draft.id ? await store.update(draft.id, input) : await store.create(input);
      setDraft(fromReviewer(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || !saved) return;
    if (!window.confirm(`Delete the reviewer “${saved.name}”? Its past reviews are kept.`)) return;
    const next = reviewers.find((r) => r.id !== draft.id);
    try {
      await store.remove(draft.id);
      setDraft(next ? fromReviewer(next) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="er-reviewers">
      <div className="er-reviewers-head">
        <Group gap="xs">
          <Tooltip label="Back to pull requests (Esc)">
            <ActionIcon variant="subtle" color="gray" onClick={() => leave(onClose)} aria-label="Back">
              <IconArrowLeft size={17} />
            </ActionIcon>
          </Tooltip>
          <Title order={2}>Reviewers</Title>
        </Group>
        <Text size="xs" c="dimmed">
          Pick one or more when you start a Claude review; each runs on its own and gets its own tab.
        </Text>
      </div>

      {!loaded ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <div className="er-reviewers-body">
          <div className="er-pane er-reviewers-list">
            <ScrollArea style={{ flex: 1 }}>
              {reviewers.map((r) => (
                <NavLink
                  key={r.id}
                  active={draft?.id === r.id}
                  label={r.name}
                  leftSection={<IconUser size={15} />}
                  onClick={() => leave(() => setDraft(fromReviewer(r)))}
                />
              ))}
              {draft?.id === null && <NavLink active label={draft.name.trim() || "New reviewer"} leftSection={<IconPlus size={15} />} />}
            </ScrollArea>
            <Button
              variant="light"
              size="xs"
              m="xs"
              leftSection={<IconPlus size={14} />}
              disabled={draft?.id === null}
              onClick={() => leave(() => setDraft(NEW))}
            >
              New reviewer
            </Button>
          </div>

          <div className="er-pane er-reviewers-editor">
            {draft && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <Stack gap="sm" p="md">
                  <TextInput
                    label="Name"
                    placeholder="Security"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
                    data-autofocus
                  />
                  <Textarea
                    label="Instructions"
                    description="Given to Claude after the pull request's title. Claude can also read the full diff, the commit list and the PR description."
                    placeholder={PLACEHOLDER}
                    value={draft.instructions}
                    onChange={(e) => setDraft({ ...draft, instructions: e.currentTarget.value })}
                    autosize
                    minRows={14}
                    styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }}
                  />
                  {error && (
                    <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
                      <Text size="sm">{error}</Text>
                    </Alert>
                  )}
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">
                      {draft.id && dir ? (
                        <>
                          Saved as <Code fz={11}>{`${dir}/${draft.id}.md`}</Code>
                        </>
                      ) : (
                        dir && (
                          <>
                            Saved in <Code fz={11}>{dir}</Code>
                          </>
                        )
                      )}
                    </Text>
                    <Group gap="xs">
                      {draft.id && (
                        <Tooltip label={reviewers.length === 1 ? "Keep at least one reviewer" : "Delete this reviewer"}>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="lg"
                            disabled={reviewers.length === 1}
                            onClick={() => void remove()}
                            aria-label="Delete reviewer"
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {draft.id === null && (
                        <Button variant="subtle" color="gray" onClick={() => setDraft(reviewers[0] ? fromReviewer(reviewers[0]) : null)}>
                          Cancel
                        </Button>
                      )}
                      <Button type="submit" loading={saving} disabled={!dirty}>
                        {draft.id ? "Save" : "Create reviewer"}
                      </Button>
                    </Group>
                  </Group>
                </Stack>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fromReviewer(r: Reviewer): Draft {
  return { id: r.id, name: r.name, instructions: r.instructions };
}
