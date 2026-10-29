import { test, expect } from "bun:test";
import { isCrossSite, isLoopbackHost, isReportResource } from "./security.ts";

const req = (headers: Record<string, string>, url = "http://localhost:5175/api/review") =>
  new Request(url, { method: "POST", headers });

test("the app's own requests are allowed", () => {
  expect(
    isCrossSite(req({ origin: "http://localhost:5175", "sec-fetch-site": "same-origin" })),
  ).toBe(false);
});

test("a request from another site is refused", () => {
  expect(isCrossSite(req({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).toBe(
    true,
  );
});

test("Origin alone is enough to catch it", () => {
  expect(isCrossSite(req({ origin: "https://evil.example" }))).toBe(true);
});

test("Sec-Fetch-Site alone is enough to catch it", () => {
  expect(isCrossSite(req({ "sec-fetch-site": "cross-site" }))).toBe(true);
  expect(isCrossSite(req({ "sec-fetch-site": "same-site" }))).toBe(true);
});

test("another port on localhost is a different origin", () => {
  expect(isCrossSite(req({ origin: "http://localhost:3000" }))).toBe(true);
});

test("non-browser clients, which send neither header, are allowed", () => {
  expect(isCrossSite(req({}))).toBe(false);
});

test("loopback hosts pass, anything else fails", () => {
  const withHost = (host: string) => new Request("http://x/", { headers: { host } });
  expect(isLoopbackHost(withHost("localhost:5175"))).toBe(true);
  expect(isLoopbackHost(withHost("127.0.0.1:5175"))).toBe(true);
  expect(isLoopbackHost(withHost("[::1]:5175"))).toBe(true);
  expect(isLoopbackHost(withHost("LOCALHOST"))).toBe(true);
  // DNS rebinding: a real name that happens to resolve to 127.0.0.1.
  expect(isLoopbackHost(withHost("evil.example:5175"))).toBe(false);
  expect(isLoopbackHost(withHost("localhost.evil.example"))).toBe(false);
  expect(isLoopbackHost(withHost("192.168.1.20:5175"))).toBe(false);
});

test("a review's report, sandboxed with no origin, can load its own files — and only that", () => {
  const report = "http://localhost:5175/api/local/reviews/0d9df378-d21a-4a83-8d72-ca2c79bea36a/report/assets/app.js";
  const get = (headers: Record<string, string>, url = report, method = "GET") => new Request(url, { method, headers });
  const sandboxed = { origin: "null", "sec-fetch-site": "cross-site" };
  for (const dest of ["script", "style", "font", "image"]) {
    expect(isReportResource(get({ ...sandboxed, "sec-fetch-dest": dest }))).toBe(true);
  }
  // Not a fetch, not a write, not another route.
  expect(isReportResource(get({ ...sandboxed, "sec-fetch-dest": "empty" }))).toBe(false);
  expect(isReportResource(get({ ...sandboxed, "sec-fetch-dest": "script" }, report, "POST"))).toBe(false);
  expect(
    isReportResource(get({ ...sandboxed, "sec-fetch-dest": "script" }, "http://localhost:5175/api/local/reviews")),
  ).toBe(false);
  expect(
    isReportResource(
      get({ ...sandboxed, "sec-fetch-dest": "image" }, "http://localhost:5175/api/local/reviews/x/report/a.png"),
    ),
  ).toBe(false);
});
