import { expect, test } from "bun:test";
import {
  draftsOnLines,
  parseDrafts,
  reviewCommit,
  withBody,
  withDraft,
  withoutDrafts,
  type DraftComment,
} from "./drafts.ts";
import { threadKey } from "./comments.ts";

const draft = (over: Partial<DraftComment> = {}): DraftComment => ({
  id: "d1",
  path: "src/app.ts",
  line: 12,
  side: "RIGHT",
  body: "This could use a test",
  commitId: "aaaaaaa",
  createdAt: "2026-09-15T12:00:00Z",
  ...over,
});

test("stored drafts are read back, and anything malformed is dropped", () => {
  const stored = JSON.stringify({
    pr1: [draft(), draft({ id: "bad", line: 0 }), draft({ id: "worse", side: "MIDDLE" as never }), "junk"],
    pr2: "not a list",
    pr3: [{ id: "half" }],
  });
  expect(parseDrafts(stored)).toEqual({ pr1: [draft()] });
  expect(parseDrafts("{not json")).toEqual({});
  expect(parseDrafts(null)).toEqual({});
  expect(parseDrafts("[]")).toEqual({});
});

test("drafts are added in order, edited in place, and removed by id", () => {
  let map = withDraft({}, "pr1", draft({ id: "a" }));
  map = withDraft(map, "pr1", draft({ id: "b", line: 20 }));
  expect(map.pr1?.map((d) => d.id)).toEqual(["a", "b"]);

  map = withBody(map, "pr1", "b", "Rename this");
  expect(map.pr1?.find((d) => d.id === "b")?.body).toBe("Rename this");

  map = withoutDrafts(map, "pr1", new Set(["a"]));
  expect(map.pr1?.map((d) => d.id)).toEqual(["b"]);
});

test("a pull request with no drafts left drops out entirely", () => {
  const map = withoutDrafts({ pr1: [draft()], pr2: [draft()] }, "pr1", new Set(["d1"]));
  expect(Object.keys(map)).toEqual(["pr2"]);
});

/**
 * Only the drafts that were actually posted get cleared: one added while the
 * review was on its way stays a draft.
 */
test("removing the ones that were posted keeps any added meanwhile", () => {
  const map = { pr1: [draft({ id: "posted" }), draft({ id: "added-meanwhile" })] };
  expect(withoutDrafts(map, "pr1", new Set(["posted"])).pr1?.map((d) => d.id)).toEqual([
    "added-meanwhile",
  ]);
});

test("a review goes on the one commit its comments were written against", () => {
  expect(reviewCommit([])).toEqual({ commitId: null, error: null });
  expect(reviewCommit([draft(), draft({ id: "d2" })])).toEqual({ commitId: "aaaaaaa", error: null });
});

test("comments written on two different commits can't go up together", () => {
  const result = reviewCommit([draft(), draft({ id: "d2", commitId: "bbbbbbb" })]);
  expect(result.commitId).toBeNull();
  expect(result.error).toContain("different commits");
});

test("only drafts written on the commit on screen are placed on its lines", () => {
  const onScreen = draft({ id: "now" });
  const older = draft({ id: "old", commitId: "0000000" });
  const map = draftsOnLines([onScreen, older], "aaaaaaa");
  expect(map.get(threadKey("src/app.ts", "RIGHT", 12))?.map((d) => d.id)).toEqual(["now"]);
  expect(draftsOnLines([onScreen], null).size).toBe(0);
});
