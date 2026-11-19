import { expect, test } from "bun:test";
import type { PullRequest } from "../shared/types.ts";
import { dueOnReturn, lingering, RETURN_MS } from "./queuePoll.ts";

const pr = (id: string) => ({ id }) as PullRequest;

test("rows a background fetch dropped stay; rows it still has, or brought, don't count", () => {
  expect(lingering([pr("a"), pr("b"), pr("c")], [pr("b"), pr("d")]).map((p) => p.id)).toEqual(["a", "c"]);
  expect(lingering([pr("a")], [pr("a")])).toEqual([]);
  expect(lingering([], [pr("a")])).toEqual([]);
});

test("coming back to the app fetches the queue at most once a minute", () => {
  const started = 1_000_000;
  expect(dueOnReturn(started + 5_000, started)).toBe(false);
  expect(dueOnReturn(started + RETURN_MS - 1, started)).toBe(false);
  expect(dueOnReturn(started + RETURN_MS, started)).toBe(true);
  // Nothing fetched yet (the first load is on its way, or failed long ago).
  expect(dueOnReturn(started, 0)).toBe(true);
});
