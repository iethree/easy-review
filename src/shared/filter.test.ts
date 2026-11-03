import { test, expect } from "bun:test";
import {
  parseQuery,
  matchesQuery,
  isEmptyQuery,
  readAiReviewed,
  setAiReviewed,
  type MatchInput,
} from "./filter.ts";

const base: MatchInput = {
  title: "Fix flaky login redirect",
  repo: "metabase/metabase",
  author: "kim",
  number: 4821,
  isDraft: false,
  ciFailed: 0,
  reviewedByMe: false,
  aiReviewed: false,
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

test("draft and failing tokens", () => {
  expect(match("is:draft")).toBe(false);
  expect(match("is:draft", { isDraft: true })).toBe(true);
  expect(match("is:ready")).toBe(true);
  expect(match("is:failing")).toBe(false);
  expect(match("is:failing", { ciFailed: 2 })).toBe(true);
});

test("is:ai-reviewed keeps pull requests a Claude review has finished; is:ai is short for it", () => {
  expect(match("is:ai-reviewed")).toBe(false);
  expect(match("is:ai-reviewed", { aiReviewed: true })).toBe(true);
  expect(match("is:ai", { aiReviewed: true })).toBe(true);
  expect(match("is:ai")).toBe(false);
  expect(isEmptyQuery(parseQuery("is:ai-reviewed"))).toBe(false);
  expect(describeFilters("is:ai")).toEqual([{ term: "is:ai", label: "AI reviewed", color: "violet" }]);
});

test("the AI-reviewed toggle adds the term, and takes either spelling out", () => {
  expect(setAiReviewed("kim is:draft", true)).toBe("kim is:draft is:ai-reviewed");
  expect(setAiReviewed("kim is:ai-reviewed", true)).toBe("kim is:ai-reviewed");
  expect(setAiReviewed("is:ai kim is:draft", false)).toBe("kim is:draft");
  expect(readAiReviewed("kim is:ai")).toBe(true);
  expect(readAiReviewed("kim is:draft")).toBe(false);
});

test("tokens combine with free text", () => {
  expect(match("author:kim is:ready login")).toBe(true);
  expect(match("author:kim is:draft login")).toBe(false);
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

import { readToken, upsertToken, removeTerm, describeFilters, joinTerms, splitTerms } from "./filter.ts";

test("reads and replaces a token without disturbing the rest", () => {
  expect(readToken("login author:kim is:draft", "author")).toBe("kim");
  expect(upsertToken("login author:kim is:draft", "author", "sam")).toBe("login is:draft author:sam");
  expect(upsertToken("login author:kim", "author", null)).toBe("login");
  expect(upsertToken("login", "author", "kim")).toBe("login author:kim");
});

test("removing a chip term removes exactly that term", () => {
  expect(removeTerm("login author:kim is:draft", "author:kim")).toBe("login is:draft");
  expect(removeTerm("login", "missing")).toBe("login");
});

test("quoted phrases survive a round-trip", () => {
  expect(splitTerms('"login redirect" author:kim')).toEqual(["login redirect", "author:kim"]);
  expect(joinTerms(["login redirect", "author:kim"])).toBe('"login redirect" author:kim');
  expect(removeTerm('"login redirect" author:kim', "author:kim")).toBe('"login redirect"');
});

test("describes each active filter", () => {
  const chips = describeFilters("login author:kim is:draft");
  expect(chips.map((c) => c.label)).toEqual(['"login"', "by kim", "draft"]);
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
