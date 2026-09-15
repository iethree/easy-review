import { expect, test } from "bun:test";
import { isHidden, neighbourAfterRemoving, parseHidden, splitHidden } from "./hidden.ts";

const pr = (number: number, repo = "metabase/metabase") => {
  const [owner = "", name = ""] = repo.split("/");
  return { id: `id-${number}`, owner, name, number };
};

test("stored data is read defensively", () => {
  expect(parseHidden(null)).toEqual({});
  expect(parseHidden("not json")).toEqual({});
  expect(parseHidden("[1,2]")).toEqual({});
  expect(parseHidden('{"a/b#1":"2026-09-11T10:00:00Z","a/b#2":5}')).toEqual({
    "a/b#1": "2026-09-11T10:00:00Z",
  });
});

test("hidden pull requests leave the queue", () => {
  const hidden = { "metabase/metabase#2": "2026-09-11T10:00:00Z" };
  const { shown, hidden: tucked } = splitHidden([pr(1), pr(2), pr(3)], hidden);
  expect(shown.map((p) => p.number)).toEqual([1, 3]);
  expect(tucked.map((p) => p.number)).toEqual([2]);
});

test("the Hidden tab lists the most recently hidden first", () => {
  const hidden = {
    "metabase/metabase#1": "2026-09-11T09:00:00Z",
    "metabase/metabase#2": "2026-09-11T11:00:00Z",
    "metabase/metabase#3": "2026-09-11T10:00:00Z",
  };
  expect(splitHidden([pr(1), pr(2), pr(3)], hidden).hidden.map((p) => p.number)).toEqual([2, 3, 1]);
});

test("the same number in another repo is a different pull request", () => {
  const hidden = { "metabase/metabase#7": "2026-09-11T10:00:00Z" };
  expect(isHidden(hidden, pr(7))).toBe(true);
  expect(isHidden(hidden, pr(7, "metabase/infra-frontend"))).toBe(false);
});

test("matching ignores case, as GitHub does", () => {
  const hidden = { "metabase/metabase#7": "2026-09-11T10:00:00Z" };
  expect(isHidden(hidden, pr(7, "Metabase/Metabase"))).toBe(true);
});

test("after hiding, the selection moves to the next row, or the one before", () => {
  const list = [pr(1), pr(2), pr(3)];
  expect(neighbourAfterRemoving(list, "id-2")).toBe("id-3");
  expect(neighbourAfterRemoving(list, "id-3")).toBe("id-2");
  expect(neighbourAfterRemoving([pr(1)], "id-1")).toBeNull();
  expect(neighbourAfterRemoving(list, "id-9")).toBeNull();
});
