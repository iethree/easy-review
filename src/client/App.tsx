import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Progress,
  Tabs,
  Text,
  Title,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconGitPullRequest,
  IconEyeOff,
  IconHistory,
  IconInbox,
  IconClipboardText,
  IconKeyboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconRefresh,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rateDifficulty, reviewCost, type Difficulty } from "../shared/difficulty.ts";
import { prKey, type AiReviewSummary } from "../shared/aiReview.ts";
import { leadingEmoji } from "../shared/approval.ts";
import { matchesQuery, parseQuery, readLevel, setLevel, upsertToken } from "../shared/filter.ts";
import type { PullRequest, ReviewEvent, ReviewVerdict, Settings } from "../shared/types.ts";
import { EVENT_LABEL, submitReview } from "./api.ts";
import { notifyDesktop, useDesktopCommands, useNotificationClicks } from "./desktop.ts";
import { getDrafts, removeDrafts, reviewCommit } from "./drafts.ts";
import { ListFilter, type SortKey } from "./components/ListFilter.tsx";
import { PreviewPane, type AiControls, type PreviewTab } from "./components/PreviewPane.tsx";
import { QueueList } from "./components/QueueList.tsx";
import { ReviewPane } from "./components/ReviewPane.tsx";
import { ReviewedList } from "./components/ReviewedList.tsx";
import { SettingsPage, type SettingsSection } from "./components/SettingsPage.tsx";
import { ShortcutsModal } from "./components/ShortcutsModal.tsx";
import { SplitView, type SplitMode } from "./components/SplitView.tsx";
import { requestNow, useReadyCount } from "./hooks/diffStore.ts";
import { useLocalReviews } from "./hooks/useLocalReviews.ts";
import { useReviewed } from "./hooks/useReviewed.ts";
import { useMine } from "./hooks/useMine.ts";
import { useReviewers } from "./hooks/useReviewers.ts";
import { useReviews } from "./hooks/useReviews.ts";
import { useSettings } from "./hooks/useSettings.ts";
import { useHidden } from "./hooks/useHidden.ts";
import { invalidateConversation } from "./hooks/useConversation.ts";
import { isHidden, neighbourAfterRemoving, splitHidden } from "./hidden.ts";
import { actionForKey, type Pane } from "./keymap.ts";
import { resolveTab, reviewTab, tabOrder } from "./previewTabs.ts";
import { isReviewed } from "./reviewMeta.ts";
import { DIFFICULTY_COLOR } from "./theme.ts";

type Tab = "queue" | "reviewed" | "hidden" | "mine";
type VerdictFilter = ReviewVerdict | "all";

/** The queue's filter and sort, for any list of open pull requests. */
function filterAndSort(
  prs: PullRequest[],
  parsed: ReturnType<typeof parseQuery>,
  sort: SortKey,
  settings: Settings,
  reviewed: Record<string, ReviewEvent>,
): PullRequest[] {
  const filtered = prs.filter((pr) =>
    matchesQuery(
      {
        title: pr.title,
        repo: pr.repo,
        author: pr.author,
        number: pr.number,
        isDraft: pr.isDraft,
        ciFailed: pr.ci.failed,
        level: rateDifficulty(pr, settings).level,
        reviewedByMe: reviewed[pr.id] === "APPROVE",
      },
      parsed,
    ),
  );
  const sorted = [...filtered];
  if (sort === "quickest") sorted.sort((a, b) => reviewCost(a) - reviewCost(b));
  else if (sort === "newest") sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  else sorted.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return sorted;
}

