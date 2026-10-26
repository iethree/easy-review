/** GitHub client: GraphQL and REST over plain `fetch`. */

import { TOO_LARGE_MESSAGE } from "../shared/diff.ts";
import { buildConversation, CONVERSATION_QUERY, type RawConversation } from "./conversation.ts";
import type {
  CheckContext,
  Conversation,
  PullRequestState,
  ReviewedPullRequest,
  ReviewedResponse,
  ReviewVerdict,
  CheckState,
  CiStatus,
  PullRequest,
  ReviewDecision,
  ReviewCommentDraft,
  ReviewEvent,
  ReviewsResponse,
} from "../shared/types.ts";

const GRAPHQL_URL = "https://api.github.com/graphql";
const REST_URL = "https://api.github.com";
const UA = "easy-review";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

/* -------------------------------------------------------------------------- */
/* Query                                                                       */
/* -------------------------------------------------------------------------- */

/** The fields every pull request row needs, on both tabs. */
const PR_CORE = /* GraphQL */ `
  fragment PrCore on PullRequest {
    id
    number
    title
    body
    url
    isDraft
    createdAt
    updatedAt
    additions
    deletions
    changedFiles
    baseRefName
    reviewDecision
    author {
      login
      avatarUrl(size: 64)
    }
    repository {
      owner {
        login
      }
      name
      nameWithOwner
    }
    commits(last: 1) {
      nodes {
        commit {
          oid
        }
      }
    }
  }
`;

/**
 * CI rollups, kept separate because they are expensive: adding them to a
 * 50-result history query pushes it past GitHub's ~10s GraphQL timeout (it
 * answers 502). The identical `commits(last: 1)` selection merges with the
 * one in PrCore.
 */
const PR_CHECKS = /* GraphQL */ `
  fragment PrChecks on PullRequest {
    commits(last: 1) {
      nodes {
        commit {
          statusCheckRollup {
            state
            # Context nodes are deliberately omitted: fetching 100 per pull
            # request costs ~4.5s across a full queue, and these aggregates
            # give exact counts for free. Names load on demand instead.
            contexts(first: 0) {
              totalCount
              checkRunCountsByState {
                state
                count
              }
              statusContextCountsByState {
                state
                count
              }
            }
          }
        }
      }
    }
  }
`;

const REVIEWS_QUERY = /* GraphQL */ `
  ${PR_CORE}
  ${PR_CHECKS}
  query Reviews($q: String!, $first: Int!) {
    viewer {
      login
    }
    search(query: $q, type: ISSUE, first: $first) {
      nodes {
        ...PrCore
        ...PrChecks
      }
    }
  }
`;

/**
 * Your own open pull requests: the ones you wrote, and the ones assigned to
 * you. GitHub search has no OR across qualifiers, so it's two searches in one
 * request.
 */
const MINE_QUERY = /* GraphQL */ `
  ${PR_CORE}
  ${PR_CHECKS}
  query Mine($authored: String!, $assigned: String!, $first: Int!) {
    viewer {
      login
    }
    authored: search(query: $authored, type: ISSUE, first: $first) {
      nodes {
        ...PrCore
        ...PrChecks
      }
    }
    assigned: search(query: $assigned, type: ISSUE, first: $first) {
      nodes {
        ...PrCore
        ...PrChecks
      }
    }
  }
`;

/**
 * Pull requests you have already reviewed, newest activity first.
 *
 * `viewerLatestReview` avoids having to look up your own login first, so this
 * stays a single round trip. No CI rollup here — for history the question is
 * "did it land?", not "is CI green?", and including it times out.
 */
const REVIEWED_QUERY = /* GraphQL */ `
  ${PR_CORE}
  query Reviewed($q: String!, $first: Int!, $after: String) {
    search(query: $q, type: ISSUE, first: $first, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ...PrCore
        ... on PullRequest {
          state
          merged
          viewerLatestReview {
            state
            submittedAt
            url
          }
        }
      }
    }
  }
`;

