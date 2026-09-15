import { afterEach, expect, mock, test } from "bun:test";
import { createApi } from "./api.ts";

// GitHub is replaced for these tests: nothing here should ever post a real review.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubGitHub() {
  const sent: { url: string; body: unknown }[] = [];
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ id: 1, state: "APPROVED", html_url: "https://github.com/r" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return sent;
}

const review = (body: Record<string, unknown>) =>
  new Request("http://localhost:5175/api/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ owner: "acme", name: "app", number: 7, ...body }),
  });

const api = () => createApi({ getToken: () => "test-token" });

test("without a token, the caller is told to sign in with gh and GitHub is never called", async () => {
  const sent = stubGitHub();
  const res = await createApi({ getToken: () => undefined }).handle(
    new Request("http://localhost:5175/api/reviews"),
  );
  expect(res.status).toBe(401);
  expect(((await res.json()) as { error: string }).error).toContain("gh auth login");
  expect(sent).toHaveLength(0);
});

test("an approval without a positive emoji never reaches GitHub", async () => {
  const sent = stubGitHub();
  for (const body of [undefined, "", "LGTM", "LGTM 🎉", "👎 not great"]) {
    const res = await api().handle(review({ event: "APPROVE", body }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("positive emoji");
  }
  expect(sent).toHaveLength(0);
});

test("an approval that starts with one is posted exactly as written", async () => {
  const sent = stubGitHub();
  const res = await api().handle(review({ event: "APPROVE", body: "🎉 Nice work" }));
  expect(res.status).toBe(200);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.url).toBe("https://api.github.com/repos/acme/app/pulls/7/reviews");
  expect(sent[0]?.body).toEqual({ event: "APPROVE", body: "🎉 Nice work" });
});

test("the emoji alone is a complete approval", async () => {
  const sent = stubGitHub();
  const res = await api().handle(review({ event: "APPROVE", body: "🚀" }));
  expect(res.status).toBe(200);
  expect(sent[0]?.body).toEqual({ event: "APPROVE", body: "🚀" });
});

test("requesting changes is unaffected: a comment, no emoji needed", async () => {
  const sent = stubGitHub();
  const missing = await api().handle(review({ event: "REQUEST_CHANGES" }));
  expect(missing.status).toBe(400);
  const ok = await api().handle(review({ event: "REQUEST_CHANGES", body: "Please add a test" }));
  expect(ok.status).toBe(200);
  expect(sent).toHaveLength(1);
});

const lineComment = (overrides: Record<string, unknown> = {}) => ({
  path: "src/app.ts",
  line: 12,
  side: "RIGHT",
  body: "This could use a test",
  ...overrides,
});

test("comments on the code go up inside the review, on the commit they were written against", async () => {
  const sent = stubGitHub();
  const res = await api().handle(
    review({
      event: "REQUEST_CHANGES",
      body: "A couple of things",
      commitId: "abc1234",
      comments: [lineComment(), lineComment({ side: "LEFT", line: 40, body: "  Why remove this?  " })],
    }),
  );
  expect(res.status).toBe(200);
  // One request: the review and its comments appear together, or not at all.
  expect(sent).toHaveLength(1);
  expect(sent[0]?.url).toBe("https://api.github.com/repos/acme/app/pulls/7/reviews");
  expect(sent[0]?.body).toEqual({
    event: "REQUEST_CHANGES",
    body: "A couple of things",
    commit_id: "abc1234",
    comments: [
      { path: "src/app.ts", line: 12, side: "RIGHT", body: "This could use a test" },
      { path: "src/app.ts", line: 40, side: "LEFT", body: "Why remove this?" },
    ],
  });
});

test("an approval carries its comments too, and the emoji rule still applies", async () => {
  const sent = stubGitHub();
  const res = await api().handle(
    review({ event: "APPROVE", body: "🎉 Nice", commitId: "abc1234", comments: [lineComment()] }),
  );
  expect(res.status).toBe(200);
  expect(sent[0]?.body).toMatchObject({ event: "APPROVE", body: "🎉 Nice", commit_id: "abc1234" });

  const bare = await api().handle(
    review({ event: "APPROVE", body: "LGTM", commitId: "abc1234", comments: [lineComment()] }),
  );
  expect(bare.status).toBe(400);
  expect(sent).toHaveLength(1);
});

test("one comment with nowhere to land, or nothing to say, stops the whole review", async () => {
  const sent = stubGitHub();
  const broken = [
    { line: 0 },
    { line: -3 },
    { line: 1.5 },
    { side: "MIDDLE" },
    { path: "" },
    { body: "" },
    { body: "   " },
  ];
  for (const overrides of broken) {
    const res = await api().handle(
      review({ event: "APPROVE", body: "🎉", commitId: "abc1234", comments: [lineComment(), lineComment(overrides)] }),
    );
    expect(res.status).toBe(400);
  }
  expect(sent).toHaveLength(0);
});

test("comments without the commit they were written against are refused", async () => {
  const sent = stubGitHub();
  for (const commitId of [undefined, "", "not-a-sha"]) {
    const res = await api().handle(
      review({ event: "APPROVE", body: "🎉", commitId, comments: [lineComment()] }),
    );
    expect(res.status).toBe(400);
  }
  expect(sent).toHaveLength(0);
});

test("the old standalone comment route is gone", async () => {
  const sent = stubGitHub();
  const res = await api().handle(
    new Request("http://localhost:5175/api/comment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner: "acme", name: "app", number: 7, ...lineComment() }),
    }),
  );
  expect(res.status).toBe(404);
  expect(sent).toHaveLength(0);
});

