/** Types shared by the server and the client. */

export type CheckState =
  | "SUCCESS"
  | "FAILURE"
  | "PENDING"
  | "ERROR"
  | "EXPECTED"
  | "NONE";

export interface CheckContext {
  name: string;
  state: CheckState;
  url: string | null;
}

export interface CiStatus {
  state: CheckState;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  /** Skipped and cancelled runs — neither passing nor a problem. */
  skipped: number;
  /** Only the interesting ones (failed/pending) are sent down, capped. */
  contexts: CheckContext[];
  /**
   * False when the PR has more checks than we page through, so `contexts` may
   * not name every failure even though the counts above are exact.
   */
  namesComplete: boolean;
}

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  /** The author's description, as Markdown. */
  body: string;
  url: string;
  repo: string;
  owner: string;
  name: string;
  author: string;
  authorAvatar: string | null;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  /** Head commit sha — doubles as the cache key for the diff. */
  headSha: string;
  baseRef: string;
  reviewDecision: ReviewDecision;
  ci: CiStatus;
}

export interface ReviewsResponse {
  viewer: string;
  pullRequests: PullRequest[];
  fetchedAt: string;
}

/** The verdict you left on a pull request. */
export type ReviewVerdict =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

export type PullRequestState = "OPEN" | "CLOSED" | "MERGED";

/** A pull request you have already reviewed. */
export interface ReviewedPullRequest extends PullRequest {
  state: PullRequestState;
  /** Your most recent verdict on it. */
  verdict: ReviewVerdict;
  reviewedAt: string;
  reviewUrl: string;
}

export interface ReviewedResponse {
  pullRequests: ReviewedPullRequest[];
  /** How many pull requests you have ever reviewed. */
  total: number;
  /** Opaque cursor for the next page, or null when the history ends. */
  cursor: string | null;
  hasMore: boolean;
  fetchedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Diff                                                                        */
/* -------------------------------------------------------------------------- */

export type DiffLineKind = "add" | "del" | "context" | "meta";

/**
 * Which half of the diff a line belongs to, in GitHub's vocabulary: RIGHT is
 * the new file (additions and context), LEFT the old one (deletions).
 */
export type DiffSide = "LEFT" | "RIGHT";

export interface DiffLine {
  kind: DiffLineKind;
  content: string;
  /** Line number in the old file, null for additions. */
  oldNumber: number | null;
  /** Line number in the new file, null for deletions. */
  newNumber: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export type FileChangeKind = "added" | "deleted" | "renamed" | "modified";

export interface DiffFile {
  /** Display path — the new path, or the old path for deletions. */
  path: string;
  oldPath: string | null;
  kind: FileChangeKind;
  additions: number;
  deletions: number;
  isBinary: boolean;
  hunks: DiffHunk[];
}

export interface ParsedDiff {
  files: DiffFile[];
  additions: number;
  deletions: number;
  /** True when GitHub's diff exceeded our size cap and was cut short. */
  truncated: boolean;
}

export interface DiffResponse {
  key: string;
  diff: ParsedDiff;
  /** Raw byte length of the diff as GitHub returned it. */
  bytes: number;
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export interface DifficultyTier {
  maxFiles: number;
  maxLines: number;
}

export interface Settings {
  /** A PR is "easy" when it fits inside this tier. */
  easy: DifficultyTier;
  /** ...otherwise "medium" when it fits inside this one, else "hard". */
  medium: DifficultyTier;
  /** Include PRs requested from teams you belong to, not just you directly. */
  includeTeamRequests: boolean;
  /** Hide draft pull requests from the queue. */
  hideDrafts: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  easy: { maxFiles: 3, maxLines: 50 },
  medium: { maxFiles: 10, maxLines: 300 },
  includeTeamRequests: true,
  hideDrafts: false,
};

/* -------------------------------------------------------------------------- */
/* Review submission                                                           */
/* -------------------------------------------------------------------------- */

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

/** A comment on one line of the diff, posted as part of a review. */
export interface ReviewCommentDraft {
  path: string;
  line: number;
  /** For a comment on several lines: the first of them (`line` is the last). Same side. */
  startLine?: number;
  /** RIGHT for added or unchanged lines, LEFT for deleted ones. */
  side: DiffSide;
  body: string;
}

export interface SubmitReviewRequest {
  owner: string;
  name: string;
  number: number;
  event: ReviewEvent;
  body?: string;
  /** Comments on lines of the diff, posted in the same review — all together or not at all. */
  comments?: ReviewCommentDraft[];
  /** The commit those comments were written against. Required with them. */
  commitId?: string;
}

export interface ApiError {
  error: string;
}

/* -------------------------------------------------------------------------- */
/* Conversation — the comments under a PR's description                        */
/* -------------------------------------------------------------------------- */

export interface Person {
  login: string;
  avatarUrl: string | null;
  /** GitHub Apps and friends — their comments tend to be long reports. */
  isBot: boolean;
}

export interface ConversationComment {
  id: string;
  url: string;
  author: Person;
  body: string;
  createdAt: string;
  /** Set when GitHub has collapsed it: outdated, off-topic, spam… */
  minimizedReason: string | null;
}

export type ReviewSummaryState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";

export type TimelineItem =
  | ({ kind: "comment" } & ConversationComment)
  | {
      kind: "review";
      id: string;
      url: string;
      author: Person;
      /** May be empty: an approval without a message is still worth showing. */
      body: string;
      state: ReviewSummaryState;
      createdAt: string;
    }
  | {
      /** Inline comments on one line of code, with their replies. */
      kind: "thread";
      id: string;
      path: string;
      line: number | null;
      /** Which side of the diff the thread hangs off — it needs both to anchor. */
      side: DiffSide;
      resolved: boolean;
      outdated: boolean;
      /** When the first comment was made — where the thread sits in the timeline. */
      createdAt: string;
      comments: ConversationComment[];
      /** Replies beyond what was fetched. */
      more: number;
    };

export interface Conversation {
  /** Oldest first, as GitHub shows it. */
  items: TimelineItem[];
  /** True when GitHub had more than we fetched. */
  truncated: boolean;
}
