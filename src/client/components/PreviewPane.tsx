import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Center,
  Group,
  Kbd,
  Loader,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconFileDiff,
  IconFileText,
  IconRobot,
} from "@tabler/icons-react";
import { useCallback, useDeferredValue, useMemo, type RefObject } from "react";
import { isActive, prKey, type AiReviewSummary } from "../../shared/aiReview.ts";
import { rateDifficulty } from "../../shared/difficulty.ts";
import type { PullRequest, ReviewEvent, Settings } from "../../shared/types.ts";
import { useDiff } from "../hooks/diffStore.ts";
import { useConversation } from "../hooks/useConversation.ts";
import { useDrafts } from "../drafts.ts";
import { isReviewed, PR_STATE, VERDICT } from "../reviewMeta.ts";
import { relativeTime } from "../time.ts";
import { AiReviewButton } from "./AiReviewButton.tsx";
import { AiReviewPanel } from "./AiReviewPanel.tsx";
import { CiBadge } from "./CiBadge.tsx";
import type { DiffThreadItem } from "./DiffThread.tsx";
import { DiffView } from "./DiffView.tsx";
import { DifficultyBadge } from "./DifficultyBadge.tsx";
import { PrDescription } from "./PrDescription.tsx";
import { ReviewActions } from "./ReviewActions.tsx";

interface Props {
  pr: PullRequest | null;
  settings: Settings;
  /** Set once this pull request has been reviewed in this session. */
  reviewed: ReviewEvent | undefined;
  onSubmit: (pr: PullRequest, event: ReviewEvent, body?: string) => Promise<void>;
  changesOpen: boolean;
  onChangesOpenChange: (open: boolean) => void;
  approveOpen: boolean;
  onApproveOpenChange: (open: boolean) => void;
  /** This pane has the keyboard (a / d move it). */
  focused: boolean;
  onFocusPane: () => void;
  /** Focus mode: the list is hidden and this pane takes the full width. */
  expanded: boolean;
  onToggleExpand: () => void;
  /** On narrow screens the pane is a detail view with a back button. */
  narrow: boolean;
  /** The scrolling element, so the keyboard can page through the diff. */
  scrollRef: RefObject<HTMLDivElement | null>;
  ai: AiControls;
  tab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
  /** Absent where hiding doesn't apply (the Reviewed tab). */
  hideState?: { hidden: boolean; toggle: () => void };
  /** Your login, so your own comments sit on the right. */
  viewer: string | null;
}

/** Description comes first, as it does on GitHub. */
export type PreviewTab = "description" | "diff" | "claude";

/** Stable empty list, so the diff's memoised file blocks stay memoised. */
const NO_THREADS: DiffThreadItem[] = [];

/** Local Claude reviews; `available` is false when the claude CLI isn't installed. */
export interface AiControls {
  available: boolean;
  byPr: Map<string, AiReviewSummary>;
  start: (pr: PullRequest) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
}

