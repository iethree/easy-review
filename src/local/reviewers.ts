/**
 * Reviewers: named review instructions, one Markdown file each in
 * ~/.easy-review/reviewers — so they can be edited in any editor, kept in a
 * dotfiles repo, or shared by copying a file.
 *
 *   ---
 *   name: Security
 *   ---
 *
 *   Look for injection, missing permission checks, …
 *
 * The file name is the reviewer's id, and stays put when it is renamed. A
 * file without the header is still a reviewer, named after the file.
 */

import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Reviewer } from "../shared/aiReview.ts";
import { BUILT_IN_REVIEWERS } from "./builtInReviewers.ts";
import { localPaths } from "./paths.ts";

export const REVIEWER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

const dir = () => localPaths().reviewers;
const fileOf = (id: string) => join(dir(), `${id}.md`);

export function parseReviewerFile(id: string, text: string): Reviewer {
  const header = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  let name = "";
  if (header) {
    for (const line of (header[1] ?? "").split("\n")) {
      const m = /^name:\s*(.*)$/.exec(line.trim());
      if (m) name = unquote(m[1] ?? "");
    }
  }
  const instructions = (header ? text.slice(header[0].length) : text).trim();
  return { id, name: name || titleFromId(id), instructions };
}

export function formatReviewerFile(reviewer: Pick<Reviewer, "name" | "instructions">): string {
  return `---\nname: ${reviewer.name.replace(/\n/g, " ").trim()}\n---\n\n${reviewer.instructions.trim()}\n`;
}

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, "$2");
}

function titleFromId(id: string): string {
  const words = id.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Security & Perf!" → "security-perf" — or "reviewer" when nothing's left. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    // Accents come apart from their letters under NFKD; drop them.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return slug || "reviewer";
}

/** Every reviewer, by name. */
export async function listReviewers(): Promise<Reviewer[]> {
  let files: string[];
  try {
    files = await readdir(dir());
  } catch {
    return [];
  }
  const reviewers = await Promise.all(
    files
      .filter((file) => file.endsWith(".md") && REVIEWER_ID.test(file.slice(0, -3)))
      .map(async (file) => parseReviewerFile(file.slice(0, -3), await Bun.file(join(dir(), file)).text())),
  );
  return reviewers.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function validate(input: { name?: unknown; instructions?: unknown }): { name: string; instructions: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const instructions = typeof input.instructions === "string" ? input.instructions : "";
  if (!name) throw new ReviewerError("A reviewer needs a name.");
  if (!instructions.trim()) throw new ReviewerError("A reviewer needs instructions.");
  return { name, instructions };
}

export class ReviewerError extends Error {}

export async function createReviewer(input: { name?: unknown; instructions?: unknown }): Promise<Reviewer> {
  const fields = validate(input);
  await mkdir(dir(), { recursive: true });
  const taken = new Set((await listReviewers()).map((r) => r.id));
  const base = slugify(fields.name);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  await Bun.write(fileOf(id), formatReviewerFile(fields));
  return { id, ...fields, instructions: fields.instructions.trim() };
}

export async function updateReviewer(
  id: string,
  input: { name?: unknown; instructions?: unknown },
): Promise<Reviewer> {
  if (!REVIEWER_ID.test(id) || !(await Bun.file(fileOf(id)).exists())) {
    throw new ReviewerError("No such reviewer.");
  }
  const fields = validate(input);
  await Bun.write(fileOf(id), formatReviewerFile(fields));
  return { id, ...fields, instructions: fields.instructions.trim() };
}

export async function deleteReviewer(id: string): Promise<void> {
  if (!REVIEWER_ID.test(id)) throw new ReviewerError("No such reviewer.");
  const all = await listReviewers();
  if (!all.some((r) => r.id === id)) throw new ReviewerError("No such reviewer.");
  if (all.length === 1) throw new ReviewerError("Keep at least one reviewer.");
  await rm(fileOf(id), { force: true });
}

/**
 * The first time, there are no reviewers: one called General takes over the
 * instructions from Settings, so whatever was written there carries on.
 *
 * And every time, any built-in reviewer not offered before is added — once.
 * A hidden file remembers which have been, so one you delete stays deleted,
 * and one you already have a file for is left as you made it.
 */
export async function seedReviewers(legacyInstructions: string): Promise<void> {
  let fresh = false;
  try {
    await readdir(dir());
  } catch {
    fresh = true;
  }
  if (fresh) {
    await mkdir(dir(), { recursive: true });
    await Bun.write(fileOf("general"), formatReviewerFile({ name: "General", instructions: legacyInstructions }));
  }

  const offeredFile = Bun.file(join(dir(), ".offered"));
  const offered = new Set(
    (await offeredFile.exists()) ? (await offeredFile.text()).split("\n").map((l) => l.trim()).filter(Boolean) : [],
  );
  const due = BUILT_IN_REVIEWERS.filter((r) => !offered.has(r.id));
  if (due.length === 0) return;
  for (const reviewer of due) {
    const file = Bun.file(fileOf(reviewer.id));
    if (!(await file.exists())) await Bun.write(file, formatReviewerFile(reviewer));
    offered.add(reviewer.id);
  }
  await Bun.write(offeredFile, `${[...offered].join("\n")}\n`);
}