export function App() {
  const [tab, setTab] = useState<Tab>("queue");
  const { settings, update, reset } = useSettings();
  const { data, loading, error, refresh } = useReviews(settings);
  // The history hook only fetches once its tab has been opened.
  const history = useReviewed(tab === "reviewed");
  const mine = useMine(tab === "mine");
  const { toggleColorScheme } = useMantineColorScheme();
  const readyCount = useReadyCount();
  const narrow = useMediaQuery("(max-width: 900px)");
  const { hidden, setHiddenFor } = useHidden();

  const [query, setQuery] = useState("");
  const [mineQuery, setMineQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("quickest");
  const [historyQuery, setHistoryQuery] = useState("");
  const [verdict, setVerdict] = useState<VerdictFilter>("all");

  // Selection is tracked by id, per tab, so filtering or re-sorting never
  // swaps out the pull request you are reading.
  const [queueSelected, setQueueSelected] = useState<string | null>(null);
  const [historySelected, setHistorySelected] = useState<string | null>(null);
  const [hiddenSelected, setHiddenSelected] = useState<string | null>(null);
  const [mineSelected, setMineSelected] = useState<string | null>(null);

  /** Focus mode: the list is hidden and the preview takes the full width. */
  const [expanded, setExpanded] = useState(false);
  // Description first, as on GitHub; whichever tab you pick sticks as you move.
  const [previewTab, setPreviewTab] = useState<PreviewTab>("description");
  // Which pull request each box is open for. "Open" is derived from the
  // selection below, so moving to another PR closes them.
  const [changesFor, setChangesFor] = useState<string | null>(null);
  const [approveFor, setApproveFor] = useState<string | null>(null);
  /** Which pane has the keyboard: `a` and `d` move it. */
  const [focusedPane, setFocusedPane] = useState<Pane>("list");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** Settings, as a page in place of the lists; and which of its sections. */
  const [page, setPage] = useState<"settings" | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("queue");
  const openSettings = useCallback((section?: SettingsSection) => {
    if (section) setSettingsSection(section);
    setPage("settings");
  }, []);
  /** The third pane: the review you're putting together. */
  const [reviewPaneOpen, setReviewPaneOpen] = useState(false);
  /** The pull request whose reviewers are being chosen. */
  const [pickFor, setPickFor] = useState<PullRequest | null>(null);
  const [reviewed, setReviewed] = useState<Record<string, ReviewEvent>>({});

  const searchRef = useRef<HTMLInputElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  // Read inside handleSubmit without making it unstable (rows are memoised).
  const historyRef = useRef(history);
  historyRef.current = history;

  /* ---------------------------------------------------------------------- */
  /* Lists                                                                  */
  /* ---------------------------------------------------------------------- */

  const allPrs = useMemo(() => data?.pullRequests ?? [], [data]);
  // The queue is everything GitHub says needs you, minus what you've hidden.
  const { shown: prs, hidden: hiddenPrs } = useMemo(
    () => splitHidden(allPrs, hidden),
    [allPrs, hidden],
  );
  const parsed = useMemo(() => parseQuery(query), [query]);

  const visible = useMemo(
    () => filterAndSort(prs, parsed, sort, settings, reviewed),
    [prs, parsed, sort, settings, reviewed],
  );
  const visibleMine = useMemo(
    () => filterAndSort(mine.pullRequests, parseQuery(mineQuery), sort, settings, reviewed),
    [mine.pullRequests, mineQuery, sort, settings, reviewed],
  );
  const mineCounts = useMemo(() => {
    const tally: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const pr of mine.pullRequests) tally[rateDifficulty(pr, settings).level]++;
    return tally;
  }, [mine.pullRequests, settings]);


  const counts = useMemo(() => {
    const tally: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const pr of prs) tally[rateDifficulty(pr, settings).level]++;
    return tally;
  }, [prs, settings]);

  const visibleHistory = useMemo(() => {
    const parsedHistory = parseQuery(historyQuery);
    return history.pullRequests.filter((pr) => {
      if (verdict !== "all" && pr.verdict !== verdict) return false;
      return matchesQuery(
        {
          title: pr.title,
          repo: pr.repo,
          author: pr.author,
          number: pr.number,
          isDraft: pr.isDraft,
          ciFailed: pr.ci.failed,
          level: rateDifficulty(pr, settings).level,
          reviewedByMe: true,
        },
        parsedHistory,
      );
    });
  }, [history.pullRequests, historyQuery, verdict, settings]);

  const verdictCounts = useMemo(() => {
    const tally = new Map<ReviewVerdict, number>();
    for (const pr of history.pullRequests) tally.set(pr.verdict, (tally.get(pr.verdict) ?? 0) + 1);
    return tally;
  }, [history.pullRequests]);

  /* ---------------------------------------------------------------------- */
  /* Selection                                                              */
  /* ---------------------------------------------------------------------- */

  const list: PullRequest[] =
    tab === "queue" ? visible : tab === "hidden" ? hiddenPrs : tab === "mine" ? visibleMine : visibleHistory;
  const selectedId = {
    queue: queueSelected,
    reviewed: historySelected,
    hidden: hiddenSelected,
    mine: mineSelected,
  }[tab];
  const setSelectedId = {
    queue: setQueueSelected,
    reviewed: setHistorySelected,
    hidden: setHiddenSelected,
    mine: setMineSelected,
  }[tab];

  // Who you are: either list says. Your own pull requests can't be approved.
  const viewer = data?.viewer ?? mine.data?.viewer ?? null;
  const isOwn = useCallback(
    (pr: PullRequest) => viewer !== null && pr.author.toLowerCase() === viewer.toLowerCase(),
    [viewer],
  );

  // Fall back to the top of the list when nothing is selected yet, or when the
  // selection has been filtered out — clearing the filter brings it back.
  const foundIndex = list.findIndex((pr) => pr.id === selectedId);
  const index = foundIndex >= 0 ? foundIndex : list.length > 0 ? 0 : -1;
  const selected = index >= 0 ? (list[index] ?? null) : null;
  const selectedKey = selected?.id ?? null;

  // A pull request that has been merged or closed can't be reviewed again.
  const canReviewSelected = selected !== null && (!isReviewed(selected) || selected.state === "OPEN");

  const changesOpen = changesFor !== null && changesFor === selectedKey;
  const approveOpen = approveFor !== null && approveFor === selectedKey;
  const setChangesOpen = useCallback(
    (open: boolean) => setChangesFor(open ? selectedKey : null),
    [selectedKey],
  );
  const setApproveOpen = useCallback(
    (open: boolean) => setApproveFor(open ? selectedKey : null),
    [selectedKey],
  );

  const select = useCallback(
    (pr: PullRequest) => {
      setSelectedId(pr.id);
      // On a narrow screen the list and preview can't share the width.
      if (narrow) setExpanded(true);
    },
    [setSelectedId, narrow],
  );

  /** Step one of approving: select the PR and open its confirmation. */
  const askApprove = useCallback(
    (pr: PullRequest) => {
      setSelectedId(pr.id);
      setChangesFor(null);
      setApproveFor(pr.id);
      if (narrow) setExpanded(true);
    },
    [setSelectedId, narrow],
  );

  /**
   * Hide a pull request from the queue, or bring it back from Hidden. The
   * selection moves to its neighbour first, so you keep your place — and the
   * notification can put everything back.
   */
  const toggleHidden = useCallback(
    (pr: PullRequest) => {
      const willHide = !isHidden(hidden, pr);
      const reselect = setSelectedId;
      if (pr.id === selectedKey) reselect(neighbourAfterRemoving(list, pr.id));
      setHiddenFor(pr, willHide);

      const id = `hide:${pr.id}`;
      notifications.show({
        id,
        color: "gray",
        title: `${willHide ? "Hidden" : "Back in Review"} · ${pr.repo}#${pr.number}`,
        message: (
          <Text
            size="xs"
            c="dimmed"
            td="underline"
            style={{ cursor: "pointer" }}
            onClick={() => {
              setHiddenFor(pr, !willHide);
              reselect(pr.id);
              notifications.hide(id);
            }}
          >
            Undo
          </Text>
        ),
        autoClose: 5000,
      });
    },
    [hidden, list, selectedKey, setSelectedId, setHiddenFor],
  );

  /* ---------------------------------------------------------------------- */
  /* Local Claude reviews                                                    */
  /* ---------------------------------------------------------------------- */

  // Read from the notification's Open button, which outlives this render.
  /** Shows a review's pull request on its Claude tab; false if that PR isn't loaded. */
  const openRef = useRef<(job: AiReviewSummary) => boolean>(() => false);

  const ai = useLocalReviews((job) => {
    const ok = job.status === "done";
    const title = ok
      ? `${job.reviewerName} finished reviewing #${job.number}`
      : `${job.reviewerName}'s review of #${job.number} ${job.status === "failed" ? "failed" : "stopped"}`;
    // In the background, macOS says so too. Not for a review you cancelled.
    if (job.status !== "cancelled") notifyDesktop({ id: job.id, title, body: job.title });
    notifications.show({
      color: ok ? "teal" : job.status === "failed" ? "red" : "gray",
      title,
      message: (
        <Text
          size="xs"
          c="dimmed"
          td="underline"
          style={{ cursor: "pointer" }}
          onClick={() => openRef.current(job)}
        >
          {job.title} — open
        </Text>
      ),
      autoClose: ok ? 8000 : 10000,
    });
  });

  const openAiReview = useCallback(
    (pr: PullRequest, reviewerId: string) => {
      select(pr);
      setPreviewTab(reviewTab(reviewerId));
    },
    [select],
  );

  // Clicking a macOS notification opens the review it was about — once the
  // reviews have loaded, if the click is what reopened the window.
  const [openOnLoad, setOpenOnLoad] = useState<string | null>(null);
  useNotificationClicks(setOpenOnLoad);
  // Tried again as each list arrives: the review can land before its PR.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the lists are what openRef searches
  useEffect(() => {
    const job = openOnLoad ? ai.jobs.find((j) => j.id === openOnLoad) : undefined;
    if (job && openRef.current(job)) setOpenOnLoad(null);
  }, [openOnLoad, ai.jobs, data, mine.data, history.pullRequests]);

  const reviewers = useReviewers(ai.supported);
  const reviewerIds = useMemo(() => new Set(reviewers.reviewers.map((r) => r.id)), [reviewers.reviewers]);

  const runAiReview = useCallback(
    (pr: PullRequest, reviewerId: string) => {
      setPickFor(null);
      openAiReview(pr, reviewerId);
      ai.start(pr, [reviewerId]).catch((err: unknown) =>
        notifications.show({
          color: "red",
          title: "Couldn't start the review",
          message: err instanceof Error ? err.message : String(err),
          autoClose: 8000,
        }),
      );
    },
    [openAiReview, ai.start],
  );

  /** With no reviewer named: open the + over the pull request, to choose one. */
  const startAiReview = useCallback(
    (pr: PullRequest, reviewerId?: string) => {
      if (reviewerId !== undefined) {
        runAiReview(pr, reviewerId);
        return;
      }
      select(pr);
      setPickFor(pr);
      // The files may have been edited elsewhere since they were read.
      void reviewers.refresh().catch(() => {});
    },
    [runAiReview, select, reviewers.refresh],
  );

  openRef.current = (job) => {
    const key = prKey(job);
    const inQueue = prs.find((pr) => prKey(pr) === key);
    const inHidden = hiddenPrs.find((pr) => prKey(pr) === key);
    const inHistory = history.pullRequests.find((pr) => prKey(pr) === key);
    const inMine = mine.pullRequests.find((pr) => prKey(pr) === key);
    const target = inQueue ?? inHidden ?? inMine ?? inHistory;
    if (!target) return false;
    const where: Tab = inQueue ? "queue" : inHidden ? "hidden" : inMine ? "mine" : "reviewed";
    setTab(where);
    ({
      queue: setQueueSelected,
      reviewed: setHistorySelected,
      hidden: setHiddenSelected,
      mine: setMineSelected,
    })[where](
      target.id,
    );
    setPreviewTab(reviewTab(job.reviewerId));
    setExpanded(narrow);
    return true;
  };

  const aiControls = useMemo<AiControls>(
    () => ({
      available: ai.available,
      reviewsByPr: ai.reviewsByPr,
      reviewerIds,
      start: startAiReview,
      cancel: (id) => void ai.cancel(id).catch(() => {}),
      remove: (id) => void ai.remove(id).catch(() => {}),
      findingAdded: () => setReviewPaneOpen(true),
      pickingFor: pickFor?.id ?? null,
      reviewers: reviewers.reviewers,
      cancelPick: () => setPickFor(null),
      manageReviewers: () => {
        setPickFor(null);
        openSettings("reviewers");
      },
    }),
    [ai.available, ai.reviewsByPr, reviewerIds, startAiReview, ai.cancel, ai.remove, pickFor, reviewers.reviewers, openSettings],
  );

  const queueAi = useMemo(
    () => (ai.available ? { byPr: ai.byPr, reviewsByPr: ai.reviewsByPr } : undefined),
    [ai.available, ai.byPr, ai.reviewsByPr],
  );

  // Make sure the selected diff, and the ones either side of it, are loading
  // first — `j`/`k` should land on something that is already there.
  // Keyed on ids rather than the objects: the list array is rebuilt on every
  // filter keystroke, and that alone shouldn't re-prioritise the fetch queue.
  const neighbours = `${list[index - 1]?.id ?? ""}|${list[index + 1]?.id ?? ""}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on ids on purpose, as above
  useEffect(() => {
    if (!selected) return;
    for (const pr of [list[index + 1], list[index - 1]]) if (pr) requestNow(pr);
    // Last, so it lands at the front of the queue.
    requestNow(selected);
  }, [selectedKey, neighbours]);

  // Moving to another pull request closes its boxes for good, rather than
  // leaving them to reappear when you come back to it.
  useEffect(() => {
    setChangesFor((id) => (id === selectedKey ? id : null));
    setApproveFor((id) => (id === selectedKey ? id : null));
    setPickFor((pr) => (pr?.id === selectedKey ? pr : null));
  }, [selectedKey]);

  // Keep DOM focus in the focused pane, so the browser's own scrolling keys
  // (Space, Page Up/Down, Home/End) work there. Only steps in when focus has
  // been lost or sits in the other pane — it never pulls focus out of a box.
  // The extra dependencies are the layout changes that can strand focus.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on layout changes, not just on reads
  useEffect(() => {
    const el = focusedPane === "list" ? listScrollRef.current : previewScrollRef.current;
    const other = focusedPane === "list" ? previewScrollRef.current : listScrollRef.current;
    const active = document.activeElement;
    const lost = !active || active === document.body;
    if (el && (lost || (other?.contains(active) ?? false))) el.focus({ preventScroll: true });
  }, [focusedPane, expanded, narrow, approveOpen, changesOpen, page, shortcutsOpen]);

  // Keep the selected row visible when moving by keyboard — and after the
  // list is swapped (tab) or shown again (expanded).
  // biome-ignore lint/correctness/useExhaustiveDependencies: tab and expanded re-show the list
  useEffect(() => {
    if (!selectedKey) return;
    document
      .querySelector<HTMLElement>(`[data-row-id="${CSS.escape(selectedKey)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedKey, tab, expanded]);

  const filterByAuthor = useCallback(
    (login: string) => {
      const apply = (q: string) => upsertToken(q, "author", login.toLowerCase());
      if (tab === "reviewed") setHistoryQuery(apply);
      else if (tab === "mine") setMineQuery(apply);
      else {
        setQuery(apply);
        // Hidden has no filter bar; show that author's pull requests in the queue.
        if (tab === "hidden") setTab("queue");
      }
    },
    [tab],
  );

  /** Refresh whatever list is showing. Hidden pull requests come from the queue. */
  const refreshTab = useCallback(() => {
    if (tab === "reviewed") history.refresh();
    else if (tab === "mine") void mine.refresh();
    else void refresh();
  }, [tab, history.refresh, mine.refresh, refresh]);

  /* ---------------------------------------------------------------------- */
  /* Review submission — shared by the buttons and the keyboard shortcuts    */
  /* ---------------------------------------------------------------------- */

  const handleSubmit = useCallback(async (pr: PullRequest, event: ReviewEvent, body?: string) => {
    // Your comments on the code go up inside this review, all together.
    const drafts = getDrafts(pr.id);
    try {
      const { commitId, error } = reviewCommit(drafts);
      if (error) throw new Error(error);
      const result = await submitReview({
        owner: pr.owner,
        name: pr.name,
        number: pr.number,
        event,
        body,
        ...(commitId && drafts.length > 0
          ? {
              commitId,
              comments: drafts.map((d) => ({
                path: d.path,
                line: d.line,
                ...(d.startLine !== undefined ? { startLine: d.startLine } : {}),
                side: d.side,
                body: d.body,
              })),
            }
          : {}),
      });
      // Only the ones that went up: a comment added while this was posting stays a draft.
      if (drafts.length > 0) removeDrafts(pr.id, drafts.map((d) => d.id));
      setReviewed((prev) => ({ ...prev, [pr.id]: event }));
      // Your review is now part of the conversation; fetch it fresh.
      invalidateConversation(pr.id);
      // If the history tab has been opened, it now has a new first entry.
      if (historyRef.current.pullRequests.length > 0) historyRef.current.refresh();
      notifications.show({
        color: event === "APPROVE" ? "teal" : "orange",
        title: `${event === "APPROVE" ? `${leadingEmoji(body)} ` : ""}${EVENT_LABEL[event]} · ${pr.repo}#${pr.number}${
          drafts.length > 0 ? ` · ${drafts.length} comment${drafts.length === 1 ? "" : "s"}` : ""
        }`,
        message: (
          <Text
            component="a"
            href={result.url || pr.url}
            target="_blank"
            size="xs"
            c="dimmed"
            td="underline"
          >
            View on GitHub
          </Text>
        ),
        autoClose: 4000,
      });
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Review failed",
        message: err instanceof Error ? err.message : "Unknown error",
        autoClose: 7000,
      });
      throw err;
    }
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Keyboard                                                               */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    function move(delta: number) {
      if (list.length === 0) return;
      // Derive from the previous selection, not from `index` in this closure:
      // key repeats can arrive before React re-subscribes this handler, and
      // every one of them would then read the same stale index and the list
      // would move one row instead of twelve.
      setSelectedId((prevId) => {
        const found = list.findIndex((pr) => pr.id === prevId);
        const from = Math.max(found, 0);
        const next = list[Math.min(Math.max(from + delta, 0), list.length - 1)];
        return next?.id ?? prevId;
      });
    }

    function onKeyDown(e: KeyboardEvent) {
      // The pages have keys of their own.
      if (page) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;
      // Enter on a focused button or link should press it, not approve.
      const onControl = target?.closest("button, a[href]") != null;

      if (e.key === "Escape") {
        if (typing) {
          target?.blur();
          return;
        }
        if (shortcutsOpen) {
          setShortcutsOpen(false);
          return;
        }
        if (changesOpen || approveOpen) {
          setChangesFor(null);
          setApproveFor(null);
          return;
        }
        if (expanded) setExpanded(false);
        return;
      }

      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      // While a box or dialog is up, let it own the keyboard.
      if (shortcutsOpen || changesOpen || approveOpen) return;

      const action = actionForKey(e.key, e.repeat);
      if (!action || (action.type === "approve" && onControl)) return;
      e.preventDefault();

      switch (action.type) {
        case "move":
          move(action.delta);
          return;
        case "focusPane":
          // The list is hidden in focus mode and in a narrow screen's detail
          // view, so focusing it means showing it — and the reverse.
          if (action.pane === "list") setExpanded(false);
          else if (narrow) setExpanded(true);
          setFocusedPane(action.pane);
          return;
        case "scrollPreview":
          previewScrollRef.current?.scrollBy({ top: action.direction * 80 });
          return;
        case "cycleTab": {
          const reviews = (ai.available && selected && ai.reviewsByPr.get(prKey(selected))) || [];
          const tabs = tabOrder(reviews);
          setPreviewTab((t) => {
            const i = Math.max(tabs.indexOf(resolveTab(t, reviews).tab), 0);
            return tabs[(i + action.direction + tabs.length) % tabs.length] ?? "diff";
          });
          return;
        }
        case "approve":
          // Step one only: this opens the confirmation. Confirming is a
          // second, separate Enter (or click) in the box it opens.
          if (selected && canReviewSelected && !reviewed[selected.id] && !isOwn(selected)) askApprove(selected);
          return;
        case "requestChanges":
          if (selected && canReviewSelected && !reviewed[selected.id]) {
            // The comment box lives in the preview, so it has to be showing.
            if (narrow) setExpanded(true);
            setApproveFor(null);
            setChangesFor(selected.id);
          }
          return;
        case "claude": {
          // Flip between Claude's review and the diff — or, with none yet,
          // choose a reviewer from the +.
          if (!ai.available || !selected) return;
          const job = ai.byPr.get(prKey(selected));
          if (!job) startAiReview(selected);
          else setPreviewTab((t) => (t.startsWith("review:") ? "diff" : reviewTab(job.reviewerId)));
          if (narrow) setExpanded(true);
          return;
        }
        case "toggleFocusMode":
          if (selected) setExpanded((x) => !x);
          return;
        case "openGitHub":
          if (selected) window.open(selected.url, "_blank", "noreferrer");
          return;
        case "switchList":
          setTab(action.tab);
          return;
        case "search":
          if (expanded) setExpanded(false);
          searchRef.current?.focus();
          return;
        case "settings":
          setPage("settings");
          return;
        case "theme":
          toggleColorScheme();
          return;
        case "refresh":
          refreshTab();
          return;
        case "toggleHidden":
          // Only the queue and Hidden hold hideable pull requests.
          if (selected && (tab === "queue" || tab === "hidden")) toggleHidden(selected);
          return;
        case "help":
          setShortcutsOpen(true);
          return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    list,
    selected,
    setSelectedId,
    tab,
    canReviewSelected,
    narrow,
    expanded,
    shortcutsOpen,
    changesOpen,
    approveOpen,
    page,
    reviewed,
    refreshTab,
    isOwn,
    toggleColorScheme,
    ai.available,
    ai.byPr,
    ai.reviewsByPr,
    startAiReview,
    askApprove,
    toggleHidden,
  ]);

  // The desktop app's menus: the same actions as ",", Shift+R and "?".
  useDesktopCommands((name) => {
    switch (name) {
      case "settings":
        setShortcutsOpen(false);
        setPage("settings");
        return;
      case "refresh":
        refreshTab();
        return;
      case "help":
        setShortcutsOpen(true);
        return;
      case "reviewers":
        if (ai.supported) openSettings("reviewers");
        return;
    }
  });

  /* ---------------------------------------------------------------------- */

  const mode: SplitMode = expanded ? "preview" : narrow ? "list" : "split";
  const prefetchPct = allPrs.length === 0 ? 0 : (readyCount / allPrs.length) * 100;

  const difficultySegments = (q: string, set: (next: string) => void, total: number, c: Record<Difficulty, number>) => ({
    value: readLevel(q) ?? "all",
    onChange: (v: string) => set(setLevel(q, v === "all" ? null : (v as Difficulty))),
    data: [
      { label: `All ${total}`, value: "all" },
      { label: <LevelLabel level="easy" text={`Easy ${c.easy}`} />, value: "easy" },
      { label: <LevelLabel level="medium" text={`Med ${c.medium}`} />, value: "medium" },
      { label: <LevelLabel level="hard" text={`Hard ${c.hard}`} />, value: "hard" },
    ],
  });

  const listFilter =
    tab === "hidden" ? (
      <ListFilter
        query=""
        onQueryChange={() => {}}
        placeholder=""
        inputRef={searchRef}
        note="Hidden pull requests stay out of Review until you unhide them — ⇧H, or the eye on a row."
      />
    ) : tab === "reviewed" ? (
      <ListFilter
        query={historyQuery}
        onQueryChange={setHistoryQuery}
        placeholder="Search your reviews"
        inputRef={searchRef}
        segments={{
          value: verdict,
          onChange: (v) => setVerdict(v as VerdictFilter),
          data: [
            { label: `All ${history.pullRequests.length}`, value: "all" },
            { label: `Approved ${verdictCounts.get("APPROVED") ?? 0}`, value: "APPROVED" },
            { label: `Changes ${verdictCounts.get("CHANGES_REQUESTED") ?? 0}`, value: "CHANGES_REQUESTED" },
            { label: `Comment ${verdictCounts.get("COMMENTED") ?? 0}`, value: "COMMENTED" },
          ],
        }}
      />
    ) : tab === "mine" ? (
      <ListFilter
        query={mineQuery}
        onQueryChange={setMineQuery}
        placeholder="Search your pull requests"
        inputRef={searchRef}
        sort={sort}
        onSortChange={setSort}
        segments={difficultySegments(mineQuery, setMineQuery, mine.pullRequests.length, mineCounts)}
      />
    ) : (
      <ListFilter
        query={query}
        onQueryChange={setQuery}
        placeholder="Search title, repo, author, number…"
        inputRef={searchRef}
        sort={sort}
        onSortChange={setSort}
        segments={difficultySegments(query, setQuery, prs.length, counts)}
      />
    );

  const listPane = tab === "mine" ? (
    <QueueList
      variant="mine"
      rows={visibleMine}
      total={mine.pullRequests.length}
      loaded={mine.data !== null}
      loading={mine.loading}
      error={mine.error}
      fetchedAt={mine.data?.fetchedAt ?? null}
      settings={settings}
      selectedId={selectedKey}
      reviewed={reviewed}
      onSelect={select}
      onFilterAuthor={filterByAuthor}
      onClearFilter={() => setMineQuery("")}
      onRetry={() => void mine.refresh()}
      ai={queueAi}
    />
  ) : tab !== "reviewed" ? (
    <QueueList
      variant={tab === "hidden" ? "hidden" : "queue"}
      rows={tab === "hidden" ? hiddenPrs : visible}
      total={tab === "hidden" ? hiddenPrs.length : prs.length}
      loaded={data !== null}
      loading={loading}
      error={error}
      fetchedAt={data?.fetchedAt ?? null}
      settings={settings}
      selectedId={selectedKey}
      reviewed={reviewed}
      onSelect={select}
      onFilterAuthor={filterByAuthor}
      onClearFilter={() => setQuery("")}
      onRetry={() => void refresh()}
      onUnhide={toggleHidden}
      ai={queueAi}
    />
  ) : (
    <ReviewedList
      rows={visibleHistory}
      fetched={history.pullRequests.length}
      total={history.total}
      loading={history.loading}
      loadingMore={history.loadingMore}
      hasMore={history.hasMore}
      error={history.error}
      selectedId={selectedKey}
      onSelect={select}
      onFilterAuthor={filterByAuthor}
      onLoadMore={history.loadMore}
      onClearFilter={() => {
        setHistoryQuery("");
        setVerdict("all");
      }}
      onRetry={history.refresh}
    />
  );

  return (
    <div className="er-shell">
      <header className="er-topbar">
        <Group gap="lg" wrap="nowrap" style={{ minWidth: 0 }}>
          {/* The list, like a sidebar: the same as `o`, and the same focus mode. */}
          <Tooltip label={expanded ? "Show the list (o)" : "Hide the list (o)"}>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setExpanded((x) => !x)}
              disabled={!selected && !expanded}
              aria-label={expanded ? "Show the list" : "Hide the list"}
              aria-pressed={!expanded}
              style={page ? { visibility: "hidden" } : undefined}
            >
              {expanded ? <IconLayoutSidebarLeftExpand size={18} /> : <IconLayoutSidebarLeftCollapse size={18} />}
            </ActionIcon>
          </Tooltip>
          <Group gap="xs" wrap="nowrap" className="er-brand">
            <IconGitPullRequest size={22} color="var(--mantine-color-indigo-5)" />
            <Title order={1}>easy&#8288;-&#8288;review</Title>
            {data && (
              <Text size="xs" c="dimmed" visibleFrom="sm">
                {data.viewer}
              </Text>
            )}
          </Group>

          {/* The Reviewers page has its own way back; it isn't left by accident. */}
          <Tabs
            className="er-main-tabs"
            style={page ? { visibility: "hidden" } : undefined}
            value={tab}
            onChange={(v) => setTab((v as Tab) ?? "queue")}
            variant="pills"
            radius="md"
          >
            <Tabs.List>
              <Tabs.Tab value="queue" leftSection={<IconInbox size={14} />}>
                <Group gap={6} wrap="nowrap">
                  Review
                  <Badge size="xs" variant="light" color={prs.length > 0 ? "indigo" : "gray"}>
                    {prs.length}
                  </Badge>
                </Group>
              </Tabs.Tab>
              <Tabs.Tab value="mine" leftSection={<IconUser size={14} />}>
                <Group gap={6} wrap="nowrap">
                  Mine
                  {mine.data && mine.pullRequests.length > 0 && (
                    <Badge size="xs" variant="light" color="gray">
                      {mine.pullRequests.length}
                    </Badge>
                  )}
                </Group>
              </Tabs.Tab>
              <Tabs.Tab value="reviewed" leftSection={<IconHistory size={14} />}>
                <Group gap={6} wrap="nowrap">
                  Reviewed
                  {history.total > 0 && (
                    <Badge size="xs" variant="light" color="gray">
                      {history.total.toLocaleString()}
                    </Badge>
                  )}
                </Group>
              </Tabs.Tab>
              <Tabs.Tab value="hidden" leftSection={<IconEyeOff size={14} />}>
                <Group gap={6} wrap="nowrap">
                  Hidden
                  {hiddenPrs.length > 0 && (
                    <Badge size="xs" variant="light" color="gray">
                      {hiddenPrs.length}
                    </Badge>
                  )}
                </Group>
              </Tabs.Tab>
            </Tabs.List>
          </Tabs>
        </Group>

        <Group gap={6} wrap="nowrap">
          <Tooltip label={`Diffs prefetched: ${readyCount}/${allPrs.length}`}>
            <Box w={72} visibleFrom="md">
              <Progress
                value={prefetchPct}
                size="xs"
                color={prefetchPct >= 100 ? "teal" : "indigo"}
                transitionDuration={200}
              />
            </Box>
          </Tooltip>
          <Tooltip label="Refresh (Shift+R)">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={refreshTab}
              aria-label="Refresh"
            >
              <IconRefresh
                size={17}
                className={
                  (tab === "reviewed" ? history.loading : tab === "mine" ? mine.loading : loading) ? "er-spin" : undefined
                }
              />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={reviewPaneOpen ? "Hide your review" : "Your review: summary, comments, submit"}>
            <ActionIcon
              variant={reviewPaneOpen ? "light" : "subtle"}
              color="gray"
              onClick={() => setReviewPaneOpen((x) => !x)}
              aria-label="Your review"
              aria-pressed={reviewPaneOpen}
              style={page ? { visibility: "hidden" } : undefined}
            >
              <IconClipboardText size={17} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Shortcuts (?)">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Keyboard shortcuts"
            >
              <IconKeyboard size={17} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Settings (,)">
            <ActionIcon
              variant={page === "settings" ? "light" : "subtle"}
              color="gray"
              onClick={() => setPage("settings")}
              aria-label="Settings"
            >
              <IconSettings size={17} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </header>

      {page === "settings" && (
        <SettingsPage
          onClose={() => setPage(null)}
          section={settingsSection}
          onSectionChange={setSettingsSection}
          reviewers={reviewers}
          settings={settings}
          onChange={update}
          onReset={reset}
          prs={prs}
          local={{ supported: ai.supported, status: ai.status }}
        />
      )}

      {!page && (
        <div className="er-workspace">
          <SplitView
            mode={mode}
            left={
              // biome-ignore lint/a11y: onFocus tracks which pane has focus; it isn't an action
              <div
                className="er-pane"
                data-focused={focusedPane === "list"}
                onFocus={() => setFocusedPane("list")}
              >
                {listFilter}
                <div className="er-pane-scroll" ref={listScrollRef} tabIndex={-1}>
                  {listPane}
                </div>
              </div>
            }
            right={
              <PreviewPane
                pr={selected}
                settings={settings}
                reviewed={selected ? reviewed[selected.id] : undefined}
                onSubmit={handleSubmit}
                changesOpen={changesOpen}
                onChangesOpenChange={setChangesOpen}
                approveOpen={approveOpen}
                onApproveOpenChange={setApproveOpen}
                expanded={expanded}
                onToggleExpand={() => setExpanded((x) => !x)}
                narrow={narrow}
                scrollRef={previewScrollRef}
                focused={focusedPane === "preview"}
                onFocusPane={() => setFocusedPane("preview")}
                ai={aiControls}
                tab={previewTab}
                onTabChange={setPreviewTab}
                viewer={viewer}
                hideState={
                  selected && (tab === "queue" || tab === "hidden")
                    ? { hidden: isHidden(hidden, selected), toggle: () => toggleHidden(selected) }
                    : undefined
                }
              />
            }
          />
          {reviewPaneOpen && (
            <ReviewPane
              key={selected?.id ?? "none"}
              pr={selected}
              ownPr={selected !== null && isOwn(selected)}
              reviewed={selected ? reviewed[selected.id] : undefined}
              onSubmit={handleSubmit}
              onClose={() => setReviewPaneOpen(false)}
            />
          )}
        </div>
      )}

      <ShortcutsModal opened={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

/** A difficulty in the filter, with the dot that matches its rows' stripe. */
function LevelLabel({ level, text }: { level: Difficulty; text: string }) {
  return (
    <>
      <span className="er-level-dot" style={{ "--er-level": `var(--mantine-color-${DIFFICULTY_COLOR[level]}-5)` } as React.CSSProperties} />
      {text}
    </>
  );
}
