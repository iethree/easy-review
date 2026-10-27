import { expect, test } from "bun:test";
import { initialPick } from "./ReviewerPicker.tsx";

const reviewers = [
  { id: "general", name: "General", instructions: "x" },
  { id: "security", name: "Security", instructions: "x" },
];

test("last time's choice is offered again", () => {
  expect(initialPick(reviewers, JSON.stringify(["security"]))).toEqual(["security"]);
});

test("reviewers deleted since are dropped, and an empty or broken memory means the first", () => {
  expect(initialPick(reviewers, JSON.stringify(["gone", "general"]))).toEqual(["general"]);
  expect(initialPick(reviewers, JSON.stringify(["gone"]))).toEqual(["general"]);
  expect(initialPick(reviewers, "{oops")).toEqual(["general"]);
  expect(initialPick(reviewers, null)).toEqual(["general"]);
});
