/**
 * A pull request's conversation — comments, review summaries and inline
 * threads — flattened into one timeline, the way GitHub's Conversation tab
 * reads.
 */

import type {
  Conversation,
  ConversationComment,
  Person,
  PrDetails,
  PrLabel,
  PrReviewer,
  ReviewSummaryState,
  TimelineItem,
} from "../shared/types.ts";

const AUTHOR = "author { __typename login avatarUrl(size: 48) }";
const COMMENT = `id url body createdAt isMinimized minimizedReason ${AUTHOR}`;

export const CONVERSATION_QUERY = /* GraphQL */ `
  query Conversation($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        author { login }
        reviewRequests(first: 50) {
          nodes {
            requestedReviewer {
              __typename
              ... on User { login avatarUrl(size: 48) }
              ... on Bot { login avatarUrl(size: 48) }
              ... on Mannequin { login avatarUrl(size: 48) }
              ... on Team { name avatarUrl(size: 48) }
            }
          }
        }
        latestReviews(first: 50) {
          nodes { state ${AUTHOR} }
        }
        assignees(first: 20) {
          nodes { login avatarUrl(size: 48) }
        }
        labels(first: 30) {
          nodes { name color description }
        }
        comments(first: 100) {
          totalCount
          nodes { ${COMMENT} }
        }
        reviews(first: 100) {
          totalCount
          nodes { id url body state submittedAt ${AUTHOR} }
        }
        reviewThreads(first: 100) {
          totalCount
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            originalLine
            diffSide
            comments(first: 50) {
              totalCount
              nodes { ${COMMENT} }
            }
          }
        }
      }
    }
  }
`;

interface RawAuthor {
  __typename?: string;
  login?: string;
  avatarUrl?: string | null;
}

interface RawComment {
  id?: string;
  url?: string;
  body?: string;
  createdAt?: string;
  isMinimized?: boolean;
  minimizedReason?: string | null;
  author?: RawAuthor | null;
}

interface RawReview {
  id?: string;
  url?: string;
  body?: string;
  state?: string;
  submittedAt?: string | null;
  author?: RawAuthor | null;
}

interface RawThread {
  id?: string;
  isResolved?: boolean;
  isOutdated?: boolean;
  path?: string;
  line?: number | null;
  originalLine?: number | null;
  diffSide?: string | null;
  comments?: { totalCount?: number; nodes?: (RawComment | null)[] | null } | null;
}

interface Page<T> {
  totalCount?: number;
  nodes?: (T | null)[] | null;
}

interface RawRequestedReviewer {
  __typename?: string;
  login?: string;
  name?: string;
  avatarUrl?: string | null;
}

export interface RawConversation {
  author?: { login?: string } | null;
  reviewRequests?: Page<{ requestedReviewer?: RawRequestedReviewer | null }> | null;
  latestReviews?: Page<{ state?: string; author?: RawAuthor | null }> | null;
  assignees?: Page<{ login?: string; avatarUrl?: string | null }> | null;
  labels?: Page<{ name?: string; color?: string; description?: string | null }> | null;
  comments?: Page<RawComment> | null;
  reviews?: Page<RawReview> | null;
  reviewThreads?: Page<RawThread> | null;
}

function person(author: RawAuthor | null | undefined): Person {
  // Deleted accounts come back as null; GitHub shows them as "ghost".
  return {
    login: author?.login ?? "ghost",
    avatarUrl: author?.avatarUrl ?? null,
    isBot: author?.__typename === "Bot",
  };
}

function toComment(raw: RawComment | null): ConversationComment | null {
  if (!raw?.id || !raw.createdAt) return null;
  return {
    id: raw.id,
    url: raw.url ?? "",
    author: person(raw.author),
    body: raw.body ?? "",
    createdAt: raw.createdAt,
    minimizedReason: raw.isMinimized ? (raw.minimizedReason ?? "hidden") : null,
  };
}

