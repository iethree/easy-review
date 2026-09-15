import { Badge, Button, Group, Text } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconPlus } from "@tabler/icons-react";
import { Fragment, memo, useMemo, useState } from "react";
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
import { DraftCard, LineCommentForm } from "./DraftComments.tsx";

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
  defaultOpen,
  pr,
  threads,
  drafts,
}: {
  file: DiffFile;
  defaultOpen: boolean;
  /** Null when commenting isn't possible — a pull request that can't be reviewed. */
  pr: PullRequest | null;
  threads: Map<string, DiffThreadItem[]>;
  /** Your pending comments, by line. */
  drafts: Map<string, DraftComment[]>;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
    <div className="er-diff-file">
      <div
        className="er-diff-filehead"
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
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
    <div className="er-diff">
      {diff.files.map((file, i) => (
        <FileBlock
          key={`${file.path}:${i}`}
          file={file}
          defaultOpen={openFlags[i] ?? false}
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
  );
});
