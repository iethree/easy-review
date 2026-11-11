/**
 * The GitHub-facing API, as a `Request -> Response` handler.
 *
 * The token arrives through `TokenSource` rather than being looked up here, so
 * the tests can run the whole router against a stubbed GitHub.
 */

import { POSITIVE_EMOJIS, startsWithPositiveEmoji } from "../shared/approval.ts";
import { parseDiff } from "../shared/diff.ts";
import { isGitHubImage, TOKEN_HOSTS } from "../shared/githubImage.ts";
import type {
  CheckContext,
  Conversation,
  DiffResponse,
  ReviewedResponse,
  ReviewsResponse,
  SubmitReviewRequest,
} from "../shared/types.ts";
import { TtlCache } from "./cache.ts";
import { GitHubClient, GitHubError } from "./github.ts";
import { forbidden, isCrossSite } from "./security.ts";

/** Resolves the GitHub token for a request: the one the GitHub CLI holds for your login. */
export type TokenSource = (request: Request) => string | undefined | Promise<string | undefined>;

export interface ApiOptions {
  getToken: TokenSource;
}

const SIGN_IN =
  "Not signed in to GitHub. Run `gh auth login` in a terminal — easy-review signs in with the GitHub CLI (https://cli.github.com).";

const VALID_EVENTS = new Set(["APPROVE", "REQUEST_CHANGES", "COMMENT"]);
const NAME_PART = /^[\w.-]+$/;
/** A whole commit id: what a comparison is asked for by, so nothing else reaches GitHub's URL. */
const SHA = /^[0-9a-f]{40}$/;
/** Generous for a human, and a bound on what one request can ask GitHub to do. */
const MAX_REVIEW_COMMENTS = 200;
/** Bigger than any screenshot; a bound on what one image holds in memory. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** GitHub sends an attachment on to signed storage: one or two hops. */
const MAX_IMAGE_REDIRECTS = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function fail(message: string, status: number): Response {
  return json({ error: message }, status);
}

