import { afterAll, expect, test } from "bun:test";
import { forbidden, isCrossSite, isLoopbackHost } from "../src/server/security.ts";
import { APP_ORIGIN, forward, forwardRequestHeaders, forwardResponseHeaders, targetUrl } from "./proxy.ts";

// A stand-in for the real server, with the same checks in front of it.
const upstream = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    if (!isLoopbackHost(req)) return forbidden("This server only answers on localhost");
    if (isCrossSite(req)) return forbidden("Cross-site requests are not allowed");
    const { pathname, search } = new URL(req.url);
    return Response.json({ method: req.method, pathname, search, body: await req.text() });
  },
});
afterAll(() => upstream.stop(true));
const origin = `http://127.0.0.1:${upstream.port}`;

/** A request as the app window sends it. */
const fromApp = (path: string, init: RequestInit = {}) =>
  new Request(`${APP_ORIGIN}${path}`, {
    ...init,
    headers: { origin: APP_ORIGIN, "sec-fetch-site": "same-origin", ...init.headers },
  });

test("the path and query carry over to the server", () => {
  expect(targetUrl(`${APP_ORIGIN}/api/review?x=1&y=2`, origin)).toBe(`${origin}/api/review?x=1&y=2`);
});

test("the app's POSTs get past the server's cross-site check", async () => {
  const res = await forward(
    fromApp("/api/review?draft=1", { method: "POST", body: '{"a":1}', headers: { "content-type": "application/json" } }),
    origin,
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ method: "POST", pathname: "/api/review", search: "?draft=1", body: '{"a":1}' });
});

test("a request from any other origin is refused before it is forwarded", async () => {
  const res = await forward(
    new Request(`${APP_ORIGIN}/api/review`, { method: "POST", headers: { origin: "https://evil.example" } }),
    origin,
  );
  expect(res.status).toBe(403);
});

test("origin, host and fetch-metadata headers are not forwarded; the rest are", () => {
  const out = forwardRequestHeaders(
    new Headers({
      origin: APP_ORIGIN,
      host: "app",
      referer: `${APP_ORIGIN}/`,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "content-type": "application/json",
      accept: "application/json",
    }),
  );
  expect([...out.keys()].sort()).toEqual(["accept", "content-type"]);
});

test("encoding and length headers are dropped from responses, since fetch decoded the body", () => {
  const out = forwardResponseHeaders(
    new Headers({ "content-encoding": "gzip", "content-length": "10", "content-type": "text/html", etag: '"x"' }),
  );
  expect([...out.keys()].sort()).toEqual(["content-type", "etag"]);
});
