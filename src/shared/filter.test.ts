import { test, expect } from "bun:test";
import { parseQuery, matchesQuery, isEmptyQuery, type MatchInput } from "./filter.ts";

const base: MatchInput = {
  title: "Fix flaky login redirect",
  repo: "metabase/metabase",
  author: "kim",
  number: 4821,
  isDraft: false,
  ciFailed: 0,
  level: "easy",
  reviewedByMe: false,
};

const match = (query: string, pr: Partial<MatchInput> = {}) =>
  matchesQuery({ ...base, ...pr }, parseQuery(query));

test("free text matches title, repo, author and number", () => {
  expect(match("flaky")).toBe(true);
  expect(match("metabase")).toBe(true);
  expect(match("kim")).toBe(true);
  expect(match("4821")).toBe(true);
  expect(match("nonsense")).toBe(false);
});

test("all words must match", () => {
  expect(match("flaky login")).toBe(true);
  expect(match("flaky payments")).toBe(false);
});

test("author and repo tokens", () => {
  expect(match("author:kim")).toBe(true);
  expect(match("by:kim")).toBe(true);
  expect(match("author:sam")).toBe(false);
  expect(match("repo:metabase")).toBe(true);
  expect(match("in:other")).toBe(false);
});

test("difficulty tokens", () => {
  expect(match("is:easy")).toBe(true);
  expect(match("is:hard")).toBe(false);
  expect(match("is:hard", { level: "hard" })).toBe(true);
});

test("draft and failing tokens", () => {
  expect(match("is:draft")).toBe(false);
  expect(match("is:draft", { isDraft: true })).toBe(true);
  expect(match("is:ready")).toBe(true);
  expect(match("is:failing")).toBe(false);
  expect(match("is:failing", { ciFailed: 2 })).toBe(true);
});

test("tokens combine with free text", () => {
  expect(match("author:kim is:easy login")).toBe(true);
  expect(match("author:kim is:hard login")).toBe(false);
});

test("quoted phrases stay together", () => {
  expect(match('"login redirect"')).toBe(true);
  expect(match('"redirect login"')).toBe(false);
});

test("an unknown is: value degrades to free text instead of hiding everything", () => {
  expect(match("is:bogus")).toBe(false);
  expect(match("is:bogus", { title: "is:bogus in the title" })).toBe(true);
});

test("a bare colon is treated as text", () => {
  expect(match("fix:")).toBe(false);
  expect(parseQuery("fix:").words).toEqual(["fix:"]);
});

test("empty query matches everything", () => {
  expect(isEmptyQuery(parseQuery(""))).toBe(true);
  expect(isEmptyQuery(parseQuery("  "))).toBe(true);
  expect(match("")).toBe(true);
  expect(isEmptyQuery(parseQuery("author:kim"))).toBe(false);
});

test("case is ignored", () => {
  expect(match("FLAKY")).toBe(true);
  expect(match("AUTHOR:KIM")).toBe(true);
});

import { readToken, upsertToken, removeTerm, readLevel, setLevel, describeFilters, joinTerms, splitTerms } from "./filter.ts";

test("reads and replaces a token without disturbing the rest", () => {
  expect(readToken("login author:kim is:easy", "author")).toBe("kim");
  expect(upsertToken("login author:kim is:easy", "author", "sam")).toBe("login is:easy author:sam");
  expect(upsertToken("login author:kim", "author", null)).toBe("login");
  expect(upsertToken("login", "author", "kim")).toBe("login author:kim");
});

test("level editing leaves other is: tokens alone", () => {
  expect(readLevel("is:draft is:hard")).toBe("hard");
  expect(setLevel("is:draft is:hard", "easy")).toBe("is:draft is:easy");
  expect(setLevel("is:draft is:hard", null)).toBe("is:draft");
});

test("removing a chip term removes exactly that term", () => {
  expect(removeTerm("login author:kim is:easy", "author:kim")).toBe("login is:easy");
  expect(removeTerm("login", "missing")).toBe("login");
});

test("quoted phrases survive a round-trip", () => {
  expect(splitTerms('"login redirect" author:kim')).toEqual(["login redirect", "author:kim"]);
  expect(joinTerms(["login redirect", "author:kim"])).toBe('"login redirect" author:kim');
  expect(removeTerm('"login redirect" author:kim', "author:kim")).toBe('"login redirect"');
});

test("describes each active filter", () => {
  const chips = describeFilters("login author:kim is:hard");
  expect(chips.map((c) => c.label)).toEqual(['"login"', "by kim", "hard"]);
});

test("repo:owner/name is exact, so similar repo names don't leak in", () => {
  expect(match("repo:metabase/metabase")).toBe(true);
  expect(match("repo:metabase/metabase", { repo: "metabase/metabase-docs" })).toBe(false);
  expect(match("repo:metabase/infra-frontend", { repo: "metabase/infra-frontend" })).toBe(true);
  expect(match("repo:METABASE/Metabase")).toBe(true);
});

test("a bare repo word is still a loose match", () => {
  expect(match("repo:infra", { repo: "metabase/infra-frontend" })).toBe(true);
  expect(match("repo:infra")).toBe(false);
  expect(match("in:base")).toBe(true);
});

test("several repo terms mean any of them", () => {
  const q = "repo:metabase/metabase repo:metabase/infra-frontend";
  expect(match(q)).toBe(true);
  expect(match(q, { repo: "metabase/infra-frontend" })).toBe(true);
  expect(match(q, { repo: "metabase/docs" })).toBe(false);
});
