/** Types for local Claude Code reviews, shared by the local server and the client. */

export type AiReviewStatus =
  | "queued"
  | "preparing"
  | "reviewing"
  | "done"
  | "failed"
  | "cancelled";

export const ACTIVE_STATUSES: readonly AiReviewStatus[] = ["queued", "preparing", "reviewing"];

export function isActive(status: AiReviewStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** Reviewing, or answering a question about its review: either way, its checkout is in use. */
export function isBusy(job: Pick<AiReviewSummary, "status" | "chatPhase">): boolean {
  return isActive(job.status) || Boolean(job.chatPhase);
}

export type AiReviewEffort = "" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AiReviewConfig {
  /**
   * The standing instructions from before there were reviewers. Only read
   * once, to seed the first reviewer (see src/local/reviewers.ts).
   */
  instructions: string;
  /** Model alias or id; empty uses the CLI's default. */
  model: string;
  effort: AiReviewEffort;
  timeoutMinutes: number;
  maxConcurrent: number;
  /**
   * Optional `owner/name = /path/to/clone` lines. Clones in the usual places
   * (~/projects/<name> and friends) are found without this.
   */
  clones: string;
  /**
   * Claude only reads the code, and runs none of it. Off by default: then it
   * can run commands and edit files in the review's worktree, to check what
   * it suspects — running the pull request's code on this machine.
   */
  readOnly: boolean;
}

/** The tools a review gets: reading, and unless read-only, running and editing. */
export function reviewTools(readOnly: boolean): string[] {
  return readOnly ? ["Read", "Grep", "Glob"] : ["Read", "Grep", "Glob", "Bash", "Edit", "Write"];
}

/**
 * A named set of review instructions — "Security", "Performance" — kept as a
 * Markdown file in ~/.easy-review/reviewers. A pull request can be reviewed
 * by several at once, each in its own Claude session.
 */
export interface Reviewer {
  /** The file name, without .md. */
  id: string;
  name: string;
  instructions: string;
}

/** Enough to draw a row's robot icon; polled frequently, so kept small. */
export interface AiReviewSummary {
  id: string;
  /** Who reviewed: the reviewer's id, and its name as it was at the time. */
  reviewerId: string;
  reviewerName: string;
  owner: string;
  name: string;
  number: number;
  title: string;
  /** The commit that was reviewed. */
  headSha: string;
  status: AiReviewStatus;
  /** What it is doing right now, in words. */
  phase: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  error: string | null;
  costUsd: number | null;
  turns: number | null;
  /** What Claude is doing to answer a question about the review; null when it isn't. */
  chatPhase: string | null;
}

export interface AiReviewActivity {
  at: string;
  text: string;
}

export type CloneSource = "configured" | "detected" | "managed";

/** A question about a finished review, or Claude's answer, in the session that wrote it. */
export interface AiChatMessage {
  role: "user" | "assistant";
  /** Markdown. For an answer that failed, why. */
  text: string;
  /** The part of the review a question is about. */
  quote?: string;
  /** The answer failed or was stopped: `text` says why. */
  error?: boolean;
  costUsd?: number | null;
  at: string;
}

export interface AiReviewJob extends AiReviewSummary {
  baseRef: string;
  /** The reviewer's instructions as they were when this review started. */
  instructions: string;
  /** The finished review, as Markdown. */
  review: string | null;
  /** What Claude has been doing: "Read src/foo.ts", "Grep “bar”". */
  activity: AiReviewActivity[];
  clonePath: string | null;
  cloneSource: CloneSource | null;
  worktreePath: string | null;
  sessionId: string | null;
  model: string | null;
  /** Ran read-only (see AiReviewConfig). Absent until it runs; reviews from before the setting were. */
  readOnly?: boolean;
  /** The last of whatever the process wrote to stderr, for failures. */
  stderrTail: string | null;
  /** Follow-up questions and their answers, oldest first. */
  chat?: AiChatMessage[];
}

export interface LocalStatus {
  claude: {
    available: boolean;
    version: string | null;
    path: string | null;
    error: string | null;
  };
  /** Where worktrees, clones and saved reviews live. */
  root: string;
  running: number;
  queued: number;
}

/** Checkouts no review has used for longer than this are removed automatically. */
export const CHECKOUT_MAX_AGE_DAYS = 7;

/** A pull request checked out for Claude to review, as found on disk. */
export interface Checkout {
  path: string;
  owner: string;
  name: string;
  number: number;
  /** The start of the checked-out commit, as in the folder name. */
  sha: string;
  /** From the latest review that ran here; null when none is on record. */
  title: string | null;
  /** When a review last ran here — or, with none on record, when the folder last changed. */
  lastUsedAt: string;
  /** A review is running in it, so it can't be removed. */
  inUse: boolean;
  /** Saved reviews that ran in this checkout. */
  reviews: number;
  /** The clone it belongs to, when known. */
  clonePath: string | null;
  /** Null until measured: `du` over a large checkout takes a moment. */
  sizeBytes: number | null;
}

export interface CheckoutsResponse {
  checkouts: Checkout[];
  maxAgeDays: number;
}

export interface RemoveCheckoutsResult {
  removed: string[];
  failed: { path: string; error: string }[];
}

export const EFFORTS: AiReviewEffort[] = ["", "low", "medium", "high", "xhigh", "max"];

export const DEFAULT_INSTRUCTIONS = `Do a thorough review of this pull request. Start from .easy-review/pr.diff, then read the surrounding code wherever you need context to judge a change.

Focus on:
- Correctness: logic errors, edge cases, off-by-ones, null handling, races.
- Security: injection, missing auth or permission checks, secrets, unsafe input.
- Tests: whether the change is covered, and what is missing.
- Design: naming, duplication, and whether it fits the patterns this codebase already uses.

Structure the review as:
1. A short summary of what the change does, and your verdict: approve, approve with nits, or request changes.
2. Blocking issues — each with file:line, what is wrong, and a suggested fix.
3. Non-blocking suggestions.
4. Questions for the author.

Cite file paths with line numbers. Skip praise, and skip anything a linter would catch.`;

export const DEFAULT_AI_CONFIG: AiReviewConfig = {
  instructions: DEFAULT_INSTRUCTIONS,
  model: "",
  effort: "",
  timeoutMinutes: 20,
  maxConcurrent: 2,
  clones: "",
  readOnly: false,
};

export function prKey(pr: { owner: string; name: string; number: number }): string {
  return `${pr.owner}/${pr.name}#${pr.number}`.toLowerCase();
}

/**
 * Continue the review interactively — with the same restrictions and tools,
 * since the directory holds the pull request's code, not yours.
 */
export function resumeCommand(job: Pick<AiReviewJob, "worktreePath" | "sessionId" | "readOnly">): string | null {
  if (!job.worktreePath || !job.sessionId) return null;
  const quoted = `'${job.worktreePath.replace(/'/g, `'\\''`)}'`;
  const tools = reviewTools(job.readOnly ?? true).join(",");
  return `cd ${quoted} && claude --resume ${job.sessionId} --setting-sources user --strict-mcp-config --tools ${tools}`;
}
