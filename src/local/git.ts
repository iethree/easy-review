/**
 * Getting a pull request's code into a worktree.
 *
 * Every git command here runs with hooks and fsmonitor switched off. That is
 * not tidiness: a clone set up with husky has `core.hooksPath=.husky/_`, a
 * relative path, which inside a new worktree points at the *pull request's*
 * copy of those scripts — so a plain `git worktree add` would run code the PR
 * author wrote, on your machine, before any review started.
 */

import { mkdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { childEnv } from "./env.ts";
import { localPaths } from "./paths.ts";
import type { CloneSource } from "../shared/aiReview.ts";

/** Prepended to every invocation. */
const SAFE_CONFIG = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"];

/**
 * For clones we make ourselves: authenticate through the GitHub CLI rather
 * than whatever credential helper happens to be configured (or none, which
 * would leave git unable to fetch a private repo).
 */
const GH_CREDENTIALS = ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"];

export class GitError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

interface GitOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Extra `-c key=value` pairs, placed before the subcommand. */
  config?: string[];
  /** Registered while running, so a cancelled review can kill it. */
  onSpawn?: (proc: { kill: () => void }) => void;
}

export async function git(args: string[], opts: GitOptions = {}): Promise<string> {
  const proc = Bun.spawn(["git", ...SAFE_CONFIG, ...(opts.config ?? []), ...args], {
    cwd: opts.cwd,
    env: childEnv(),
    stdout: "pipe",
    stderr: "pipe",
  });
  opts.onSpawn?.(proc);

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, opts.timeoutMs ?? 120_000);

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);

  if (timedOut) throw new GitError(`git ${args[0]} timed out`, stderr);
  if (code !== 0) {
    const detail = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400);
    throw new GitError(`git ${args[0]} failed: ${detail || `exit ${code}`}`, stderr);
  }
  return stdout;
}

/* -------------------------------------------------------------------------- */
/* Finding a clone                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `owner/name` from any GitHub remote URL we're likely to meet:
 * git@github.com:o/n.git, https://github.com/o/n(.git), ssh://git@github.com/o/n.git
 */
export function parseGitHubRemote(url: string): string | null {
  const match = url
    .trim()
    .match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  if (!match?.[1] || !match[2]) return null;
  return `${match[1]}/${match[2]}`.toLowerCase();
}

/** The name of the remote in `clonePath` that points at owner/name, if any. */
export async function findRemote(clonePath: string, repo: string): Promise<string | null> {
  const out = await git(["remote", "-v"], { cwd: clonePath, timeoutMs: 10_000 }).catch(() => "");
  const wanted = repo.toLowerCase();
  for (const line of out.split("\n")) {
    const [remote, url, kind] = line.split(/\s+/);
    if (remote && url && kind === "(fetch)" && parseGitHubRemote(url) === wanted) return remote;
  }
  return null;
}

/** Where people usually keep clones. The remote is always checked, never assumed. */
export function candidateClonePaths(owner: string, name: string, home = homedir()): string[] {
  const roots = ["projects", "code", "src", "dev", "work", "repos", "git", "github", "Developer"];
  const paths: string[] = [];
  for (const root of roots) {
    paths.push(join(home, root, name), join(home, root, owner, name));
  }
  paths.push(join(home, name));
  return paths;
}

async function isGitDir(path: string): Promise<boolean> {
  try {
    await stat(join(path, ".git"));
    return true;
  } catch {
    return false;
  }
}

export interface ResolvedClone {
  path: string;
  remote: string;
  source: CloneSource;
}

/**
 * 1. a path you configured, 2. an existing clone in a usual place, 3. a clone
 * of our own under ~/.easy-review/repos (blobless, so the first one is quick).
 */
export async function resolveClone(
  owner: string,
  name: string,
  configured: Map<string, string>,
  onPhase: (phase: string) => void,
): Promise<ResolvedClone> {
  const repo = `${owner}/${name}`.toLowerCase();

  const explicit = configured.get(repo);
  if (explicit) {
    if (!(await isGitDir(explicit))) {
      throw new Error(`The clone configured for ${repo} (${explicit}) isn't a git repository.`);
    }
    const remote = await findRemote(explicit, repo);
    if (!remote) {
      throw new Error(`${explicit} has no remote pointing at github.com/${repo}.`);
    }
    return { path: explicit, remote, source: "configured" };
  }

  for (const path of candidateClonePaths(owner, name)) {
    if (!(await isGitDir(path))) continue;
    const remote = await findRemote(path, repo);
    if (remote) return { path, remote, source: "detected" };
  }

  const managed = join(localPaths().repos, owner, name);
  if (!(await isGitDir(managed))) {
    onPhase(`Cloning ${repo} (first review of this repository)`);
    await mkdir(join(localPaths().repos, owner), { recursive: true });
    await git(
      ["clone", "--filter=blob:none", "--no-checkout", `https://github.com/${owner}/${name}.git`, managed],
      { config: GH_CREDENTIALS, timeoutMs: 15 * 60_000 },
    );
  }
  return { path: managed, remote: "origin", source: "managed" };
}