const CHECKS_QUERY = /* GraphQL */ `
  query Checks($owner: String!, $name: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                contexts(first: 100, after: $after) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  nodes {
                    __typename
                    ... on CheckRun {
                      name
                      status
                      conclusion
                      detailsUrl
                    }
                    ... on StatusContext {
                      context
                      state
                      targetUrl
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/* -------------------------------------------------------------------------- */
/* Check-state mapping                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A repo can easily have 200+ check runs, more than one page of `contexts`.
 * The counts therefore come from GitHub's per-state aggregates (exact), while
 * `contexts` is only used to name the failures we can see.
 */

/** CheckRun states that are finished and fine. */
const CHECK_RUN_PASSED = new Set(["SUCCESS", "NEUTRAL"]);
/** Finished, not run, and not a problem — a skipped matrix leg, a superseded run. */
const CHECK_RUN_SKIPPED = new Set(["SKIPPED", "CANCELLED", "STALE"]);
/** Genuinely broken. */
const CHECK_RUN_FAILED = new Set([
  "FAILURE",
  "TIMED_OUT",
  "STARTUP_FAILURE",
  "ACTION_REQUIRED",
]);
/** Still going. */
const CHECK_RUN_PENDING = new Set([
  "PENDING",
  "QUEUED",
  "IN_PROGRESS",
  "WAITING",
  "REQUESTED",
]);

function checkRunState(status: string | null, conclusion: string | null): CheckState {
  if (status !== "COMPLETED") return "PENDING";
  if (conclusion === null) return "PENDING";
  if (CHECK_RUN_PASSED.has(conclusion) || CHECK_RUN_SKIPPED.has(conclusion)) return "SUCCESS";
  if (conclusion === "ACTION_REQUIRED" || conclusion === "STARTUP_FAILURE") return "ERROR";
  return "FAILURE";
}

function statusContextState(state: string | null): CheckState {
  switch (state) {
    case "SUCCESS":
      return "SUCCESS";
    case "PENDING":
    case "EXPECTED":
      return "PENDING";
    case "ERROR":
      return "ERROR";
    case "FAILURE":
      return "FAILURE";
    default:
      return "NONE";
  }
}

interface RawContext {
  __typename?: string;
  name?: string;
  status?: string | null;
  conclusion?: string | null;
  detailsUrl?: string | null;
  context?: string;
  state?: string | null;
  targetUrl?: string | null;
}

interface StateCount {
  state?: string;
  count?: number;
}

interface RawRollup {
  state?: string | null;
  contexts?: {
    totalCount?: number;
    checkRunCountsByState?: StateCount[] | null;
    statusContextCountsByState?: StateCount[] | null;
  } | null;
}

function tally(counts: StateCount[] | null | undefined, states: Set<string>): number {
  let n = 0;
  for (const entry of counts ?? []) {
    if (entry.state && states.has(entry.state)) n += entry.count ?? 0;
  }
  return n;
}

const STATUS_PASSED = new Set(["SUCCESS"]);
const STATUS_FAILED = new Set(["FAILURE", "ERROR"]);
const STATUS_PENDING = new Set(["PENDING", "EXPECTED"]);

function buildCiStatus(rollup: RawRollup | null): CiStatus {
  if (!rollup) {
    return {
      state: "NONE",
      total: 0,
      passed: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
      contexts: [],
      namesComplete: true,
    };
  }

  const runCounts = rollup.contexts?.checkRunCountsByState;
  const statusCounts = rollup.contexts?.statusContextCountsByState;

  const passed = tally(runCounts, CHECK_RUN_PASSED) + tally(statusCounts, STATUS_PASSED);
  const failed = tally(runCounts, CHECK_RUN_FAILED) + tally(statusCounts, STATUS_FAILED);
  const pending = tally(runCounts, CHECK_RUN_PENDING) + tally(statusCounts, STATUS_PENDING);
  const skipped = tally(runCounts, CHECK_RUN_SKIPPED);

  const total = rollup.contexts?.totalCount ?? 0;
  const state: CheckState = total === 0 ? "NONE" : statusContextState(rollup.state ?? null);

  return {
    state,
    total,
    passed,
    failed,
    pending,
    skipped,
    // Names arrive later, from /api/checks, and only if someone looks.
    contexts: [],
    namesComplete: failed === 0 && pending === 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Client                                                                      */
/* -------------------------------------------------------------------------- */

export interface ReviewQueryOptions {
  includeTeamRequests: boolean;
  hideDrafts: boolean;
  limit: number;
}

export class GitHubClient {
  constructor(private readonly token: string) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      "user-agent": UA,
      ...extra,
    };
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new GitHubError(
        res.status === 401
          ? "GitHub rejected the sign-in (401). Run `gh auth login` to sign in again."
          : `GitHub GraphQL ${res.status}: ${text.slice(0, 300)}`,
        res.status,
      );
    }

    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) {
      throw new GitHubError(json.errors.map((e) => e.message).join("; "), 502);
    }
    if (!json.data) throw new GitHubError("GitHub returned no data", 502);
    return json.data;
  }

  buildSearchQuery(opts: ReviewQueryOptions): string {
    const parts = ["is:open", "is:pr", "archived:false"];
    parts.push(opts.includeTeamRequests ? "review-requested:@me" : "user-review-requested:@me");
    if (opts.hideDrafts) parts.push("-is:draft");
    return parts.join(" ");
  }

  async listReviewRequests(opts: ReviewQueryOptions): Promise<ReviewsResponse> {
    const q = this.buildSearchQuery(opts);
    const data = await this.graphql<{
      viewer: { login: string };
      search: { nodes: (RawPullRequest | null)[] };
    }>(REVIEWS_QUERY, { q, first: Math.min(Math.max(opts.limit, 1), 100) });

    const pullRequests: PullRequest[] = [];
    for (const node of data.search.nodes) {
      const pr = normalizePullRequest(node);
      if (pr) pullRequests.push(pr);
    }

    return {
      viewer: data.viewer.login,
      pullRequests,
      fetchedAt: new Date().toISOString(),
    };
  }

  /** Your open pull requests — written by you or assigned to you — newest activity first. */
  async listMine(limit: number): Promise<ReviewsResponse> {
    const [authored, assigned] = mineSearchQueries();
    const data = await this.graphql<{
      viewer: { login: string };
      authored: { nodes: (RawPullRequest | null)[] };
      assigned: { nodes: (RawPullRequest | null)[] };
    }>(MINE_QUERY, { authored, assigned, first: Math.min(Math.max(limit, 1), 100) });

    return {
      viewer: data.viewer.login,
      pullRequests: mergeById([...data.authored.nodes, ...data.assigned.nodes].map(normalizePullRequest)),
      fetchedAt: new Date().toISOString(),
    };
  }

  /** Pull requests you have already reviewed, most recently reviewed first. */
  async listReviewed(limit: number, cursor: string | null): Promise<ReviewedResponse> {
    const data = await this.graphql<{
      search: {
        issueCount: number;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: (RawReviewedPullRequest | null)[];
      };
    }>(REVIEWED_QUERY, {
      // Submitting a review bumps the pull request, so "recently updated" is a
      // good proxy for "recently reviewed"; we re-sort exactly below.
      q: "is:pr reviewed-by:@me sort:updated-desc",
      first: Math.min(Math.max(limit, 1), 100),
      after: cursor,
    });

    const pullRequests: ReviewedPullRequest[] = [];
    for (const node of data.search.nodes) {
      const reviewed = normalizeReviewed(node);
      if (reviewed) pullRequests.push(reviewed);
    }

    // Order by when *you* reviewed, which is what the tab is actually about.
    pullRequests.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));

    return {
      pullRequests,
      total: data.search.issueCount,
      cursor: data.search.pageInfo.endCursor,
      hasMore: data.search.pageInfo.hasNextPage,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Names of the checks that are failing or still running on a pull request.
   *
   * Paginated because a busy repo can have several hundred contexts and the
   * failures are not necessarily on the first page.
   */
  async fetchFailingChecks(
    owner: string,
    name: string,
    number: number,
  ): Promise<{ contexts: CheckContext[]; complete: boolean }> {
    const found: CheckContext[] = [];
    let after: string | null = null;
    let complete = true;

    // Bounded so one pathological pull request can't spin here forever.
    for (let page = 0; page < 5; page++) {
      const data: ChecksQueryResult = await this.graphql<ChecksQueryResult>(CHECKS_QUERY, {
        owner,
        name,
        number,
        after,
      });

      const contexts =
        data.repository?.pullRequest?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts;
      if (!contexts) break;

      for (const node of contexts.nodes ?? []) {
        if (!node) continue;
        const isCheckRun = node.__typename === "CheckRun";
        const state = isCheckRun
          ? checkRunState(node.status ?? null, node.conclusion ?? null)
          : statusContextState(node.state ?? null);
        if (state === "SUCCESS" || state === "NONE") continue;
        found.push({
          name: (isCheckRun ? node.name : node.context) ?? "check",
          state,
          url: (isCheckRun ? node.detailsUrl : node.targetUrl) ?? null,
        });
      }

      if (!contexts.pageInfo?.hasNextPage) break;
      after = contexts.pageInfo.endCursor ?? null;
      if (!after) break;
      if (page === 4) complete = false;
    }

    // Failures first, then whatever is still running.
    found.sort((a, b) => rank(a.state) - rank(b.state));
    return { contexts: found.slice(0, 30), complete: complete && found.length <= 30 };
  }

  /** The bits of a pull request a local review needs, straight from GitHub. */
  async fetchPullRequest(
    owner: string,
    name: string,
    number: number,
  ): Promise<{
    title: string;
    body: string;
    author: string;
    url: string;
    headSha: string;
    baseRef: string;
    state: string;
  }> {
    const res = await fetch(`${REST_URL}/repos/${owner}/${name}/pulls/${number}`, {
      headers: this.headers({ accept: "application/vnd.github+json" }),
    });
    const json = (await res.json().catch(() => null)) as
      | (RestErrorBody & {
          title?: string;
          body?: string | null;
          user?: { login?: string };
          html_url?: string;
          head?: { sha?: string };
          base?: { ref?: string };
          state?: string;
        })
      | null;
    if (!res.ok || !json?.head?.sha || !json.base?.ref) {
      throw new GitHubError(describeRestError(res.status, json, "Could not load the pull request"), res.status);
    }
    return {
      title: json.title ?? `#${number}`,
      body: json.body ?? "",
      author: json.user?.login ?? "unknown",
      url: json.html_url ?? `https://github.com/${owner}/${name}/pull/${number}`,
      headSha: json.head.sha,
      baseRef: json.base.ref,
      state: json.state ?? "open",
    };
  }

  /** Every comment on a pull request, in order — for the Description tab. */
  async fetchConversation(owner: string, name: string, number: number): Promise<Conversation> {
    const data = await this.graphql<{
      repository?: { pullRequest?: RawConversation | null } | null;
    }>(CONVERSATION_QUERY, { owner, name, number });
    return buildConversation(data.repository?.pullRequest);
  }

  /** Raw unified diff for a PR. */
  async fetchDiff(owner: string, name: string, number: number): Promise<string> {
    const res = await fetch(`${REST_URL}/repos/${owner}/${name}/pulls/${number}`, {
      headers: this.headers({ accept: "application/vnd.github.v3.diff" }),
    });

    if (!res.ok) {
      const text = await res.text();
      // 406 + `too_large` is GitHub declining to render a huge diff, not a fault.
      if (res.status === 406 && text.includes("too_large")) {
        throw new GitHubError(TOO_LARGE_MESSAGE, 413);
      }
      throw new GitHubError(`Could not load diff (${res.status}): ${text.slice(0, 200)}`, res.status);
    }
    return res.text();
  }

  /**
   * Posts a review — and with it, any comments on lines of the diff, in the
   * same request, so they appear together or not at all. GitHub puts the whole
   * review on one commit: the one the comments were written against.
   */
  async submitReview(
    owner: string,
    name: string,
    number: number,
    event: ReviewEvent,
    body?: string,
    inline?: { commitId: string; comments: ReviewCommentDraft[] },
  ): Promise<{ id: number; state: string; html_url: string }> {
    const payload: Record<string, unknown> = { event };
    if (body) payload.body = body;
    if (inline && inline.comments.length > 0) {
      payload.commit_id = inline.commitId;
      payload.comments = inline.comments.map(({ path, line, side, body }) => ({ path, line, side, body }));
    }

    const res = await fetch(`${REST_URL}/repos/${owner}/${name}/pulls/${number}/reviews`, {
      method: "POST",
      headers: this.headers({
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      }),
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => null)) as RestErrorBody | null;

    if (!res.ok) {
      throw new GitHubError(describeRestError(res.status, json, "Review failed"), res.status);
    }
    if (!json) throw new GitHubError("GitHub returned an empty response", 502);
    return json as unknown as { id: number; state: string; html_url: string };
  }
}