export function PreviewPane(props: Props) {
  const { pr } = props;

  // The header follows the selection immediately; the diff underneath is
  // rendered from a deferred copy. Holding `j` therefore moves the list and
  // header at full speed while React renders only the diff you stop on.
  const deferred = useDeferredValue(pr);

  const { scrollRef, focused, onFocusPane } = props;
  // The scroller is re-created for every PR and tab. If this pane has the
  // keyboard, hand focus to the new one so the scrolling keys keep working.
  const setScrollEl = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      const active = document.activeElement;
      if (el && focused && (!active || active === document.body)) el.focus({ preventScroll: true });
    },
    [scrollRef, focused],
  );
  const pending = useDrafts(pr?.id).length;

  if (!pr) {
    return (
      <div className="er-pane" data-focused={focused} onFocus={onFocusPane}>
        <Center h="100%" p="xl">
          <Stack align="center" gap="xs">
            <IconFileDiff size={36} color="var(--mantine-color-gray-5)" />
            <Text fw={600}>Nothing selected</Text>
            <Text size="sm" c="dimmed" ta="center">
              Pick a pull request on the left, or press <Kbd size="xs">j</Kbd> /{" "}
              <Kbd size="xs">k</Kbd>.
            </Text>
          </Stack>
        </Center>
      </div>
    );
  }

  const stale = deferred !== null && deferred.id !== pr.id;
  const { ai } = props;
  const tab: PreviewTab = props.tab === "claude" && !ai.available ? "diff" : props.tab;
  const job = ai.available ? ai.byPr.get(prKey(pr)) : undefined;

  return (
    <div className="er-pane" data-focused={focused} onFocus={onFocusPane}>
      <Header {...props} pr={pr} job={job} />
      <Tabs
        value={tab}
        onChange={(v) => props.onTabChange((v as PreviewTab) ?? "description")}
        className="er-pane-tabs"
      >
        <Tabs.List>
          <Tabs.Tab value="description" leftSection={<IconFileText size={14} />}>
            Description
          </Tabs.Tab>
          <Tabs.Tab
            value="diff"
            leftSection={<IconFileDiff size={14} />}
            rightSection={
              pending > 0 ? (
                <Tooltip label={`${pending} pending comment${pending === 1 ? "" : "s"}, posted with your review`}>
                  <Badge size="xs" variant="light" color="yellow" circle>
                    {pending}
                  </Badge>
                </Tooltip>
              ) : undefined
            }
          >
            Diff
          </Tabs.Tab>
          {ai.available && (
            <Tabs.Tab value="claude" leftSection={<ClaudeTabIcon job={job} />}>
              Claude review
            </Tabs.Tab>
          )}
        </Tabs.List>
      </Tabs>
      {deferred && (
        <div
          // Keyed so every pull request (and tab) starts at the top, with its
          // own fresh expand/collapse state.
          key={`${deferred.id}:${tab}`}
          className="er-pane-scroll"
          ref={setScrollEl}
          tabIndex={-1}
          data-stale={stale}
        >
          <Box p="sm">
            {tab === "claude" ? (
              <AiReviewPanel
                pr={deferred}
                job={ai.byPr.get(prKey(deferred))}
                onStart={() => ai.start(deferred)}
                onCancel={ai.cancel}
                onRemove={ai.remove}
              />
            ) : tab === "description" ? (
              <PrDescription pr={deferred} viewer={props.viewer} />
            ) : (
              <Body pr={deferred} />
            )}
          </Box>
        </div>
      )}
    </div>
  );
}

function ClaudeTabIcon({ job }: { job: AiReviewSummary | undefined }) {
  if (job && isActive(job.status)) return <Loader size={12} color="indigo" />;
  const color =
    job?.status === "done"
      ? "var(--mantine-color-teal-6)"
      : job?.status === "failed"
        ? "var(--mantine-color-red-6)"
        : undefined; // currentColor
  return <IconRobot size={14} color={color} />;
}

