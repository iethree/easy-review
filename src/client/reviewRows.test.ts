import { expect, test } from "bun:test";
import type { AiReviewSummary } from "../shared/aiReview.ts";
import { rowKey, targetRows } from "./reviewRows.ts";

const head = "b".repeat(40);
const base = "a".repeat(40);
let n = 0;
function job(over: Partial<AiReviewSummary>): AiReviewSummary {
  const at = `2026-11-09T10:00:${String(n++).padStart(2, "0")}Z`;
  return {
    id: `job-${n}`, kind: "pr", baseSha: null, adhoc: true, reviewerId: "general", reviewerName: "General",
    owner: "acme", name: "app", number: 7, title: "t", headSha: head, status: "done", phase: "",
    createdAt: at, startedAt: at, finishedAt: at, updatedAt: at, error: null, costUsd: null, turns: null,
    chatPhase: null, verdict: null, ...over,
  };
}

test("each diff or repository reviewed is one row, as of its latest review", () => {
  const earlier = job({ kind: "diff", number: 0, baseSha: base, title: "main → feature" });
  const later = job({ kind: "diff", number: 0, baseSha: base, title: "main → feature", reviewerId: "layers" });
  const rows = targetRows([
    job({ kind: "pr" }),
    later,
    earlier,
    job({ kind: "repo", number: 0, title: "acme/app at main" }),
  ]);
  expect(rows.map((r) => r.title)).toEqual(["main → feature", "acme/app at main"]);
  const [diff, repo] = rows;
  expect(diff?.target).toEqual({ kind: "diff", key: `acme/app@${base}..${head}`, baseSha: base });
  expect(diff?.url).toBe(`https://github.com/acme/app/compare/${base}...${head}`);
  expect(diff?.updatedAt).toBe(later.createdAt);
  expect(repo?.url).toBe(`https://github.com/acme/app/tree/${head}`);
  // Filed under what the reviews are of, never under a pull request's number.
  expect(rowKey(diff as NonNullable<typeof diff>)).toBe(`acme/app@${base}..${head}`);
  expect(rowKey({ owner: "Acme", name: "App", number: 7 })).toBe("acme/app#7");
});
