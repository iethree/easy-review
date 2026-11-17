import { expect, test } from "bun:test";
import type { AiReviewSummary } from "../shared/aiReview.ts";
import type { CommitHistory, CommitReview, PrCommit } from "../shared/types.ts";
import { commitTimeline } from "./commitTimeline.ts";

const person = { login: "alice", avatarUrl: null, isBot: false };
const commit = (sha: string): PrCommit => ({ sha, headline: sha, author: person, committedAt: "", url: "" });
const review = (id: string, sha: string | null, at: string): CommitReview => ({
  id,
  url: "",
  author: person,
  state: "APPROVED",
  at,
  sha,
});
const job = (id: string, headSha: string, finishedAt: string | null, createdAt = "2026-09-11T00:00:00Z") =>
  ({ id, headSha, finishedAt, startedAt: null, createdAt }) as AiReviewSummary;

test("the newest commit comes first, each with its GitHub and Claude reviews, newest first", () => {
  const history: CommitHistory = {
    commits: [commit("a"), commit("b"), commit("c")],
    reviews: [review("r1", "a", "2026-09-11T10:00:00Z"), review("r2", "b", "2026-09-11T14:00:00Z")],
    earlier: 0,
  };
  const { entries, elsewhere } = commitTimeline(history, [
    job("j1", "b", "2026-09-11T13:00:00Z"),
    job("j2", "b", null, "2026-09-11T15:00:00Z"),
  ]);
  expect(entries.map((e) => e.commit.sha)).toEqual(["c", "b", "a"]);
  expect(entries.map((e) => e.reviews.map((r) => (r.kind === "github" ? r.review.id : r.job.id)))).toEqual([
    [],
    ["j2", "r2", "j1"],
    ["r1"],
  ]);
  expect(elsewhere).toEqual([]);
});

test("reviews of a commit no longer in the list, or of none known, are kept apart", () => {
  const history: CommitHistory = {
    commits: [commit("a")],
    reviews: [review("r1", "gone", "2026-09-11T10:00:00Z"), review("r2", null, "2026-09-11T11:00:00Z")],
    earlier: 0,
  };
  const { elsewhere } = commitTimeline(history, [job("j1", "", "2026-09-11T12:00:00Z")]);
  expect(elsewhere.map((r) => (r.kind === "github" ? r.review.id : r.job.id))).toEqual(["j1", "r2", "r1"]);
});