/* -------------------------------------------------------------------------- */
/* The worktree                                                                */
/* -------------------------------------------------------------------------- */

export interface WorktreeRequest {
  owner: string;
  name: string;
  number: number;
  baseRef: string;
  /** Title, author and description, written out for the reviewer to read. */
  description: string;
}

export interface PreparedWorktree {
  path: string;
  /** What was actually fetched — the PR may have moved since the list loaded. */
  headSha: string;
}

export function prRefs(number: number) {
  return {
    head: `refs/easy-review/pr-${number}/head`,
    base: `refs/easy-review/pr-${number}/base`,
  };
}

export function worktreePathFor(owner: string, name: string, number: number, sha: string): string {
  const safe = (s: string) => s.replace(/[^\w.-]/g, "_");
  return join(localPaths().worktrees, safe(owner), safe(name), `pr-${number}-${sha.slice(0, 10)}`);
}

export async function prepareWorktree(
  clone: ResolvedClone,
  pr: WorktreeRequest,
  onPhase: (phase: string) => void,
  onSpawn?: GitOptions["onSpawn"],
): Promise<PreparedWorktree> {
  const refs = prRefs(pr.number);
  const credentials = clone.source === "managed" ? GH_CREDENTIALS : [];

  // Into our own ref namespace, so your branches and remote-tracking refs are
  // left exactly as they were.
  onPhase(`Fetching #${pr.number} and ${pr.baseRef}`);
  await git(
    [
      "fetch",
      "--no-tags",
      "--force",
      clone.remote,
      `+refs/pull/${pr.number}/head:${refs.head}`,
      `+refs/heads/${pr.baseRef}:${refs.base}`,
    ],
    { cwd: clone.path, config: credentials, timeoutMs: 5 * 60_000, onSpawn },
  );

  const headSha = (await git(["rev-parse", refs.head], { cwd: clone.path })).trim();
  const path = worktreePathFor(pr.owner, pr.name, pr.number, headSha);

  // Re-reviewing the same commit reuses its checkout.
  const existing = await git(["rev-parse", "HEAD"], { cwd: path, timeoutMs: 10_000 }).catch(
    () => null,
  );
  if (existing?.trim() !== headSha) {
    onPhase("Checking out the pull request");
    await rm(path, { recursive: true, force: true });
    await git(["worktree", "prune"], { cwd: clone.path }).catch(() => {});
    await mkdir(join(path, ".."), { recursive: true });
    await git(["worktree", "add", "--detach", path, headSha], {
      cwd: clone.path,
      config: credentials,
      timeoutMs: 10 * 60_000,
      onSpawn,
    });
  }

  onPhase("Writing the diff for the reviewer");
  const noDrivers = ["--no-ext-diff", "--no-textconv"];
  const [diff, commits] = await Promise.all([
    // Three dots: against the merge base, which is what GitHub shows.
    git(["diff", ...noDrivers, `${refs.base}...HEAD`], { cwd: path, timeoutMs: 2 * 60_000 }),
    git(["log", ...noDrivers, "--format=%h %an: %s", `${refs.base}..HEAD`], { cwd: path }),
  ]);

  // Where the branch left its base: the "before" of everything in the diff.
  const baseCommit = (await git(["merge-base", refs.base, "HEAD"], { cwd: path })).trim();

  const context = join(path, ".easy-review");
  await mkdir(context, { recursive: true });
  await Promise.all([
    Bun.write(join(context, "pr.diff"), diff),
    Bun.write(join(context, "commits.txt"), commits),
    Bun.write(join(context, "pr.md"), pr.description),
    Bun.write(join(context, "base-commit"), `${baseCommit}\n`),
  ]);

  return { path, headSha };
}

/** Removes the checkout; drops the PR's refs too when nothing else needs them. */
export async function removeWorktree(
  clonePath: string,
  worktreePath: string,
  number: number,
  dropRefs: boolean,
): Promise<void> {
  await git(["worktree", "remove", "--force", worktreePath], { cwd: clonePath }).catch(() => {});
  await rm(worktreePath, { recursive: true, force: true });
  await git(["worktree", "prune"], { cwd: clonePath }).catch(() => {});
  if (dropRefs) {
    const refs = prRefs(number);
    for (const ref of [refs.head, refs.base]) {
      await git(["update-ref", "-d", ref], { cwd: clonePath }).catch(() => {});
    }
  }
}
