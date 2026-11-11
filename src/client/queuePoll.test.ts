import { expect, test } from "bun:test";
import type { PullRequest } from "../shared/types.ts";
import { lingering } from "./queuePoll.ts";

const pr = (id: string) => ({ id }) as PullRequest;

test("rows a background fetch dropped stay; rows it still has, or brought, don't count", () => {
  expect(lingering([pr("a"), pr("b"), pr("c")], [pr("b"), pr("d")]).map((p) => p.id)).toEqual(["a", "c"]);
  expect(lingering([pr("a")], [pr("a")])).toEqual([]);
  expect(lingering([], [pr("a")])).toEqual([]);
});
