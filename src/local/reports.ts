/**
 * An HTML report a review makes — Tulip's page, say. Claude saves it in its
 * worktree as .easy-review/report/ (an index.html and the files it uses); when
 * the run ends it is copied next to the saved review, beside its screenshots,
 * and served from there to a sandboxed frame in the page.
 */

import { copyFile, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { localPaths } from "./paths.ts";

/** A plain name for a file or folder in a report: no dot-dot, nothing hidden. */
const SEGMENT = /^[\w-][\w.-]*$/;
const REVIEW_ID = /^[0-9a-f-]{36}$/;
const MAX_FILES = 300;
const MAX_BYTES = 60 * 1024 * 1024;
const MAX_DEPTH = 6;

const dirFor = (id: string) => join(localPaths().reviews, id, "report");

/**
 * Copies <worktree>/.easy-review/report into the review's folder, replacing
 * any earlier one, and says whether there's a report. Only real files and
 * folders with plain names: the folder sits in a checkout of someone else's
 * code, so a symlink there could point anywhere on this machine.
 */
export async function keepReport(worktreePath: string, id: string, since: Date): Promise<boolean> {
  if (!REVIEW_ID.test(id)) return false;
  const from = join(worktreePath, ".easy-review", "report");
  const index = await lstat(join(from, "index.html")).catch(() => null);
  // Not one left by an earlier review of the same commit, which shares the checkout.
  if (!index?.isFile() || index.mtime < since) return false;

  const to = dirFor(id);
  await rm(to, { recursive: true, force: true });
  const budget = { files: MAX_FILES, bytes: MAX_BYTES };
  await copyTree(from, to, 0, budget);
  return true;
}

async function copyTree(from: string, to: string, depth: number, budget: { files: number; bytes: number }) {
  if (depth > MAX_DEPTH) return;
  await mkdir(to, { recursive: true });
  const names = (await readdir(from).catch(() => [] as string[])).filter((n) => SEGMENT.test(n)).sort();
  for (const name of names) {
    const stat = await lstat(join(from, name)).catch(() => null);
    if (stat?.isDirectory()) {
      await copyTree(join(from, name), join(to, name), depth + 1, budget);
    } else if (stat?.isFile() && budget.files > 0 && stat.size <= budget.bytes) {
      await copyFile(join(from, name), join(to, name));
      budget.files -= 1;
      budget.bytes -= stat.size;
    }
  }
}

/** A review shows its report where its Markdown has a fenced block tagged report. */
export function placesReport(markdown: string): boolean {
  return /^ {0,3}(`{3,}|~{3,})report[ \t]*$/m.test(markdown);
}

/** One file of a kept report, by its path inside it; null for any path that isn't one. */
export async function reportFile(id: string, path: string): Promise<Bun.BunFile | null> {
  const segments = (path || "index.html").split("/");
  if (!REVIEW_ID.test(id) || segments.length > MAX_DEPTH + 1 || !segments.every((s) => SEGMENT.test(s))) {
    return null;
  }
  const full = join(dirFor(id), ...segments);
  const stat = await lstat(full).catch(() => null);
  return stat?.isFile() ? Bun.file(full) : null;
}

/**
 * What the page may do: run its own scripts and show its own files, in a
 * sandbox with no origin — so it can't read this app's data, call its API,
 * send anything anywhere, submit a form or leave its frame. Its files are
 * named by the server's origin: with no origin of its own, 'self' would
 * match nothing.
 */
export function reportCsp(origin: string): string {
  return [
    "sandbox allow-scripts",
    "default-src 'none'",
    `script-src ${origin}`,
    `style-src ${origin} 'unsafe-inline'`,
    `img-src ${origin} data:`,
    `font-src ${origin}`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
}

const META_CSP = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi;

/**
 * A report's page as served. A policy of its own in a <meta> — Tulip's names
 * its files as 'self' — would block them in the sandbox; reportCsp is as
 * strict throughout, and stricter about the network, so it stands alone.
 */
export async function servedPage(file: Bun.BunFile): Promise<string> {
  return (await file.text()).replace(META_CSP, "");
}
