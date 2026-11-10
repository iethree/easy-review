import { expect, test } from "bun:test";
import { parseTarget } from "./newReview.ts";

test("a repository, typed", () => {
  expect(parseTarget("metabase/metabase")).toEqual({ owner: "metabase", name: "metabase" });
  expect(parseTarget("  acme/app.js ")).toEqual({ owner: "acme", name: "app.js" });
  expect(parseTarget("acme/app#123")).toEqual({ owner: "acme", name: "app", kind: "pr", number: 123 });
  expect(parseTarget("acme")).toBeNull();
  expect(parseTarget("")).toBeNull();
});

test("a GitHub link fills in what it points at", () => {
  expect(parseTarget("https://github.com/acme/app")).toEqual({ owner: "acme", name: "app" });
  expect(parseTarget("github.com/acme/app.git")).toEqual({ owner: "acme", name: "app" });
  expect(parseTarget("https://github.com/acme/app/pull/42/files")).toEqual({
    owner: "acme",
    name: "app",
    kind: "pr",
    number: 42,
  });
  expect(parseTarget("https://github.com/acme/app/compare/main...feature/x")).toEqual({
    owner: "acme",
    name: "app",
    kind: "diff",
    base: "main",
    head: "feature/x",
  });
  expect(parseTarget("https://github.com/acme/app/compare/v1.0..v1.1")).toMatchObject({ base: "v1.0", head: "v1.1" });
  expect(parseTarget("https://github.com/acme/app/tree/release/2.0")).toEqual({
    owner: "acme",
    name: "app",
    kind: "repo",
    head: "release/2.0",
  });
});

test("anything else isn't a target", () => {
  expect(parseTarget("https://gitlab.com/acme/app")).toBeNull();
  expect(parseTarget("https://github.com/acme")).toBeNull();
  expect(parseTarget("not a repo at all")).toBeNull();
});
