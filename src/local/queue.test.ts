import { expect, test } from "bun:test";
import { nextReviews } from "./queue.ts";

let n = 0;
const job = (reviewerId: string, concurrency: number | null = null) => ({
  id: `${reviewerId}-${++n}`,
  reviewerId,
  concurrency,
  createdAt: `2026-11-16T10:00:${String(n).padStart(2, "0")}Z`,
});
const ids = (jobs: { id: string }[]) => jobs.map((j) => j.id);

test("oldest first, up to the total", () => {
  const queued = [job("a"), job("b"), job("c")];
  expect(ids(nextReviews(queued, [], 2).start)).toEqual(ids(queued.slice(0, 2)));
  expect(nextReviews(queued, [job("x"), job("y")], 2).start).toEqual([]);
});

test("a reviewer with a limit runs no more than that, and the reviews behind it go ahead", () => {
  const heavy1 = job("heavy", 1);
  const heavy2 = job("heavy", 1);
  const light = job("light");
  const step = nextReviews([heavy1, heavy2, light], [], 4);
  expect(ids(step.start)).toEqual(ids([heavy1, light]));
  expect(ids(step.heldByReviewer)).toEqual(ids([heavy2]));
});

test("the reviewer's running reviews count against its limit", () => {
  const step = nextReviews([job("heavy", 2), job("heavy", 2)], [job("heavy", 2)], 6);
  expect(step.start).toHaveLength(1);
  expect(step.heldByReviewer).toHaveLength(1);
});

test("no limit of its own: as many as the total allows", () => {
  expect(nextReviews([job("a"), job("a"), job("a")], [job("a")], 3).start).toHaveLength(2);
});
