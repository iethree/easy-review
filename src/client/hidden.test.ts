import { expect, test } from "bun:test";
import { isHidden, neighbourAfterRemoving, parseHidden, splitHidden, unhideReRequested } from "./hidden.ts";

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

test("a hidden pull request comes back when your review is asked for again", () => {
  const hidden = { "metabase/metabase#1": "2026-11-10T10:00:00Z", "metabase/metabase#2": "2026-11-10T10:00:00Z" };
  const next = unhideReRequested(hidden, [
    { ...pr(1), reviewRequestedAt: "2026-11-10T11:00:00Z" },
    { ...pr(2), reviewRequestedAt: "2026-11-10T09:00:00Z" },
  ]);
  expect(next).toEqual({ "metabase/metabase#2": "2026-11-10T10:00:00Z" });
  expect(hidden).toHaveProperty("metabase/metabase#1");
});

test("a request from before the hide, or none, leaves hidden alone", () => {
  const hidden = { "metabase/metabase#1": "2026-11-10T10:00:00Z" };
  expect(unhideReRequested(hidden, [{ ...pr(1), reviewRequestedAt: "2026-11-10T09:59:59Z" }])).toBe(hidden);
  expect(unhideReRequested(hidden, [{ ...pr(1), reviewRequestedAt: null }, pr(1)])).toBe(hidden);
  expect(unhideReRequested(hidden, [{ ...pr(1), reviewRequestedAt: "garbage" }])).toBe(hidden);
  expect(unhideReRequested(hidden, [{ ...pr(3), reviewRequestedAt: "2026-11-10T11:00:00Z" }])).toBe(hidden);
});

/** A row for Claude's reviews of a diff or a repository, as targetRows makes it. */
const run = (key: string, createdAt: string) => ({
  id: `review:${key}`,
  owner: "metabase",
  name: "metabase",
  number: 0,
  createdAt,
  target: { kind: "diff" as const, key, baseSha: "aaa" },
});

test("a diff's or a repository's reviews archive under what they're of, not as pull request #0", () => {
  const archived = { "diff:metabase/metabase@aaa..bbb": "2026-11-10T10:00:00Z" };
  const diff = run("diff:metabase/metabase@aaa..bbb", "2026-11-10T09:00:00Z");
  const other = run("repo:metabase/metabase@ccc", "2026-11-10T09:00:00Z");
  expect(isHidden(archived, diff)).toBe(true);
  expect(isHidden(archived, other)).toBe(false);
  const { shown, hidden } = splitHidden([pr(1), diff, other], archived);
  expect(shown.map((r) => r.id)).toEqual(["id-1", other.id]);
  expect(hidden.map((r) => r.id)).toEqual([diff.id]);
  // Archiving one doesn't archive pull request #0, or the reverse.
  expect(isHidden({ "metabase/metabase#0": "2026-11-10T10:00:00Z" }, diff)).toBe(false);
});

test("an archived diff comes back when Claude is set to review it again, not before", () => {
  const key = "diff:metabase/metabase@aaa..bbb";
  const archived = { [key]: "2026-11-10T10:00:00Z" };
  expect(unhideReRequested(archived, [run(key, "2026-11-10T09:00:00Z")])).toBe(archived);
  expect(unhideReRequested(archived, [run(key, "2026-11-10T11:00:00Z")])).toEqual({});
  // A pull request's own creation isn't a request for your review.
  const prArchived = { "metabase/metabase#1": "2026-11-10T10:00:00Z" };
  expect(unhideReRequested(prArchived, [{ ...pr(1), createdAt: "2026-11-10T11:00:00Z" }])).toBe(prArchived);
});
