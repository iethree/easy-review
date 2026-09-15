import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  candidateClonePaths,
  git,
  parseGitHubRemote,
  prepareWorktree,
  prRefs,
  removeWorktree,
  type ResolvedClone,
} from "./git.ts";

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                                */
/* -------------------------------------------------------------------------- */

test("parses every common GitHub remote form", () => {
  expect(parseGitHubRemote("git@github.com:metabase/metabase.git")).toBe("metabase/metabase");
  expect(parseGitHubRemote("https://github.com/metabase/metabase")).toBe("metabase/metabase");
  expect(parseGitHubRemote("https://github.com/metabase/metabase.git")).toBe("metabase/metabase");
  expect(parseGitHubRemote("ssh://git@github.com/metabase/infra-frontend.git")).toBe(
    "metabase/infra-frontend",
  );
  expect(parseGitHubRemote("https://x-token@github.com/Metabase/Metabase.git/")).toBe(
    "metabase/metabase",
  );
  expect(parseGitHubRemote("git@github.com:metabase/metabase.github.io.git")).toBe(
    "metabase/metabase.github.io",
  );
});

test("rejects remotes that aren't github.com", () => {
  expect(parseGitHubRemote("git@gitlab.com:metabase/metabase.git")).toBeNull();
  expect(parseGitHubRemote("https://github.com.evil.example/metabase/metabase")).toBeNull();
  expect(parseGitHubRemote("/tmp/some/local/path")).toBeNull();
});

test("looks in the usual places, including ~/projects/<name>", () => {
  const paths = candidateClonePaths("metabase", "metabase", "/Users/me");
  expect(paths).toContain("/Users/me/projects/metabase");
  expect(paths).toContain("/Users/me/code/metabase/metabase");
});

/* -------------------------------------------------------------------------- */
/* Real git, no network                                                        */
/* -------------------------------------------------------------------------- */

let dir: string;
let clone: ResolvedClone;
let prSha: string;
const MARKER = () => join(dir, "HOOK-RAN");

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

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "er-git-"));
  process.env.EASY_REVIEW_HOME = join(dir, "home");

  // A "GitHub" with a main branch and a pull request ref.
  const remote = join(dir, "remote.git");
  await sh(dir, "init", "--bare", "-b", "main", remote);

  const seed = join(dir, "seed");
  await sh(dir, "clone", remote, seed);
  await Bun.write(join(seed, "app.ts"), "export const answer = 41;\n");
  await sh(seed, "add", ".");
  await sh(seed, "commit", "-m", "initial");
  await sh(seed, "push", "origin", "HEAD:main");

  // The pull request: a real change, plus a hook script an attacker controls.
  await sh(seed, "checkout", "-b", "feature");
  await Bun.write(join(seed, "app.ts"), "export const answer = 42;\n");
  await mkdir(join(seed, ".husky", "_"), { recursive: true });
  for (const name of ["post-checkout", "pre-commit"]) {
    const hook = join(seed, ".husky", "_", name);
    await Bun.write(hook, `#!/bin/sh\ntouch "${MARKER()}"\n`);
    await chmod(hook, 0o755);
  }
  await sh(seed, "add", ".");
  await sh(seed, "commit", "-m", "Make the answer right");
  prSha = await sh(seed, "rev-parse", "HEAD");
  await sh(seed, "push", "origin", `HEAD:refs/pull/7/head`);

  // Your clone, set up the way husky sets up metabase's.
  const user = join(dir, "user");
  await sh(dir, "clone", remote, user);
  await sh(user, "config", "core.hooksPath", ".husky/_");
  clone = { path: user, remote: "origin", source: "detected" };
});

afterAll(async () => {
  delete process.env.EASY_REVIEW_HOME;
  await rm(dir, { recursive: true, force: true });
});

test("worktree add resolves hooks against your checkout, not the pull request's", async () => {
  // Git looks hooks up from the directory it runs in — here, your clone,
  // whose checkout has no such hook. Recorded so the next test is read right.
  await sh(clone.path, "fetch", "origin", "refs/pull/7/head");
  await sh(clone.path, "worktree", "add", "--detach", join(dir, "unsafe"), "FETCH_HEAD");
  expect(await exists(MARKER())).toBe(false);
});

test("control: inside the PR's worktree, plain git runs the PR's own hooks", async () => {
  // This is the real hole: `.husky/_` now resolves to the pull request's copy.
  await sh(join(dir, "unsafe"), "commit", "--allow-empty", "-m", "anything");
  expect(await exists(MARKER())).toBe(true);

  await rm(MARKER());
  await sh(clone.path, "worktree", "remove", "--force", join(dir, "unsafe"));
});

test("our git() runs with hooks off, even inside the PR's worktree", async () => {
  const wt = join(dir, "guarded");
  await sh(clone.path, "worktree", "add", "--detach", wt, "FETCH_HEAD");
  await git(["commit", "--allow-empty", "-m", "anything"], {
    cwd: wt,
    config: ["-c", "user.name=t", "-c", "user.email=t@t"],
  });
  expect(await exists(MARKER())).toBe(false);
  await sh(clone.path, "worktree", "remove", "--force", wt);
});

test("prepareWorktree checks out the PR without running its hooks", async () => {
  const phases: string[] = [];
  const wt = await prepareWorktree(
    clone,
    { owner: "acme", name: "app", number: 7, baseRef: "main", description: "# Make the answer right\n" },
    (p) => phases.push(p),
  );

  expect(await exists(MARKER())).toBe(false);
  expect(wt.headSha).toBe(prSha);
  expect(await sh(wt.path, "rev-parse", "HEAD")).toBe(prSha);
  expect(phases.length).toBeGreaterThan(0);

  const diff = await Bun.file(join(wt.path, ".easy-review", "pr.diff")).text();
  expect(diff).toContain("-export const answer = 41;");
  expect(diff).toContain("+export const answer = 42;");
  expect(await Bun.file(join(wt.path, ".easy-review", "commits.txt")).text()).toContain(
    "Make the answer right",
  );
  expect(await Bun.file(join(wt.path, ".easy-review", "pr.md")).text()).toContain("answer");
});

test("your branches and remote-tracking refs are untouched", async () => {
  const branches = await sh(clone.path, "for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes");
  expect(branches).not.toContain("pull");
  expect(branches).not.toContain("easy-review");
  const ours = await sh(clone.path, "for-each-ref", "--format=%(refname)", "refs/easy-review");
  expect(ours.split("\n").sort()).toEqual([prRefs(7).base, prRefs(7).head].sort());
});

test("re-reviewing the same commit reuses the checkout", async () => {
  const again = await prepareWorktree(
    clone,
    { owner: "acme", name: "app", number: 7, baseRef: "main", description: "x" },
    () => {},
  );
  expect(again.headSha).toBe(prSha);
  expect(await exists(MARKER())).toBe(false);
});

test("removing cleans up the checkout and our refs", async () => {
  const wt = await prepareWorktree(
    clone,
    { owner: "acme", name: "app", number: 7, baseRef: "main", description: "x" },
    () => {},
  );
  await removeWorktree(clone.path, wt.path, 7, true);

  expect(await exists(wt.path)).toBe(false);
  expect(await sh(clone.path, "for-each-ref", "refs/easy-review")).toBe("");
  expect(await sh(clone.path, "worktree", "list")).not.toContain(wt.path);
});