function Header({
  pr,
  settings,
  reviewed,
  onSubmit,
  changesOpen,
  onChangesOpenChange,
  approveOpen,
  onApproveOpenChange,
  expanded,
  onToggleExpand,
  narrow,
  ai,
  onTabChange,
  hideState,
  job,
}: Props & { pr: PullRequest; job: AiReviewSummary | undefined }) {
  const history = isReviewed(pr) ? pr : null;
  const verdict = history ? VERDICT[history.verdict] : null;
  const state = history ? PR_STATE[history.state] : null;
  const StateIcon = state?.Icon;
  // Re-reviewing makes sense while the pull request is still open.
  const canReview = !history || history.state === "OPEN";

  return (
    <div className="er-pane-head">
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Group gap={8} wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
          {narrow && (
            <Tooltip label="Back to the list (Esc)">
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={onToggleExpand}
                mt={1}
                aria-label="Back to the list"
              >
                <IconArrowLeft size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Box w={78} style={{ flex: "none" }} mt={2}>
            {verdict ? (
              <Badge
                color={verdict.color}
                variant="light"
                fullWidth
                style={{ textTransform: "none" }}
              >
                {verdict.label}
              </Badge>
            ) : (
              <DifficultyBadge rating={rateDifficulty(pr, settings)} />
            )}
          </Box>
          <Text fw={650} size="md" lh={1.3} lineClamp={2} style={{ minWidth: 0 }}>
            {pr.title}
          </Text>
        </Group>

        <Group gap={6} wrap="nowrap" style={{ flex: "none" }}>
          {canReview && (
            <ReviewActions
              // Keyed so a half-written comment never follows you to the next PR.
              key={pr.id}
              pr={pr}
              onSubmit={onSubmit}
              reviewed={reviewed}
              changesOpen={changesOpen}
              onChangesOpenChange={onChangesOpenChange}
              approveOpen={approveOpen}
              onApproveOpenChange={onApproveOpenChange}
            />
          )}
          {ai.available && (
            <AiReviewButton
              job={job}
              headSha={pr.headSha}
              label={`${pr.repo}#${pr.number}`}
              onStart={() => {
                onTabChange("claude");
                ai.start(pr);
              }}
              onOpen={() => onTabChange("claude")}
            />
          )}
          <Tooltip label={history ? "Open your review on GitHub" : "Open on GitHub (g)"}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              component="a"
              href={history?.reviewUrl ?? pr.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open on GitHub"
            >
              <IconExternalLink size={15} />
            </ActionIcon>
          </Tooltip>
          {hideState && (
            <Tooltip label={hideState.hidden ? "Unhide (⇧H)" : "Hide (⇧H)"}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="md"
                onClick={hideState.toggle}
                aria-label={hideState.hidden ? "Unhide this pull request" : "Hide this pull request"}
              >
                {hideState.hidden ? <IconEye size={15} /> : <IconEyeOff size={15} />}
              </ActionIcon>
            </Tooltip>
          )}
          {!narrow && (
            <Tooltip label={expanded ? "Show the list (Esc)" : "Focus on the code (o)"}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="md"
                onClick={onToggleExpand}
                aria-label={expanded ? "Show the list" : "Focus on the code"}
              >
                {expanded ? <IconArrowsMinimize size={15} /> : <IconArrowsMaximize size={15} />}
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>

      <Group
        gap={10}
        wrap="wrap"
        mt={6}
        pl={narrow ? 36 : 0}
        style={{ rowGap: 4 }}
      >
        <Anchor href={pr.url} target="_blank" size="xs" c="dimmed">
          <Group gap={4} wrap="nowrap">
            {pr.repo}#{pr.number}
            <IconExternalLink size={11} />
          </Group>
        </Anchor>
        <Text size="xs" c="dimmed">
          by {pr.author}
        </Text>
        {history && verdict && state && StateIcon ? (
          <>
            <Text size="xs" c="dimmed">
              {verdict.full.replace(/^You /, "you ")} {relativeTime(history.reviewedAt)}
            </Text>
            <Group gap={4} wrap="nowrap">
              <StateIcon size={13} color={`var(--mantine-color-${state.color}-6)`} />
              <Text size="xs" c="dimmed">
                {state.label}
              </Text>
            </Group>
          </>
        ) : (
          <Text size="xs" c="dimmed">
            into {pr.baseRef}
          </Text>
        )}
        <Badge size="xs" variant="default">
          {pr.changedFiles} file{pr.changedFiles === 1 ? "" : "s"}
        </Badge>
        <Text size="xs" ff="monospace" c="teal.6" fw={600}>
          +{pr.additions}
        </Text>
        <Text size="xs" ff="monospace" c="red.6" fw={600}>
          −{pr.deletions}
        </Text>
        {/* History is fetched without CI rollups (they time the query out). */}
        {!history && <CiBadge pr={pr} />}
      </Group>
    </div>
  );
}

function Body({ pr }: { pr: PullRequest }) {
  const entry = useDiff(pr);
  const drafts = useDrafts(pr.id);
  // Nothing to submit comments with on a pull request that's merged or closed.
  const canComment = !isReviewed(pr) || pr.state === "OPEN";
  // The Description tab fetches these anyway, and sharing them means an inline
  // comment you just left shows up against its own line.
  const { entry: conversation } = useConversation(pr);
  const threads = useMemo(
    () =>
      conversation?.status === "ready"
        ? conversation.data.items.filter((item): item is DiffThreadItem => item.kind === "thread")
        : NO_THREADS,
    [conversation],
  );

  if (!entry || entry.status === "loading") {
    return (
      <Center h={260}>
        <Stack align="center" gap="xs">
          <Loader size="sm" />
          <Text size="xs" c="dimmed">
            Fetching diff…
          </Text>
        </Stack>
      </Center>
    );
  }

  if (entry.status === "error") {
    return (
      <Center h={260}>
        <Stack align="center" gap="xs" maw={460}>
          <Text size="sm" c="dimmed" ta="center">
            {entry.message}
          </Text>
          <Anchor href={pr.url} target="_blank" size="sm">
            <Group gap={4}>
              Open {pr.repo}#{pr.number} on GitHub
              <IconExternalLink size={13} />
            </Group>
          </Anchor>
        </Stack>
      </Center>
    );
  }

  return (
    <DiffView
      diff={entry.data.diff}
      expandBudget={1200}
      pr={canComment ? pr : null}
      threads={threads}
      drafts={drafts}
    />
  );
}
