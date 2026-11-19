import { Badge, Button, Group, Text } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconChevronsDown, IconChevronsUp, IconPlus } from "@tabler/icons-react";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DiffFile,
  DiffLine,
  DiffSide,
  ParsedDiff,
  PullRequest,
} from "../../shared/types.ts";
import { anchorForLine, anchorThreads, threadKey } from "../comments.ts";
import { addDraft, draftsOnLines, type DraftComment } from "../drafts.ts";
import { tokenizeFile, type Token } from "../highlight.ts";
import { DiffThread, type DiffThreadItem } from "./DiffThread.tsx";
import { fileTree } from "../fileTree.ts";
import { DraftCard, LineCommentForm } from "./DraftComments.tsx";
import { FileTree } from "./FileTree.tsx";

/** Rendering every line of a huge file locks the main thread; cap and offer more. */
const PER_FILE_LINE_CAP = 600;

const KIND_SYMBOL: Record<DiffLine["kind"], string> = {
  add: "+",
  del: "−",
  context: " ",
  meta: " ",
};

function fileLineCount(file: DiffFile): number {
  let n = 0;
  for (const hunk of file.hunks) n += hunk.lines.length;
  return n;
}

const KIND_LABEL = {
  added: { text: "added", color: "teal" },
  deleted: { text: "deleted", color: "red" },
  renamed: { text: "renamed", color: "violet" },
  modified: { text: "", color: "gray" },
} as const;

