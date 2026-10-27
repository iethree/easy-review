/**
 * Screenshots a review takes. Claude saves them in its worktree, under
 * .easy-review/screenshots; when the run ends they are copied next to the
 * saved review (~/.easy-review/reviews/<id>/), since the worktree is cleaned
 * up long before the review is — and served from there to the page.
 */

import { copyFile, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { localPaths } from "./paths.ts";

/** A plain file name of an image: no directories, nothing hidden. */
export const SCREENSHOT_NAME = /^[\w-][\w.-]*\.(png|jpe?g|webp)$/i;
const REVIEW_ID = /^[0-9a-f-]{36}$/;
const MAX_FILES = 60;
const MAX_BYTES = 15 * 1024 * 1024;

const dirFor = (id: string) => join(localPaths().reviews, id);

/**
 * Copies what the run left in <worktree>/.easy-review/screenshots, returning
 * the names kept. Only real files: the folder sits in a checkout of someone
 * else's code, so a symlink there could point anywhere on this machine.
 */
export async function keepScreenshots(worktreePath: string, id: string): Promise<string[]> {
  if (!REVIEW_ID.test(id)) return [];
  const from = join(worktreePath, ".easy-review", "screenshots");
  let names: string[];
  try {
    names = (await readdir(from)).filter((n) => SCREENSHOT_NAME.test(n)).sort();
  } catch {
    return [];
  }
  const kept: string[] = [];
  for (const name of names) {
    if (kept.length >= MAX_FILES) break;
    const stat = await lstat(join(from, name)).catch(() => null);
    if (!stat?.isFile() || stat.size > MAX_BYTES) continue;
    await mkdir(dirFor(id), { recursive: true });
    await copyFile(join(from, name), join(dirFor(id), name));
    kept.push(name);
  }
  return kept;
}

/** One kept screenshot, or null for any name that isn't one. */
export async function screenshotFile(id: string, name: string): Promise<Bun.BunFile | null> {
  if (!REVIEW_ID.test(id) || !SCREENSHOT_NAME.test(name)) return null;
  const file = Bun.file(join(dirFor(id), name));
  return (await file.exists()) ? file : null;
}

export async function dropScreenshots(id: string): Promise<void> {
  if (REVIEW_ID.test(id)) await rm(dirFor(id), { recursive: true, force: true });
}
