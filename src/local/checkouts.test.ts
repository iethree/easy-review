import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AiReviewJob } from "../shared/aiReview.ts";
import { isStale, parseCheckoutDir } from "./checkouts.ts";
import { prepareWorktree, prRefs, type ResolvedClone } from "./git.ts";
import { ReviewJobs } from "./jobs.ts";

const DAY = 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                                */
/* -------------------------------------------------------------------------- */

test("a checkout's folder name gives its pull request and commit", () => {
  expect(parseCheckoutDir("pr-82101-1488e5ad56")).toEqual({ number: 82101, sha: "1488e5ad56" });
  expect(parseCheckoutDir("pr-7-abc")).toBeNull();
  expect(parseCheckoutDir("pr-x-1488e5ad56")).toBeNull();
  expect(parseCheckoutDir(".DS_Store")).toBeNull();
});

test("a checkout goes stale after 7 days unused — never while a review runs in it", () => {
  const now = Date.parse("2026-09-15T12:00:00Z");
  const ago = (days: number) => new Date(now - days * DAY).toISOString();
  expect(isStale({ inUse: false, lastUsedAt: ago(8) }, now)).toBe(true);
  expect(isStale({ inUse: false, lastUsedAt: ago(7) }, now)).toBe(false);
  expect(isStale({ inUse: false, lastUsedAt: ago(1) }, now)).toBe(false);
  expect(isStale({ inUse: true, lastUsedAt: ago(30) }, now)).toBe(false);
});

/* -------------------------------------------------------------------------- */
/* Real git, no network                                                        */
/* -------------------------------------------------------------------------- */

let dir: string;
let home: string;
let clone: ResolvedClone;
/** PR 7, with a saved review that ran in it. */
let reviewed: string;
/** PR 8, with no review on record — the kind that quietly takes up space. */
let orphan: string;
let jobs: ReviewJobs;
let savedId: string;

async function sh(cwd: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`git ${args.join(" ")}: ${err}`);
  return out.trim();
}

const exists = (p: string) => stat(p).then(() => true, () => false);

function savedReview(over: Partial<AiReviewJob>): AiReviewJob {
  const at = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    owner: "acme",
    name: "app",
    number: 7,
    title: "Make the answer right",
    headSha: "",
    baseRef: "main",
    status: "done",
    phase: "Review ready",
    createdAt: at,
    startedAt: at,
    finishedAt: at,
    updatedAt: at,
    error: null,
    costUsd: null,
    turns: null,
    review: "Looks good.",
    activity: [],
    clonePath: null,
    cloneSource: "detected",
    worktreePath: null,
    sessionId: "session-1",
    model: null,
    stderrTail: null,
    ...over,
  };
}

beforeAll(async () => {
  // Real path: on macOS the temp dir sits behind a /var → /private/var symlink,
  // and git records resolved paths.
  dir = await realpath(await mkdtemp(join(tmpdir(), "er-checkouts-")));
  home = join(dir, "home");
  process.env.EASY_REVIEW_HOME = home;

  // A "GitHub" with a main branch and two pull requests.
  const remote = join(dir, "remote.git");
  await sh(dir, "init", "--bare", "-b", "main", remote);
  const seed = join(dir, "seed");
  await sh(dir, "clone", remote, seed);
  await Bun.write(join(seed, "app.ts"), "export const answer = 41;\n");
  await sh(seed, "add", ".");
  await sh(seed, "commit", "-m", "initial");
  await sh(seed, "push", "origin", "HEAD:main");
  const base = await sh(seed, "rev-parse", "HEAD");
  for (const number of [7, 8]) {
    await sh(seed, "checkout", "-B", `pr-${number}`, base);
    await Bun.write(join(seed, "app.ts"), `export const answer = ${40 + number};\n`);
    await sh(seed, "commit", "-am", `PR ${number}`);
    await sh(seed, "push", "origin", `HEAD:refs/pull/${number}/head`);
  }

  const user = join(dir, "user");
  await sh(dir, "clone", remote, user);
  clone = { path: user, remote: "origin", source: "detected" };

  const pr = (number: number) => ({ owner: "acme", name: "app", number, baseRef: "main", description: "x" });
  reviewed = (await prepareWorktree(clone, pr(7), () => {})).path;
  orphan = (await prepareWorktree(clone, pr(8), () => {})).path;

  const saved = savedReview({ clonePath: user, worktreePath: reviewed });
  savedId = saved.id;
  await mkdir(join(home, "reviews"), { recursive: true });
  await Bun.write(join(home, "reviews", `${saved.id}.json`), JSON.stringify(saved));

  jobs = new ReviewJobs(async () => undefined, { autoSweep: false });
  await jobs.init();
});

