import { expect, test } from "bun:test";
import { duration } from "./AiReviewPanel.tsx";

test("a run's wall time reads in seconds, then minutes, then hours", () => {
  const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 12, 0, s)).toISOString();
  expect(duration(at(0), at(42))).toBe("42s");
  expect(duration(at(0), at(187))).toBe("3m 07s");
  expect(duration(at(0), at(3725))).toBe("1h 02m");
  expect(duration(null, at(10))).toBe("");
});