test("a posted review is reported, so that PR's checkouts can be cleared", async () => {
  stubGitHub();
  const submitted: unknown[] = [];
  const res = await createApi({
    getToken: () => "test-token",
    onReviewSubmitted: (pr) => submitted.push(pr),
  }).handle(review({ event: "APPROVE", body: "🎉" }));
  expect(res.status).toBe(200);
  expect(submitted).toEqual([{ owner: "acme", name: "app", number: 7 }]);
});

test("a review that is refused, or rejected by GitHub, clears nothing", async () => {
  stubGitHub();
  const submitted: unknown[] = [];
  const withHook = () =>
    createApi({ getToken: () => "test-token", onReviewSubmitted: (pr) => submitted.push(pr) });

  expect((await withHook().handle(review({ event: "APPROVE", body: "LGTM" }))).status).toBe(400);

  globalThis.fetch = mock(async () =>
    new Response(JSON.stringify({ message: "Unprocessable Entity", errors: ["Can not approve your own pull request"] }), {
      status: 422,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
  expect((await withHook().handle(review({ event: "APPROVE", body: "🎉" }))).status).toBe(422);

  expect(submitted).toEqual([]);
});

test("the conversation route checks its input", async () => {
  const sent = stubGitHub();
  const res = await api().handle(
    new Request("http://localhost:5175/api/conversation?owner=acme&name=app&number=x"),
  );
  expect(res.status).toBe(400);
  expect(sent).toHaveLength(0);
});

test("the conversation route turns GitHub's comments into a timeline", async () => {
  globalThis.fetch = mock(async () =>
    new Response(
      JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              comments: {
                totalCount: 1,
                nodes: [
                  {
                    id: "c1",
                    url: "u",
                    body: "hi",
                    createdAt: "2026-09-11T10:00:00Z",
                    isMinimized: false,
                    minimizedReason: null,
                    author: { __typename: "User", login: "alice", avatarUrl: null },
                  },
                ],
              },
              reviews: { totalCount: 0, nodes: [] },
              reviewThreads: { totalCount: 0, nodes: [] },
            },
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  ) as unknown as typeof fetch;
  const res = await api().handle(
    new Request("http://localhost:5175/api/conversation?owner=acme&name=app&number=7&updated=t"),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: { kind: string; body: string }[]; truncated: boolean };
  expect(body.items).toEqual([expect.objectContaining({ kind: "comment", body: "hi" })]);
  expect(body.truncated).toBe(false);
});