interface ChecksQueryResult {
  repository?: {
    pullRequest?: {
      commits?: {
        nodes?:
          | ({
              commit?: {
                statusCheckRollup?: {
                  contexts?: {
                    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
                    nodes?: (RawContext | null)[] | null;
                  } | null;
                } | null;
              };
            } | null)[]
          | null;
      };
    } | null;
  } | null;
}

interface RestErrorBody {
  message?: string;
  /**
   * Shape varies by endpoint. Most of GitHub returns objects here, but the
   * reviews endpoint returns plain strings — and for a 422 the top-level
   * `message` is just "Unprocessable Entity", so this array is the only place
   * the actual reason appears.
   */
  errors?: (string | { field?: string; code?: string; message?: string })[];
}

/** Turns a GitHub error body into something worth showing a person. */
export function describeRestError(
  status: number,
  json: RestErrorBody | null,
  fallback: string,
): string {
  const details: string[] = [];

  for (const entry of json?.errors ?? []) {
    if (typeof entry === "string") {
      details.push(entry);
      continue;
    }
    const text = entry.message ?? entry.code;
    if (text) details.push(entry.field ? `${entry.field}: ${text}` : text);
  }

  if (details.length > 0) return details.join("; ");
  // "Unprocessable Entity" on its own tells the reader nothing, so keep looking.
  if (json?.message && json.message !== "Unprocessable Entity") return json.message;
  return `${fallback} (${status})`;
}

