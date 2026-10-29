import { afterEach, expect, test } from "bun:test";
import { TOO_LARGE_MESSAGE } from "../../shared/diff.ts";
import type { PullRequest } from "../../shared/types.ts";
import { peek, requestDiff, reset } from "./diffStore.ts";

const realFetch = globalThis.fetch;
let calls: string[] = [];

function serve() {
  calls = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    return Response.json({ files: [] });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  reset();
});

const pr = (number: number, lines = 10) =>
  ({ owner: "o", name: "r", number, headSha: "abc", additions: lines, deletions: 0 }) as PullRequest;

test("a diff is fetched once, however often it's asked for", async () => {
  serve();
  requestDiff(pr(1));
  requestDiff(pr(1));
  expect(calls).toHaveLength(1);
  await Bun.sleep(0);
  expect(peek(pr(1))?.status).toBe("ready");
  requestDiff(pr(1));
  expect(calls).toHaveLength(1);
  // Nothing else is fetched on the side.
  expect(peek(pr(2))).toBeUndefined();
});

test("one GitHub won't serve is never asked for", () => {
  serve();
  requestDiff(pr(1, 50_000));
  expect(calls).toHaveLength(0);
  expect(peek(pr(1, 50_000))).toEqual({ status: "error", message: TOO_LARGE_MESSAGE });
});

test("after a reset it's fetched again", async () => {
  serve();
  requestDiff(pr(1));
  await Bun.sleep(0);
  reset();
  requestDiff(pr(1));
  expect(calls).toHaveLength(2);
});
