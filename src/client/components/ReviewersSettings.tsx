import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Code,
  ColorSwatch,
  Group,
  Loader,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { Reviewer } from "../../shared/aiReview.ts";
import { REVIEWER_COLORS, REVIEWER_ICONS, type ReviewerLook, type ReviewerLooks } from "../../shared/reviewerLook.ts";
import { moveId } from "../../shared/reviewerOrder.ts";
import type { useReviewers } from "../hooks/useReviewers.ts";
import { REVIEWER_ICON, ReviewerIcon, reviewerColor } from "./ReviewerIcon.tsx";

type Reviewers = ReturnType<typeof useReviewers>;

/** What's in the editor: an existing reviewer (by id), or a new one (null). */
type Draft = { id: string | null; name: string; instructions: string };

const NEW: Draft = { id: null, name: "", instructions: "" };

const PLACEHOLDER = `What should this reviewer look for, and how should it report?

For example:
Review this pull request for security problems only: injection, missing permission checks, secrets in code, unsafe handling of user input. Start from .easy-review/pr.diff. For each problem give file:line, what is wrong, and a fix.`;

/**
 * Reviewers: named instructions for Claude, one Markdown file each — a
 * section of Settings. Pick one from the + over a pull request, and its
 * review gets a tab of its own. Drag them (or Alt+↑/↓) into the order they
 * should have everywhere.
 */
