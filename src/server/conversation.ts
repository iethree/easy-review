/**
 * A pull request's conversation — comments, review summaries and inline
 * threads — flattened into one timeline, the way GitHub's Conversation tab
 * reads.
 */

import type {
  Conversation,
  ConversationComment,
  Person,
  ReviewSummaryState,
  TimelineItem,
} from "../shared/types.ts";

const AUTHOR = "author { __typename login avatarUrl(size: 48) }";
const COMMENT = `id url body createdAt isMinimized minimizedReason ${AUTHOR}`;

export const CONVERSATION_QUERY = /* GraphQL */ `
  query Conversation($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
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

export interface RawConversation {
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
  };
}
