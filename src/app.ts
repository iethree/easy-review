/**
 * The easy-review server. Bun serves the client through an HTML import and
 * mounts the GitHub API routes, plus the routes under /api/local that drive
 * Claude Code reviews.
 *
 * `dev.ts` starts it with hot reloading; `main.ts` — which is also the entry
 * point of the compiled binary — starts it without.
 */

import index from "./client/index.html";
import { createLocalApi } from "./local/api.ts";
import { ReviewJobs } from "./local/jobs.ts";
import { createApi } from "./server/api.ts";
import { describeSignIn, ignoredTokenVars, resolveLocalToken } from "./server/localToken.ts";
import { forbidden, isCrossSite, isLoopbackHost, isReportResource } from "./server/security.ts";

export async function startServer({ development }: { development: boolean }): Promise<void> {
  const getToken = async () => (await resolveLocalToken()).token;

  // `bun --hot` re-runs everything on every edit. Running reviews hold child
  // processes, so the job manager has to outlive those reloads.
  const store = globalThis as { __easyReviewJobs?: Promise<ReviewJobs> };
  store.__easyReviewJobs ??= (async () => {
    const jobs = new ReviewJobs(getToken);
    await jobs.init();
    return jobs;
  })();
  const jobs = await store.__easyReviewJobs;
  const local = createLocalApi(jobs);

  // The token is resolved per request (and cached) so that signing in with
  // `gh auth login` while the server is running just starts working.
  const api = createApi({
    getToken,
    // Your review is in, so the checkouts Claude reviewed that PR in are done with.
    onReviewSubmitted: ({ owner, name, number }) => {
      void jobs
        .removeCheckoutsForPr(owner, name, number)
        .then(({ removed }) => {
          if (removed.length === 0) return;
          const s = removed.length === 1 ? "" : "s";
          console.log(`  removed ${removed.length} checkout${s} of ${owner}/${name}#${number} after your review`);
        })
        .catch(() => {});
    },
  });

  async function handleApi(req: Request): Promise<Response> {
    // This server can approve pull requests and start Claude sessions, so it
    // answers only to this machine, and only to its own pages.
    if (!isLoopbackHost(req)) return forbidden("This server only answers on localhost");
    if (isCrossSite(req) && !isReportResource(req)) return forbidden("Cross-site requests are not allowed");

    const { pathname } = new URL(req.url);
    return pathname.startsWith("/api/local/") ? local.handle(req) : api.handle(req);
  }

  const server = Bun.serve({
    // Bun's default is every interface, which would put all of the above on
    // whatever network you're connected to.
    hostname: "127.0.0.1",
    port: Number(process.env.PORT ?? 5175),
    routes: {
      "/api/*": handleApi,
      "/*": index,
    },
    development: development ? { hmr: true, console: true } : false,
  });

  const { state } = await resolveLocalToken();
  console.log(`\n  easy-review  →  http://localhost:${server.port}/\n  ${describeSignIn(state)}`);
  // Said out loud, so a leftover token in a .env file isn't a silent surprise.
  const ignored = ignoredTokenVars();
  if (ignored.length > 0) {
    console.log(`  ignoring ${ignored.join(", ")} — only your GitHub CLI login is used`);
  }
  console.log("");
}