export function createApi({ getToken }: ApiOptions) {
  // Immutable per head-SHA, so this survives reloads and makes diffs feel instant.
  const diffCache = new TtlCache<DiffResponse>(300, 30 * 60 * 1000);
  const listCache = new TtlCache<ReviewsResponse>(8, 20 * 1000);
  // Check names are per head-SHA and only fetched when someone looks at them.
  const checksCache = new TtlCache<{ contexts: CheckContext[]; complete: boolean }>(200, 60 * 1000);
  // Keyed by cursor, so paging back through history stays instant.
  const reviewedCache = new TtlCache<ReviewedResponse>(20, 60 * 1000);
  // Keyed by the PR's updatedAt, which moves whenever someone comments.
  const conversationCache = new TtlCache<Conversation>(100, 30 * 1000);
  // Collapses requests for a diff that is already being fetched.
  const inFlight = new Map<string, Promise<DiffResponse>>();

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Before anything that touches GitHub: another site must not be able to
    // make your browser approve pull requests with your token.
    if (isCrossSite(request)) return forbidden("Cross-site requests are not allowed");

    if (path === "/api/health") {
      return json({ ok: true, diffsCached: diffCache.size });
    }

    const token = await getToken(request);
    if (!token) return fail(SIGN_IN, 401);

    const gh = new GitHubClient(token);

    try {
      if (path === "/api/reviews" && request.method === "GET") {
        return await handleReviews(gh, url);
      }
      if (path === "/api/image" && request.method === "GET") {
        return await handleImage(token, url);
      }
      if (path === "/api/diff" && request.method === "GET") {
        return await handleDiff(gh, url);
      }
      if (path === "/api/pull" && request.method === "GET") {
        const owner = url.searchParams.get("owner") ?? "";
        const name = url.searchParams.get("name") ?? "";
        const number = Number(url.searchParams.get("number"));
        if (!NAME_PART.test(owner) || !NAME_PART.test(name) || !Number.isInteger(number) || number <= 0) {
          return fail("owner, name and a positive number are required", 400);
        }
        const pr = await gh.getPullRequest(owner, name, number);
        return pr ? json(pr) : fail(`${owner}/${name} has no pull request #${number}`, 404);
      }
      if (path === "/api/conversation" && request.method === "GET") {
        return await handleConversation(gh, url);
      }
      if (path === "/api/mine" && request.method === "GET") {
        const fresh = url.searchParams.get("fresh") === "1";
        const cached = fresh ? undefined : listCache.get("mine");
        if (cached) return json(cached);
        const result = await gh.listMine(100);
        listCache.set("mine", result);
        return json(result);
      }
      if (path === "/api/reviewed" && request.method === "GET") {
        return await handleReviewed(gh, url);
      }
      if (path === "/api/checks" && request.method === "GET") {
        return await handleChecks(gh, url);
      }
      if (path === "/api/review" && request.method === "POST") {
        return await handleSubmitReview(gh, request);
      }
    } catch (err) {
      if (err instanceof GitHubError) {
        // Pass through statuses the client can act on; anything else is upstream.
        const passthrough = new Set([401, 403, 404, 413, 422]);
        return fail(err.message, passthrough.has(err.status) ? err.status : 502);
      }
      return fail(err instanceof Error ? err.message : "Unexpected server error", 500);
    }

    return fail(`No route for ${request.method} ${path}`, 404);
  }

  async function handleReviews(gh: GitHubClient, url: URL): Promise<Response> {
    const includeTeamRequests = url.searchParams.get("teams") !== "0";
    const hideDrafts = url.searchParams.get("drafts") === "0";
    const fresh = url.searchParams.get("fresh") === "1";
    const key = `${includeTeamRequests}:${hideDrafts}`;

    if (!fresh) {
      const cached = listCache.get(key);
      if (cached) return json(cached);
    }

    const result = await gh.listReviewRequests({ includeTeamRequests, hideDrafts, limit: 100 });
    listCache.set(key, result);
    return json(result);
  }

  /**
   * An image GitHub keeps for a pull request or a comment, fetched with your
   * token: on a private repository, the page can't load it itself. Your token
   * goes to GitHub alone, never on to where it redirects; only images come
   * back, and inert, so nothing fetched this way runs as this app.
   */
  async function handleImage(token: string, url: URL): Promise<Response> {
    const src = url.searchParams.get("url") ?? "";
    if (!isGitHubImage(src)) return fail("Only images GitHub keeps are fetched this way", 400);

    let next = new URL(src);
    for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS; hop++) {
      const res = await fetch(next, {
        redirect: "manual",
        headers: {
          "user-agent": "easy-review",
          ...(TOKEN_HOSTS.has(next.hostname.toLowerCase()) ? { authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return fail("GitHub redirected the image to nowhere", 502);
        next = new URL(location, next);
        if (next.protocol !== "https:") return fail("GitHub redirected the image off https", 502);
        continue;
      }
      if (!res.ok) return fail(`GitHub answered ${res.status} for that image`, res.status === 404 ? 404 : 502);

      const type = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      if (!type.startsWith("image/")) return fail("That isn't an image", 415);
      if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return fail("That image is too large", 413);
      const body = await res.arrayBuffer();
      if (body.byteLength > MAX_IMAGE_BYTES) return fail("That image is too large", 413);
      return new Response(body, {
        headers: {
          "content-type": type,
          // An attachment never changes; the browser keeps it rather than asking again.
          "cache-control": "private, max-age=86400",
          "x-content-type-options": "nosniff",
          // An SVG opened on its own would otherwise run as this app.
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
      });
    }
    return fail("The image redirected too many times", 502);
  }

  async function handleDiff(gh: GitHubClient, url: URL): Promise<Response> {
    const owner = url.searchParams.get("owner");
    const name = url.searchParams.get("name");
    const numberRaw = url.searchParams.get("number");
    // Cache-busting key; the client passes the head SHA so stale diffs can't stick.
    const sha = url.searchParams.get("sha") ?? "head";
    const number = Number(numberRaw);

    // A comparison of two commits, for a review of a diff, rather than a pull request's.
    const base = url.searchParams.get("base");
    const comparing = base !== null && SHA.test(base) && SHA.test(sha) && !!owner && !!name;
    if (!comparing && (!owner || !name || !numberRaw || !Number.isInteger(number) || number <= 0)) {
      return fail("owner, name and a positive number are required", 400);
    }
    if (!owner || !name) return fail("owner and name are required", 400);

    const key = comparing ? `${owner}/${name}@${base}..${sha}` : `${owner}/${name}#${number}@${sha}`;
    const cached = diffCache.get(key);
    if (cached) return json(cached);

    let pending = inFlight.get(key);
    if (!pending) {
      pending = (async () => {
        const raw = comparing ? await gh.fetchCompareDiff(owner, name, base, sha) : await gh.fetchDiff(owner, name, number);
        const result: DiffResponse = { key, diff: parseDiff(raw), bytes: raw.length };
        diffCache.set(key, result);
        return result;
      })();
      inFlight.set(key, pending);
      // Always clear, so a failure doesn't poison the key forever. The trailing
      // catch is load-bearing: `.finally()` returns a *new* promise, and if the
      // fetch rejects, that derived promise has no handler and takes the whole
      // process down as an unhandled rejection. The awaiting request below is
      // what actually reports the error to the caller.
      void pending.finally(() => inFlight.delete(key)).catch(() => {});
    }

    return json(await pending);
  }

  async function handleConversation(gh: GitHubClient, url: URL): Promise<Response> {
    const owner = url.searchParams.get("owner");
    const name = url.searchParams.get("name");
    const number = Number(url.searchParams.get("number"));
    if (!owner || !name || !Number.isInteger(number) || number <= 0) {
      return fail("owner, name and a positive number are required", 400);
    }

    const key = `${owner}/${name}#${number}@${url.searchParams.get("updated") ?? ""}`;
    if (url.searchParams.get("fresh") !== "1") {
      const cached = conversationCache.get(key);
      if (cached) return json(cached);
    }
    const result = await gh.fetchConversation(owner, name, number);
    conversationCache.set(key, result);
    return json(result);
  }

  async function handleReviewed(gh: GitHubClient, url: URL): Promise<Response> {
    const cursor = url.searchParams.get("cursor");
    const limitRaw = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isInteger(limitRaw) ? limitRaw : 50;
    const fresh = url.searchParams.get("fresh") === "1";
    const key = `${cursor ?? "start"}:${limit}`;

    if (!fresh) {
      const cached = reviewedCache.get(key);
      if (cached) return json(cached);
    }

    const result = await gh.listReviewed(limit, cursor);
    reviewedCache.set(key, result);
    return json(result);
  }

  async function handleChecks(gh: GitHubClient, url: URL): Promise<Response> {
    const owner = url.searchParams.get("owner");
    const name = url.searchParams.get("name");
    const number = Number(url.searchParams.get("number"));
    const sha = url.searchParams.get("sha") ?? "head";

    if (!owner || !name || !Number.isInteger(number) || number <= 0) {
      return fail("owner, name and a positive number are required", 400);
    }

    const key = `${owner}/${name}#${number}@${sha}`;
    const cached = checksCache.get(key);
    if (cached) return json(cached);

    const result = await gh.fetchFailingChecks(owner, name, number);
    checksCache.set(key, result);
    return json(result);
  }

  async function handleSubmitReview(gh: GitHubClient, request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as SubmitReviewRequest | null;
    if (!body) return fail("Expected a JSON body", 400);

    const { owner, name, number, event } = body;
    if (!owner || !name || !Number.isInteger(number) || !VALID_EVENTS.has(event)) {
      return fail("owner, name, number and a valid event are required", 400);
    }
    if (event !== "APPROVE" && !body.body?.trim()) {
      return fail("A comment is required when requesting changes", 400);
    }
    // Enforced here as well as in the UI, so no client can post a bare approval.
    if (event === "APPROVE" && !startsWithPositiveEmoji(body.body)) {
      const choices = POSITIVE_EMOJIS.map((e) => e.emoji).join(" ");
      return fail(`Approvals must start with a positive emoji: ${choices}`, 400);
    }

    // Comments on the code travel inside the review. Checked here too, so one
    // bad comment stops the whole review before GitHub sees any of it.
    const comments = body.comments ?? [];
    if (!Array.isArray(comments) || comments.length > MAX_REVIEW_COMMENTS) {
      return fail(`A review can carry at most ${MAX_REVIEW_COMMENTS} comments`, 400);
    }
    const wellFormed = comments.every(
      (c) =>
        c &&
        typeof c.path === "string" &&
        c.path !== "" &&
        Number.isInteger(c.line) &&
        c.line > 0 &&
        (c.side === "LEFT" || c.side === "RIGHT") &&
        (c.startLine === undefined || (Number.isInteger(c.startLine) && c.startLine > 0 && c.startLine < c.line)) &&
        typeof c.body === "string" &&
        c.body.trim() !== "",
    );
    if (!wellFormed) return fail("Every comment needs a file, a line, a side and some text", 400);
    if (comments.length > 0 && !(typeof body.commitId === "string" && /^[0-9a-f]{7,40}$/i.test(body.commitId))) {
      return fail("Comments need the commit they were written against", 400);
    }

    const result = await gh.submitReview(
      owner,
      name,
      number,
      event,
      body.body?.trim() || undefined,
      comments.length > 0 && body.commitId
        ? {
            commitId: body.commitId,
            comments: comments.map((c) => ({
              path: c.path,
              line: c.line,
              ...(c.startLine !== undefined ? { startLine: c.startLine } : {}),
              side: c.side,
              body: c.body.trim(),
            })),
          }
        : undefined,
    );
    // The PR's review state just changed, so every cached list is stale.
    listCache.clear();
    reviewedCache.clear();
    conversationCache.clear();
    return json({ ok: true, state: result.state, url: result.html_url });
  }

  return { handle };
}
