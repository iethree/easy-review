import { expect, test } from "bun:test";
import type { AiReviewSummary } from "../shared/aiReview.ts";
import { resolveTab, reviewTab, tabOrder } from "./previewTabs.ts";

const review = (id: string, reviewerId: string) => ({ id, reviewerId }) as AiReviewSummary;
const general = review("g1", "general");
const security = review("s1", "security");
const legacy = review("old", "");

test("a reviewer's tab shows that reviewer's review", () => {
  expect(resolveTab(reviewTab("security"), [general, security])).toEqual({ tab: "review:security", review: security });
});

test("where that reviewer hasn't looked, another's review shows; with none, the description", () => {
  expect(resolveTab(reviewTab("security"), [general])).toEqual({ tab: "review:general", review: general });
  expect(resolveTab(reviewTab("security"), [])).toEqual({ tab: "description" });
  expect(resolveTab("diff", [general])).toEqual({ tab: "diff" });
});

test("a review from before there were reviewers still has a tab with a value", () => {
  // Its reviewer is "": as a tab's value that made Mantine throw, and the page went blank.
  const { tab } = resolveTab(reviewTab(""), [legacy, general]);
  expect(tab).toBe("review:");
  expect(tabOrder([legacy, general])).toEqual(["description", "diff", "review:", "review:general"]);
});