const FileBlock = memo(function FileBlock({
  file,
  index,
  open,
  onToggle,
  pr,
  threads,
  drafts,
}: {
  file: DiffFile;
  index: number;
  open: boolean;
  onToggle: (index: number) => void;
  /** Null when commenting isn't possible — a pull request that can't be reviewed. */
  pr: PullRequest | null;
  threads: Map<string, DiffThreadItem[]>;
  /** Your pending comments, by line. */
  drafts: Map<string, DraftComment[]>;
}) {
  const [showAll, setShowAll] = useState(false);
  /** Which line has a comment box open. The box owns the text it holds, so
   *  typing re-renders the box alone rather than every line of the file. */
  const [composing, setComposing] = useState<{ side: DiffSide; line: number } | null>(null);

  const total = useMemo(() => fileLineCount(file), [file]);
  // Only pay for highlighting a file someone has actually opened.
  const tokens = useMemo(() => (open ? tokenizeFile(file) : null), [file, open]);
  const capped = !showAll && total > PER_FILE_LINE_CAP;

  const label = KIND_LABEL[file.kind];

  let rendered = 0;

  return (
    <div className="er-diff-file" data-file-index={index}>
      {/* biome-ignore lint/a11y/useSemanticElements: a header row with its own keyboard handling; a <button> can't hold its layout */}
      <div
        className="er-diff-filehead"
        onClick={() => onToggle(index)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(index);
          }
        }}
      >
        {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        <Text
          span
          ff="monospace"
          fz={12}
          fw={550}
          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {file.kind === "renamed" && file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        </Text>

        {label.text && (
          <Badge size="xs" variant="light" color={label.color}>
            {label.text}
          </Badge>
        )}
        {file.isBinary && (
          <Badge size="xs" variant="light" color="gray">
            binary
          </Badge>
        )}
        <Text span ff="monospace" fz={11} c="teal.6" fw={600}>
          +{file.additions}
        </Text>
        <Text span ff="monospace" fz={11} c="red.6" fw={600}>
          −{file.deletions}
        </Text>
      </div>

      {open && (
        <div className="er-diff-body">
          {file.isBinary && file.hunks.length === 0 ? (
            <Text size="xs" c="dimmed" p="xs" ff="monospace">
              Binary file not shown
            </Text>
          ) : (
            <div className="er-diff-lines">
              {
            file.hunks.map((hunk, hi) => {
              if (capped && rendered >= PER_FILE_LINE_CAP) return null;
              const remaining = PER_FILE_LINE_CAP - rendered;
              const lines = capped ? hunk.lines.slice(0, remaining) : hunk.lines;
              rendered += lines.length;

              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: hunks never reorder; their position is their identity
                <div key={hi}>
                  <div className="er-diff-hunk">
                    @@ {hunk.header || `hunk ${hi + 1}`}
                  </div>
                  {lines.map((line, li) => {
                    const anchor = anchorForLine(line);
                    const here =
                      anchor && composing?.side === anchor.side && composing.line === anchor.line;
                    const key = anchor ? threadKey(file.path, anchor.side, anchor.line) : null;
                    const existing = key ? threads.get(key) : undefined;
                    const pending = key ? drafts.get(key) : undefined;

                    return (
                      // A fragment, not a wrapper element: a diff this size
                      // shouldn't carry a spare DOM node for every line.
                      // biome-ignore lint/suspicious/noArrayIndexKey: lines never reorder
                      <Fragment key={li}>
                        <div className="er-diff-line" data-kind={line.kind}>
                          <span className="er-gutter">{line.oldNumber ?? ""}</span>
                          <span className="er-gutter">{line.newNumber ?? ""}</span>
                          <span className="er-code">
                            {KIND_SYMBOL[line.kind]}
                            <Code line={line} tokens={tokens?.[hi]?.[li] ?? null} />
                          </span>
                          {pr && anchor && (
                            // A plain title rather than a Mantine Tooltip: one
                            // tooltip instance per line is hundreds per file.
                            <button
                              type="button"
                              className="er-line-comment"
                              title="Comment on this line"
                              aria-label={`Comment on ${file.path} line ${anchor.line}`}
                              onClick={() => setComposing(here ? null : anchor)}
                            >
                              <IconPlus size={12} stroke={3} />
                            </button>
                          )}
                        </div>

                        {existing?.map((thread) => (
                          <DiffThread key={thread.id} thread={thread} />
                        ))}

                        {pr &&
                          pending?.map((draft) => (
                            <DraftCard key={draft.id} prId={pr.id} draft={draft} />
                          ))}

                        {pr && anchor && here && (
                          <LineCommentForm
                            where={{ path: file.path, side: anchor.side, line: anchor.line }}
                            saveLabel="Add to review"
                            onSave={(body) =>
                              addDraft(pr.id, {
                                path: file.path,
                                side: anchor.side,
                                line: anchor.line,
                                body,
                                // Anchored to the diff you were reading when you wrote it.
                                commitId: pr.headSha,
                              })
                            }
                            onClose={() => setComposing(null)}
                          />
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              );
              })}
            </div>
          )}

          {capped && (
            <Group justify="center" p={6}>
              <Button size="compact-xs" variant="subtle" onClick={() => setShowAll(true)}>
                Show all {total.toLocaleString()} lines
              </Button>
            </Group>
          )}
        </div>
      )}
    </div>
  );
});

/** One line of code: highlighted spans when we have them, plain text if not. */
function Code({ line, tokens }: { line: DiffLine; tokens: Token[] | null }) {
  if (!tokens) return <>{line.content}</>;
  return (
    <>
      {tokens.map((token, i) =>
        token.className ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: tokens never reorder
          <span key={i} className={token.className}>
            {token.text}
          </span>
        ) : (
          token.text
        ),
      )}
    </>
  );
}

interface Props {
  diff: ParsedDiff;
  /** Files are auto-expanded until this many lines have been budgeted. */
  expandBudget?: number;
  /** The pull request being read, so lines can be commented on. */
  pr?: PullRequest | null;
  /** Inline discussions already on this pull request. */
  threads?: DiffThreadItem[];
  /** Your comments waiting to go up with your review. */
  drafts?: DraftComment[];
}

const NO_THREADS: DiffThreadItem[] = [];
const NO_DRAFTS: DraftComment[] = [];

export const DiffView = memo(function DiffView({
  diff,
  expandBudget = 800,
  pr = null,
  threads = NO_THREADS,
  drafts = NO_DRAFTS,
}: Props) {
  // Decide up front which files start open, so scrolling never triggers work.
  const openFlags = useMemo(() => {
    let budget = expandBudget;
    return diff.files.map((file, index) => {
      // What we would actually render, not what the file contains.
      const count = Math.min(fileLineCount(file), PER_FILE_LINE_CAP);
      // Always open the first file so the modal never lands on a wall of
      // collapsed headers; after that, only what still fits the budget.
      if (index === 0) {
        budget -= count;
        return true;
      }
      if (count > budget) return false;
      budget -= count;
      return true;
    });
  }, [diff, expandBudget]);

  // One lookup shared by every file, rebuilt only when the threads change —
  // a stable reference keeps the memoised file blocks from re-rendering.
  const byLine = useMemo(() => anchorThreads(threads), [threads]);

  // Which files are open, here rather than in each file so that Expand all
  // and Collapse all, and the tree, can open them. A new diff starts over.
  const [opened, setOpened] = useState({ diff, flags: openFlags });
  const open = opened.diff === diff ? opened.flags : openFlags;
  if (opened.diff !== diff) setOpened({ diff, flags: openFlags });
  const toggle = useCallback(
    (index: number) =>
      setOpened((prev) => ({ ...prev, flags: prev.flags.map((flag, i) => (i === index ? !flag : flag)) })),
    [],
  );
  const setAll = (value: boolean) => setOpened((prev) => ({ ...prev, flags: prev.flags.map(() => value) }));
  const allOpen = open.every(Boolean);
  const allClosed = !open.some(Boolean);

  const tree = useMemo(() => fileTree(diff.files), [diff]);
  const root = useRef<HTMLDivElement>(null);
  const active = useActiveFile(root, diff);
  const [chosen, setChosen] = useState<number | null>(null);

  // From the tree: open the file, then bring its header to the top.
  const goTo = useCallback((index: number) => {
    setChosen(index);
    setOpened((prev) => ({ ...prev, flags: prev.flags.map((flag, i) => (i === index ? true : flag)) }));
    requestAnimationFrame(() => {
      root.current?.querySelector(`[data-file-index="${index}"]`)?.scrollIntoView({ block: "start" });
    });
  }, []);
  // Scrolling decides which file is current; a click on the tree, until then.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a change of `active` is the trigger
  useEffect(() => setChosen(null), [active]);

  const additions = useMemo(() => diff.files.reduce((n, f) => n + f.additions, 0), [diff]);
  const deletions = useMemo(() => diff.files.reduce((n, f) => n + f.deletions, 0), [diff]);
  const pendingByLine = useMemo(
    () => draftsOnLines(drafts, pr?.headSha ?? null),
    [drafts, pr?.headSha],
  );

  if (diff.files.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="lg">
        This pull request has no textual changes.
      </Text>
    );
  }

  return (
    <div className="er-diff-layout" ref={root}>
      <div className="er-diff-columns">
      <div className="er-diff-main">
        <div className="er-diff-toolbar">
          <Text span size="xs" c="dimmed">
            {diff.files.length} file{diff.files.length === 1 ? "" : "s"}
          </Text>
          <Text span ff="monospace" fz={11} c="teal.6" fw={600}>
            +{additions.toLocaleString()}
          </Text>
          <Text span ff="monospace" fz={11} c="red.6" fw={600}>
            −{deletions.toLocaleString()}
          </Text>
          <Group gap={4} ml="auto" wrap="nowrap">
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<IconChevronsDown size={13} />}
              disabled={allOpen}
              onClick={() => setAll(true)}
            >
              Expand all
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<IconChevronsUp size={13} />}
              disabled={allClosed}
              onClick={() => setAll(false)}
            >
              Collapse all
            </Button>
          </Group>
        </div>
        <div className="er-diff">
          {diff.files.map((file, i) => (
            <FileBlock
              // biome-ignore lint/suspicious/noArrayIndexKey: a path can appear twice (renames); the index tells them apart
              key={`${file.path}:${i}`}
              file={file}
              index={i}
              open={open[i] ?? false}
              onToggle={toggle}
              pr={pr}
              threads={byLine}
              drafts={pendingByLine}
            />
          ))}
          {diff.truncated && (
            <Text size="xs" c="orange.6" mt="sm" ta="center">
              Diff was very large and has been truncated — open it on GitHub to see everything.
            </Text>
          )}
        </div>
      </div>
      <aside className="er-diff-aside">
        <FileTree tree={tree} active={chosen ?? active} onSelect={goTo} />
      </aside>
      </div>
    </div>
  );
});

/** The nearest ancestor that scrolls: where the diff is read. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/**
 * The file being read: the last one whose header has reached the top of the
 * scrolling pane (under the toolbar). Files are in order down the page, so
 * it's a binary search, once a frame at most.
 */
function useActiveFile(root: React.RefObject<HTMLDivElement | null>, diff: ParsedDiff): number | null {
  const [active, setActive] = useState<number | null>(diff.files.length > 0 ? 0 : null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new diff means new files to measure
  useEffect(() => {
    const el = root.current;
    const scroller = scrollParent(el);
    if (!el || !scroller) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const files = el.querySelectorAll<HTMLElement>("[data-file-index]");
      const toolbar = el.querySelector<HTMLElement>(".er-diff-toolbar");
      const line = scroller.getBoundingClientRect().top + (toolbar?.offsetHeight ?? 0) + 8;
      let lo = 0;
      let hi = files.length - 1;
      let found = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if ((files[mid]?.getBoundingClientRect().top ?? 0) <= line) {
          found = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      setActive(files.length > 0 ? found : null);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    measure();
    // The tree beside the diff is as tall as the pane, and scrolls itself.
    const fit = () => el.style.setProperty("--er-diff-viewport", `${scroller.clientHeight}px`);
    const resize = new ResizeObserver(fit);
    resize.observe(scroller);
    fit();
    return () => {
      resize.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [root, diff]);

  return active;
}