/** Failures sort above still-running checks. */
function rank(state: CheckState): number {
  if (state === "FAILURE" || state === "ERROR") return 0;
  if (state === "PENDING" || state === "EXPECTED") return 1;
  return 2;
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                               */
/* -------------------------------------------------------------------------- */

interface RawPullRequest {
  id?: string;
  number?: number;
  title?: string;
  body?: string | null;
  url?: string;
  isDraft?: boolean;
  createdAt?: string;
  updatedAt?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  baseRefName?: string;
  reviewDecision?: string | null;
  author?: { login?: string; avatarUrl?: string } | null;
  repository?: { owner?: { login?: string }; name?: string; nameWithOwner?: string };
  commits?: {
    nodes?:
      | ({
          commit?: {
            oid?: string;
            statusCheckRollup?: RawRollup | null;
          };
        } | null)[]
      | null;
  };
}

function normalizePullRequest(node: RawPullRequest | null): PullRequest | null {
  // The search connection also yields Issues, which have no `number` shape we want.
  if (!node || typeof node.number !== "number" || !node.repository) return null;

  const commit = node.commits?.nodes?.[0]?.commit;
  const owner = node.repository.owner?.login ?? "";
  const name = node.repository.name ?? "";

  return {
    id: node.id ?? `${owner}/${name}#${node.number}`,
    number: node.number,
    title: node.title ?? "(untitled)",
    body: node.body ?? "",
    url: node.url ?? `https://github.com/${owner}/${name}/pull/${node.number}`,
    repo: node.repository.nameWithOwner ?? `${owner}/${name}`,
    owner,
    name,
    author: node.author?.login ?? "ghost",
    authorAvatar: node.author?.avatarUrl ?? null,
    isDraft: node.isDraft ?? false,
    createdAt: node.createdAt ?? "",
    updatedAt: node.updatedAt ?? "",
    additions: node.additions ?? 0,
    deletions: node.deletions ?? 0,
    changedFiles: node.changedFiles ?? 0,
    headSha: commit?.oid ?? "",
    baseRef: node.baseRefName ?? "main",
    reviewDecision: (node.reviewDecision ?? null) as ReviewDecision,
    ci: buildCiStatus(commit?.statusCheckRollup ?? null),
  };
}

interface RawReviewedPullRequest extends RawPullRequest {
  state?: string;
  merged?: boolean;
  viewerLatestReview?: { state?: string; submittedAt?: string; url?: string } | null;
}

const VERDICTS = new Set<ReviewVerdict>([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
  "PENDING",
]);

function normalizeReviewed(node: RawReviewedPullRequest | null): ReviewedPullRequest | null {
  const base = normalizePullRequest(node);
  if (!base || !node) return null;

  const review = node.viewerLatestReview;
  // The search asked for pull requests you reviewed, so a missing review here
  // means the payload is not what we expect — skip rather than invent a state.
  if (!review?.submittedAt) return null;

  const raw = review.state ?? "";
  const verdict: ReviewVerdict = VERDICTS.has(raw as ReviewVerdict)
    ? (raw as ReviewVerdict)
    : "COMMENTED";

  const state: PullRequestState = node.merged
    ? "MERGED"
    : node.state === "CLOSED"
      ? "CLOSED"
      : "OPEN";

  return {
    ...base,
    state,
    verdict,
    reviewedAt: review.submittedAt,
    reviewUrl: review.url ?? base.url,
  };
}

/** The two searches behind "My PRs": written by you, and assigned to you. */
export function mineSearchQueries(): [authored: string, assigned: string] {
  const base = "is:open is:pr archived:false";
  return [`${base} author:@me`, `${base} assignee:@me`];
}

/** One of each pull request (yours and assigned to you counts once), newest activity first. */
export function mergeById(prs: (PullRequest | null)[]): PullRequest[] {
  const byId = new Map<string, PullRequest>();
  for (const pr of prs) if (pr && !byId.has(pr.id)) byId.set(pr.id, pr);
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