afterAll(async () => {
  delete process.env.EASY_REVIEW_HOME;
  await rm(dir, { recursive: true, force: true });
});

test("every checkout is listed, including one no review points at any more", async () => {
  const list = await jobs.listCheckouts();
  expect(list.map((c) => c.path).sort()).toEqual([reviewed, orphan].sort());
  expect(list.find((c) => c.path === reviewed)).toMatchObject({
    number: 7,
    reviews: 1,
    title: "Make the answer right",
    inUse: false,
    clonePath: clone.path,
  });
  // Nothing on record, but git's own pointer still says whose checkout it is.
  expect(list.find((c) => c.path === orphan)).toMatchObject({
    number: 8,
    reviews: 0,
    title: null,
    clonePath: clone.path,
  });
});

test("sizes are measured when asked for", async () => {
  for (const checkout of await jobs.listCheckouts({ sizes: true })) {
    expect(checkout.sizeBytes).toBeGreaterThan(0);
  }
});

test("a path that isn't a checkout is refused, and nothing is touched", async () => {
  const result = await jobs.removeCheckouts([clone.path, join(home, "reviews"), "/"]);
  expect(result.removed).toEqual([]);
  expect(result.failed.map((f) => f.error)).toEqual(["Not a checkout", "Not a checkout", "Not a checkout"]);
  expect(await exists(join(clone.path, "app.ts"))).toBe(true);
  expect(await exists(join(home, "reviews", `${savedId}.json`))).toBe(true);
  expect(await exists(reviewed)).toBe(true);
});

test("the sweep leaves checkouts used within 7 days alone", async () => {
  const result = await jobs.sweepStaleCheckouts(Date.now() + 6 * DAY);
  expect(result.removed).toEqual([]);
  expect(await exists(reviewed)).toBe(true);
  expect(await exists(orphan)).toBe(true);
});

test("submitting your review removes that PR's checkout and refs, and keeps the review", async () => {
  // Owner casing from GitHub needn't match the folder's.
  const result = await jobs.removeCheckoutsForPr("ACME", "app", 7);
  expect(result).toEqual({ removed: [reviewed], failed: [] });

  expect(await exists(reviewed)).toBe(false);
  expect(await sh(clone.path, "worktree", "list")).not.toContain("pr-7-");
  const refs = await sh(clone.path, "for-each-ref", "--format=%(refname)", "refs/easy-review");
  expect(refs).not.toContain("pr-7/");
  // The other pull request is none of its business.
  expect(refs).toContain(prRefs(8).head);
  expect(await exists(orphan)).toBe(true);

  // The review stays; only the way back into its checkout is gone.
  const saved = jobs.get(savedId);
  expect(saved?.review).toBe("Looks good.");
  expect(saved?.worktreePath).toBeNull();
});

test("the sweep removes checkouts unused for more than 7 days", async () => {
  const result = await jobs.sweepStaleCheckouts(Date.now() + 8 * DAY);
  expect(result).toEqual({ removed: [orphan], failed: [] });
  expect(await exists(orphan)).toBe(false);
  expect(await sh(clone.path, "for-each-ref", "refs/easy-review")).toBe("");
  expect(await jobs.listCheckouts()).toEqual([]);
});
