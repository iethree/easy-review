import { expect, test } from "bun:test";
import { buildConversation, type RawConversation } from "./conversation.ts";

const alice = { __typename: "User", login: "alice", avatarUrl: "https://avatars/a" };
const bot = { __typename: "Bot", login: "github-actions", avatarUrl: null };
type Author = { __typename: string; login: string; avatarUrl: string | null };
const comment = (id: string, createdAt: string, author: Author | null = alice, extra = {}) => ({
  id,
  url: `https://github.com/c/${id}`,
  body: `body of ${id}`,
  createdAt,
  isMinimized: false,
  minimizedReason: null,
  author,
  ...extra,
});

// Shaped like a real response: note how many reviews are bodiless "COMMENTED"
// envelopes around inline comments (21 of 22 on the PR this was modelled on).
const RAW: RawConversation = {
  comments: {
    totalCount: 2,
    nodes: [
      comment("c1", "2026-09-11T10:00:00Z"),
      comment("c2", "2026-09-11T12:00:00Z", bot, { isMinimized: true, minimizedReason: "OUTDATED" }),
    ],
  },
  reviews: {
    totalCount: 4,
    nodes: [
      { id: "r1", url: "u", body: "", state: "COMMENTED", submittedAt: "2026-09-11T10:30:00Z", author: alice },
      { id: "r2", url: "u", body: "", state: "APPROVED", submittedAt: "2026-09-11T13:00:00Z", author: alice },
      { id: "r3", url: "u", body: "Please add a test", state: "CHANGES_REQUESTED", submittedAt: "2026-09-11T11:00:00Z", author: alice },
      { id: "r4", url: "u", body: "draft", state: "PENDING", submittedAt: null, author: alice },
    ],
  },
  reviewThreads: {
    totalCount: 1,
    nodes: [
      {
        id: "t1",
        isResolved: true,
        isOutdated: true,
        path: "src/app.ts",
        line: null,
        originalLine: 42,
        comments: {
          totalCount: 3,
          nodes: [comment("tc1", "2026-09-11T10:30:00Z"), comment("tc2", "2026-09-11T10:45:00Z", null)],
        },
      },
    ],
  },
};

test("everything lands in one timeline, oldest first", () => {
  const { items } = buildConversation(RAW);
  expect(items.map((i) => i.id)).toEqual(["c1", "t1", "r3", "c2", "r2"]);
});

test("empty comment-reviews and unsubmitted drafts are left out", () => {
  const ids = buildConversation(RAW).items.map((i) => i.id);
  expect(ids).not.toContain("r1");
  expect(ids).not.toContain("r4");
});

test("an approval without a message is kept", () => {
  const approval = buildConversation(RAW).items.find((i) => i.id === "r2");
  expect(approval).toMatchObject({ kind: "review", state: "APPROVED", body: "" });
});

test("an outdated thread keeps its original line, its state and its replies", () => {
  const thread = buildConversation(RAW).items.find((i) => i.id === "t1");
  expect(thread).toMatchObject({
    kind: "thread",
    path: "src/app.ts",
    line: 42,
    // GitHub omits diffSide on some threads; the new side is the sane default.
    side: "RIGHT",
    resolved: true,
    outdated: true,
    createdAt: "2026-09-11T10:30:00Z",
    more: 1,
  });
  if (thread?.kind === "thread") expect(thread.comments.map((c) => c.id)).toEqual(["tc1", "tc2"]);
});

test("a thread on a deleted line is marked as the left side", () => {
  const raw: RawConversation = {
    reviewThreads: {
      totalCount: 1,
      nodes: [
        {
          id: "t2",
          isResolved: false,
          isOutdated: false,
          path: "src/gone.ts",
          line: 7,
          originalLine: 7,
          diffSide: "LEFT",
          comments: { totalCount: 1, nodes: [comment("tc3", "2026-09-11T09:00:00Z")] },
        },
      ],
    },
  };
  expect(buildConversation(raw).items[0]).toMatchObject({
    kind: "thread",
    side: "LEFT",
    line: 7,
  });
});

test("deleted accounts show as ghost; bots are flagged; hidden comments say why", () => {
  const { items } = buildConversation(RAW);
  const thread = items.find((i) => i.id === "t1");
  if (thread?.kind === "thread") expect(thread.comments[1]?.author.login).toBe("ghost");
  const botComment = items.find((i) => i.id === "c2");
  expect(botComment).toMatchObject({ author: { isBot: true }, minimizedReason: "OUTDATED" });
});

test("it says when GitHub had more than was fetched", () => {
  expect(buildConversation(RAW).truncated).toBe(false);
  expect(buildConversation({ ...RAW, comments: { totalCount: 150, nodes: RAW.comments?.nodes } }).truncated).toBe(true);
});

test("a missing pull request is an empty conversation", () => {
  expect(buildConversation(null)).toEqual({ items: [], truncated: false });
});
