import { Alert, Button, Chip, Group, Modal, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
import { IconAlertTriangle, IconRobot } from "@tabler/icons-react";
import { useState } from "react";
import type { AiReviewSummary, Reviewer } from "../../shared/aiReview.ts";
import type { NewReviewRequest } from "../hooks/useLocalReviews.ts";
import { parseTarget } from "../newReview.ts";
import { ReviewerIcon } from "./ReviewerIcon.tsx";

type Kind = NewReviewRequest["kind"];

interface Props {
  opened: boolean;
  onClose: () => void;
  reviewers: Reviewer[];
  onStart: (request: NewReviewRequest) => Promise<AiReviewSummary[]>;
  /** The reviews it started — or those already under way, for a reviewer already on it. */
  onStarted: (jobs: AiReviewSummary[]) => void;
}

const KINDS: { value: Kind; label: string }[] = [
  { value: "pr", label: "Pull request" },
  { value: "diff", label: "Diff" },
  { value: "repo", label: "Whole repository" },
];

/**
 * A review of anything on GitHub you can see, by any of your reviewers: a pull
 * request by number, open or closed; the changes between two commits; or a
 * whole repository. Pasting a link fills in what it points at.
 */
export function NewReviewDialog({ opened, onClose, reviewers, onStart, onStarted }: Props) {
  const [repo, setRepo] = useState("");
  const [kind, setKind] = useState<Kind>("pr");
  const [number, setNumber] = useState("");
  const [base, setBase] = useState("");
  const [head, setHead] = useState("");
  /** A whole repository's commit: apart from a diff's head, so switching between them keeps each. */
  const [at, setAt] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Until you pick, the first reviewer, as everywhere else.
  const picked = chosen.filter((id) => reviewers.some((r) => r.id === id));
  const ids = picked.length > 0 ? picked : reviewers.slice(0, 1).map((r) => r.id);

  const parsed = parseTarget(repo);
  const onRepoChange = (text: string) => {
    setRepo(text);
    setError(null);
    const p = parseTarget(text);
    if (!p?.kind) return;
    // A link says what it's to: take all of it.
    setKind(p.kind);
    if (p.kind === "pr") setNumber(String(p.number));
    if (p.kind === "diff") {
      setBase(p.base);
      setHead(p.head);
    }
    if (p.kind === "repo") setAt(p.head);
  };

  const prNumber = Number(number.replace(/^#/, "").trim());
  const ready =
    parsed !== null &&
    ids.length > 0 &&
    (kind === "pr" ? Number.isInteger(prNumber) && prNumber > 0 : kind === "diff" ? base.trim() && head.trim() : true);

  const submit = async () => {
    if (!parsed || !ready) return;
    const common = { owner: parsed.owner, name: parsed.name, reviewers: ids };
    const request: NewReviewRequest =
      kind === "pr"
        ? { ...common, kind, number: prNumber, adhoc: true }
        : kind === "diff"
          ? { ...common, kind, base: base.trim(), head: head.trim() }
          : { ...common, kind, head: at.trim() };
    setBusy(true);
    setError(null);
    try {
      const started = await onStart(request);
      // Started: the next review starts from a clean form, with the same reviewers.
      setRepo("");
      setNumber("");
      setBase("");
      setHead("");
      setAt("");
      onClose();
      onStarted(started);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={close} title="New review" size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Stack gap="md">
          <TextInput
            label="Repository"
            description="owner/name, or paste a link to a repository, a pull request, a comparison or a branch"
            placeholder="metabase/metabase"
            value={repo}
            onChange={(e) => onRepoChange(e.currentTarget.value)}
            error={repo.trim() && !parsed ? "That isn't owner/name or a GitHub link." : undefined}
            data-autofocus
            spellCheck={false}
            autoComplete="off"
          />

          <SegmentedControl
            value={kind}
            onChange={(v) => {
              setKind(v as Kind);
              setError(null);
            }}
            data={KINDS}
            fullWidth
          />

          {kind === "pr" && (
            <TextInput
              label="Pull request"
              description="Open or closed"
              placeholder="12345"
              value={number}
              onChange={(e) => setNumber(e.currentTarget.value)}
              spellCheck={false}
              autoComplete="off"
            />
          )}
          {kind === "diff" && (
            <Group grow align="flex-start">
              <TextInput
                label="Base"
                description="Branch, tag or commit"
                placeholder="main"
                value={base}
                onChange={(e) => setBase(e.currentTarget.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <TextInput
                label="Head"
                description="The changes are from the base to this"
                placeholder="a1b2c3d"
                value={head}
                onChange={(e) => setHead(e.currentTarget.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </Group>
          )}
          {kind === "repo" && (
            <TextInput
              label="At"
              description="Branch, tag or commit; empty for the default branch"
              placeholder="Default branch"
              value={at}
              onChange={(e) => setAt(e.currentTarget.value)}
              spellCheck={false}
              autoComplete="off"
            />
          )}

          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Reviewers
            </Text>
            <Chip.Group multiple value={ids} onChange={setChosen}>
              <Group gap={6}>
                {reviewers.map((r) => (
                  <Chip key={r.id} value={r.id} size="sm" icon={<ReviewerIcon id={r.id} size={12} />}>
                    {r.name}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </Stack>

          {kind === "repo" && (
            <Text size="xs" c="dimmed">
              A whole repository has no diff: each reviewer is told to apply its instructions to the code as it
              stands. On a large repository, that takes a while.
            </Text>
          )}

          {error && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
              <Text size="sm">{error}</Text>
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" leftSection={<IconRobot size={16} />} disabled={!ready} loading={busy}>
              {ids.length > 1 ? `Start ${ids.length} reviews` : "Start review"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