export function ReviewersSettings({
  store,
  onDirtyChange,
  looks,
  onLookChange,
}: {
  store: Reviewers;
  /** Unsaved changes, so Settings can ask before leaving them. */
  onDirtyChange: (dirty: boolean) => void;
  /** Icons and colours: in your settings, not the files, and saved as they're picked. */
  looks: ReviewerLooks;
  onLookChange: (id: string, look: ReviewerLook) => void;
}) {
  const { reviewers, loaded, dir } = store;
  const [draft, setDraft] = useState<Draft | null>(null);
  // A new reviewer's look, given to it once it's created and has an id.
  const [newLook, setNewLook] = useState<ReviewerLook>({});
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

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  /** Leaving unsaved changes is a question, not an accident. */
  const leave = (next: () => void) => {
    if (dirty && !window.confirm(DISCARD)) return;
    setError(null);
    next();
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const input = { name: draft.name, instructions: draft.instructions };
      const result = draft.id ? await store.update(draft.id, input) : await store.create(input);
      if (!draft.id) {
        onLookChange(result.id, newLook);
        setNewLook({});
      }
      setDraft(fromReviewer(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // While dragging: the order on screen, saved when the reviewer is dropped.
  const [dragged, setDragged] = useState<string | null>(null);
  const [arranged, setArranged] = useState<string[] | null>(null);
  const byId = new Map(reviewers.map((r) => [r.id, r]));
  const shown = arranged ? arranged.flatMap((id) => byId.get(id) ?? []) : reviewers;

  const reorder = (ids: string[]) => {
    if (ids.join() === reviewers.map((r) => r.id).join()) return;
    setError(null);
    store.reorder(ids).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  const remove = async () => {
    if (!draft?.id || !saved) return;
    if (!window.confirm(`Delete the reviewer “${saved.name}”? Its past reviews are kept.`)) return;
    const next = reviewers.find((r) => r.id !== draft.id);
    try {
      await store.remove(draft.id);
      // Or a reviewer made later under the same name would wear it.
      onLookChange(draft.id, {});
      setDraft(next ? fromReviewer(next) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      {!loaded ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <div className="er-reviewers">
          <div className="er-reviewers-list">
            <ScrollArea style={{ flex: 1 }}>
              {shown.map((r, i) => (
                // biome-ignore lint/a11y/noStaticElementInteractions: the drag is a shortcut for Alt+↑/↓ on the link
                <div
                  key={r.id}
                  draggable
                  className="er-reviewer-row"
                  data-dragged={dragged === r.id || undefined}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox starts no drag without data.
                    e.dataTransfer.setData("text/plain", r.name);
                    setDragged(r.id);
                    setArranged(reviewers.map((x) => x.id));
                  }}
                  onDragOver={(e) => {
                    if (!dragged || !arranged) return;
                    e.preventDefault();
                    if (r.id !== dragged) setArranged(moveId(arranged, dragged, arranged.indexOf(r.id)));
                  }}
                  onDrop={(e) => e.preventDefault()}
                  onDragEnd={(e) => {
                    // Esc, or let go outside the list: as it was.
                    if (arranged && e.dataTransfer.dropEffect !== "none") reorder(arranged);
                    setDragged(null);
                    setArranged(null);
                  }}
                >
                  <NavLink
                    // A button, not a link without an href, so it can take focus for Alt+↑/↓.
                    component="button"
                    type="button"
                    active={draft?.id === r.id}
                    label={
                      <Group gap={8} wrap="nowrap">
                        <ReviewerIcon id={r.id} size={15} fallback="var(--mantine-color-dimmed)" />
                        {r.name}
                      </Group>
                    }
                    leftSection={<IconGripVertical size={15} className="er-grip" />}
                    title="Drag, or Alt+↑/↓, to reorder"
                    onClick={() => leave(() => setDraft(fromReviewer(r)))}
                    onKeyDown={(e) => {
                      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                      e.preventDefault();
                      const ids = reviewers.map((x) => x.id);
                      reorder(moveId(ids, r.id, i + (e.key === "ArrowUp" ? -1 : 1)));
                    }}
                  />
                </div>
              ))}
              {draft?.id === null && <NavLink active label={draft.name.trim() || "New reviewer"} leftSection={<IconPlus size={15} />} />}
            </ScrollArea>
            <Button
              variant="light"
              size="xs"
              m="xs"
              leftSection={<IconPlus size={14} />}
              disabled={draft?.id === null}
              onClick={() =>
                leave(() => {
                  setDraft(NEW);
                  setNewLook({});
                })
              }
            >
              New reviewer
            </Button>
          </div>

          <div>
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
                  <LookPicker
                    look={draft.id ? (looks[draft.id] ?? {}) : newLook}
                    onChange={(look) => (draft.id ? onLookChange(draft.id, look) : setNewLook(look))}
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
    </>
  );
}

export const DISCARD = "Discard your changes to this reviewer?";

/** One of a dozen icons, in one of a dozen colours. Picking the chosen colour again clears it. */
function LookPicker({ look, onChange }: { look: ReviewerLook; onChange: (look: ReviewerLook) => void }) {
  return (
    <Stack gap={6}>
      <div>
        <Text size="sm" fw={500}>
          Icon and colour
        </Text>
        <Text size="xs" c="dimmed">
          To tell it apart on its tabs and in the menus. Kept in this app's settings, not the file.
        </Text>
      </div>
      <Group gap={2}>
        {REVIEWER_ICONS.map((name) => {
          const Glyph = REVIEWER_ICON[name];
          const chosen = (look.icon ?? "robot") === name;
          return (
            <ActionIcon
              key={name}
              variant={chosen ? "light" : "subtle"}
              color={chosen ? (look.color ?? "gray") : "gray"}
              size="lg"
              title={name}
              aria-label={`Icon: ${name}`}
              aria-pressed={chosen}
              // The robot is what a reviewer has without a choice.
              onClick={() => onChange({ ...look, icon: name === "robot" ? undefined : name })}
            >
              <Glyph size={18} />
            </ActionIcon>
          );
        })}
      </Group>
      <Group gap={8}>
        {REVIEWER_COLORS.map((color) => {
          const chosen = look.color === color;
          return (
            <ColorSwatch
              key={color}
              component="button"
              type="button"
              color={reviewerColor(color)}
              size={22}
              title={color}
              aria-label={`Colour: ${color}`}
              aria-pressed={chosen}
              onClick={() => onChange({ ...look, color: chosen ? undefined : color })}
              style={{ cursor: "pointer" }}
            >
              {chosen && <IconCheck size={13} color="white" />}
            </ColorSwatch>
          );
        })}
      </Group>
    </Stack>
  );
}

function fromReviewer(r: Reviewer): Draft {
  return { id: r.id, name: r.name, instructions: r.instructions };
}