const SHOWN_REVIEWS = new Set<string>(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"]);

const more = (page: Page<unknown> | null | undefined) =>
  (page?.totalCount ?? 0) > (page?.nodes?.length ?? 0);

export function buildConversation(raw: RawConversation | null | undefined): Conversation {
  const items: TimelineItem[] = [];

  for (const node of raw?.comments?.nodes ?? []) {
    const comment = toComment(node);
    if (comment) items.push({ kind: "comment", ...comment });
  }

  for (const review of raw?.reviews?.nodes ?? []) {
    // No submittedAt means PENDING: someone's unsubmitted draft.
    if (!review?.id || !review.submittedAt || !SHOWN_REVIEWS.has(review.state ?? "")) continue;
    const body = review.body ?? "";
    // A "comment" review with no text is only the envelope around inline
    // comments, which appear in their own threads — as a bubble it'd be empty.
    if (review.state === "COMMENTED" && !body.trim()) continue;
    items.push({
      kind: "review",
      id: review.id,
      url: review.url ?? "",
      author: person(review.author),
      body,
      state: review.state as ReviewSummaryState,
      createdAt: review.submittedAt,
    });
  }

  for (const thread of raw?.reviewThreads?.nodes ?? []) {
    if (!thread?.id) continue;
    const comments = (thread.comments?.nodes ?? []).flatMap((node) => {
      const comment = toComment(node);
      return comment ? [comment] : [];
    });
    const first = comments[0];
    if (!first) continue;
    items.push({
      kind: "thread",
      id: thread.id,
      path: thread.path ?? "",
      // An outdated thread's line no longer exists; its original one does.
      line: thread.line ?? thread.originalLine ?? null,
      side: thread.diffSide === "LEFT" ? "LEFT" : "RIGHT",
      resolved: thread.isResolved ?? false,
      outdated: thread.isOutdated ?? false,
      createdAt: first.createdAt,
      comments,
      more: Math.max(0, (thread.comments?.totalCount ?? comments.length) - comments.length),
    });
  }

  // ISO-8601 in UTC sorts correctly as plain strings.
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    items,
    truncated: more(raw?.comments) || more(raw?.reviews) || more(raw?.reviewThreads),
    details: buildDetails(raw),
  };
}

/**
 * The sidebar: who is asked to review and where each reviewer stands, who
 * it's assigned to, and its labels. Someone asked again after reviewing is
 * waiting on, as GitHub shows them; the author's own comments aren't a review.
 */
export function buildDetails(raw: RawConversation | null | undefined): PrDetails {
  const author = raw?.author?.login?.toLowerCase();
  const byName = new Map<string, PrReviewer>();

  for (const review of raw?.latestReviews?.nodes ?? []) {
    const login = review?.author?.login;
    if (!login || login.toLowerCase() === author || !SHOWN_REVIEWS.has(review.state ?? "")) continue;
    byName.set(login.toLowerCase(), {
      name: login,
      avatarUrl: review.author?.avatarUrl ?? null,
      isTeam: false,
      state: review.state as ReviewSummaryState,
    });
  }
  for (const request of raw?.reviewRequests?.nodes ?? []) {
    const reviewer = request?.requestedReviewer;
    const isTeam = reviewer?.__typename === "Team";
    const name = isTeam ? reviewer?.name : reviewer?.login;
    if (!name) continue;
    byName.set(`${isTeam ? "team:" : ""}${name.toLowerCase()}`, {
      name,
      avatarUrl: reviewer?.avatarUrl ?? null,
      isTeam,
      state: "REQUESTED",
    });
  }

  const reviewers = [...byName.values()].sort(
    (a, b) => Number(a.isTeam) - Number(b.isTeam) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const assignees: Person[] = (raw?.assignees?.nodes ?? []).flatMap((node) =>
    node?.login ? [{ login: node.login, avatarUrl: node.avatarUrl ?? null, isBot: false }] : [],
  );
  const labels: PrLabel[] = (raw?.labels?.nodes ?? []).flatMap((node) =>
    node?.name ? [{ name: node.name, color: node.color ?? "888888", description: node.description || null }] : [],
  );
  return { reviewers, assignees, labels };
}
