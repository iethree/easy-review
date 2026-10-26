/**
 * The pull request checkouts that Claude reviews run in, as found on disk.
 *
 * Disk is the source of truth, not the saved reviews: a checkout can outlive
 * its review record — deleted, or left by an older version of the app — and
 * those are exactly the ones quietly taking up space.
 */

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  CHECKOUT_MAX_AGE_DAYS,
  isActive,
  type AiReviewJob,
  type Checkout,
} from "../shared/aiReview.ts";
import { localPaths } from "./paths.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** `pr-82101-1488e5ad56` → the pull request number and commit prefix. */
export function parseCheckoutDir(dirName: string): { number: number; sha: string } | null {
  const match = /^pr-(\d+)-([0-9a-f]{7,40})$/.exec(dirName);
  if (!match?.[1] || !match[2]) return null;
  return { number: Number(match[1]), sha: match[2] };
}

/** Unused for longer than the limit, and not in use right now. */
export function isStale(
  checkout: Pick<Checkout, "inUse" | "lastUsedAt">,
  now: number,
  maxAgeDays = CHECKOUT_MAX_AGE_DAYS,
): boolean {
  return !checkout.inUse && now - Date.parse(checkout.lastUsedAt) > maxAgeDays * DAY_MS;
}

/**
 * The clone a worktree belongs to, from its `.git` file
 * (`gitdir: <clone>/.git/worktrees/<name>`) — so a checkout with no review on
 * record can still be removed properly, through git.
 */
export async function cloneOf(worktreePath: string): Promise<string | null> {
  const text = await readFile(join(worktreePath, ".git"), "utf8").catch(() => null);
  const pointer = text?.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
  if (!pointer) return null;
  const gitdir = resolve(worktreePath, pointer);
  if (basename(dirname(gitdir)) !== "worktrees") return null;
  return dirname(dirname(dirname(gitdir)));
}

/** When a review last ran in its checkout. */
function usedAt(job: AiReviewJob): string {
  return [job.createdAt, job.startedAt, job.finishedAt]
    .filter((at): at is string => at !== null)
    // biome-ignore lint/complexity/useMathMinMax: ISO timestamps, compared as strings
    .reduce((latest, at) => (at > latest ? at : latest));
}

async function subdirs(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

/** Every checkout under ~/.easy-review/worktrees, most recently used first. */
export async function scanCheckouts(jobs: Iterable<AiReviewJob>): Promise<Checkout[]> {
  const byPath = new Map<string, AiReviewJob[]>();
  for (const job of jobs) {
    if (!job.worktreePath) continue;
    byPath.set(job.worktreePath, [...(byPath.get(job.worktreePath) ?? []), job]);
  }

  const root = localPaths().worktrees;
  const found: Checkout[] = [];

  for (const owner of await subdirs(root)) {
    for (const name of await subdirs(join(root, owner))) {
      for (const entry of await subdirs(join(root, owner, name))) {
        const parsed = parseCheckoutDir(entry);
        if (!parsed) continue;

        const path = join(root, owner, name, entry);
        const related = [...(byPath.get(path) ?? [])].sort((a, b) =>
          usedAt(b).localeCompare(usedAt(a)),
        );
        const latest = related[0];
        const changed = latest ? null : await stat(path).catch(() => null);
        if (!latest && !changed) continue; // removed while we looked

        const clone = related.find((job) => job.clonePath)?.clonePath ?? (await cloneOf(path));
        found.push({
          path,
          owner: latest?.owner ?? owner,
          name: latest?.name ?? name,
          number: parsed.number,
          sha: parsed.sha,
          title: latest?.title ?? null,
          lastUsedAt: latest ? usedAt(latest) : (changed as NonNullable<typeof changed>).mtime.toISOString(),
          inUse: related.some((job) => isActive(job.status)),
          reviews: related.length,
          // Resolved, so the same clone reached through a symlink compares equal.
          clonePath: clone ? await realpath(clone).catch(() => clone) : null,
          sizeBytes: null,
        });
      }
    }
  }

  return found.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}

/** Bytes on disk, from `du`; null if it can't be measured. */
export async function diskUsage(path: string): Promise<number | null> {
  const proc = Bun.spawn(["du", "-sk", path], { stdout: "pipe", stderr: "ignore" });
  const [out] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  // du still prints a total when a file or two can't be read, so trust the number.
  const kb = Number.parseInt(out, 10);
  return Number.isFinite(kb) ? kb * 1024 : null;
}
