import { expect, test } from "bun:test";
import { cleanLooks, REVIEWER_COLORS, REVIEWER_ICONS, withLook } from "./reviewerLook.ts";

test("a dozen icons and a dozen colours, none twice", () => {
  expect(new Set(REVIEWER_ICONS).size).toBe(12);
  expect(new Set(REVIEWER_COLORS).size).toBe(12);
});

test("stored looks keep only icons and colours that exist", () => {
  expect(
    cleanLooks({
      security: { icon: "shield", color: "red" },
      perf: { icon: "rocket", color: "teal" },
      odd: { icon: 3, color: "plaid" },
      gone: null,
    }),
  ).toEqual({ security: { icon: "shield", color: "red" }, perf: { color: "teal" } });
  expect(cleanLooks(undefined)).toEqual({});
  expect(cleanLooks([{ icon: "bug" }])).toEqual({});
});

test("changing one reviewer's look leaves the rest, and an empty look is dropped", () => {
  const looks = { a: { icon: "bug" as const }, b: { color: "red" as const } };
  expect(withLook(looks, "a", { icon: "eye", color: "blue" })).toEqual({ a: { icon: "eye", color: "blue" }, b: { color: "red" } });
  expect(withLook(looks, "b", {})).toEqual({ a: { icon: "bug" } });
  expect(looks).toEqual({ a: { icon: "bug" }, b: { color: "red" } });
});
