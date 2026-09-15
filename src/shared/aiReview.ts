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

export type AiReviewEffort = "" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AiReviewConfig {
  /** The standing instructions every review is given. */
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
}

/** Enough to draw a row's robot icon; polled frequently, so kept small. */
export interface AiReviewSummary {
  id: string;
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
}

export interface AiReviewActivity {
  at: string;
  text: string;
}

export type CloneSource = "configured" | "detected" | "managed";

export interface AiReviewJob extends AiReviewSummary {
  baseRef: string;
  /** The finished review, as Markdown. */
  review: string | null;
  /** What Claude has been doing: "Read src/foo.ts", "Grep “bar”". */
  activity: AiReviewActivity[];
  clonePath: string | null;
  cloneSource: CloneSource | null;
  worktreePath: string | null;
  sessionId: string | null;
  model: string | null;
  /** The last of whatever the process wrote to stderr, for failures. */
  stderrTail: string | null;
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
};

export function prKey(pr: { owner: string; name: string; number: number }): string {
  return `${pr.owner}/${pr.name}#${pr.number}`.toLowerCase();
}

/**
 * Continue the review interactively — with the same restrictions, since the
 * directory holds the pull request's code, not yours.
 */
export function resumeCommand(job: Pick<AiReviewJob, "worktreePath" | "sessionId">): string | null {
  if (!job.worktreePath || !job.sessionId) return null;
  const quoted = `'${job.worktreePath.replace(/'/g, `'\\''`)}'`;
  return `cd ${quoted} && claude --resume ${job.sessionId} --restricted --strict-mcp-config --tools Read,Grep,Glob`;
}
